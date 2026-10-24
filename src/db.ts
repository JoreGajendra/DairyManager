import * as SQLite from 'expo-sqlite'
import { isLang, plannedOn, todayIso, tr } from './lib'
import type { Allocation, IsoDate, IsoMonth, Lang, MonthBill, Pause } from './lib'
import { MIGRATIONS } from './migrations'
import {
  BACKUP_ORDER,
  BACKUP_TABLES,
  accountOf,
  allDues,
  billMonth,
  bookOf,
  bulkRateRows,
  checkPayment,
  newCustomerRows,
  normaliseDayEntries,
  parseBackup,
  pauseProblem,
  rateSeedsForDay,
  routeFor,
  serialiseBackup,
} from './dataHelpers'
import type {
  AllDues,
  Backup,
  BackupRow,
  BulkRateInput,
  Customer,
  CustomerAccount,
  CustomerCreditUse,
  CustomerEntry,
  CustomerPause,
  CustomerPayment,
  CustomerPlan,
  CustomerRate,
  MilkTypeRow,
  NewCustomerMilk,
  Raw,
  RouteStop,
} from './dataHelpers'

/**
 * Everything the provider keeps, in one SQLite file on the phone. There is no
 * server: this file is the only copy, which is why Setup offers a backup.
 *
 * Money is whole paise and milk whole millilitres. A rate or daily plan is never
 * edited in place; a new one is added with the date it starts from, and the bill
 * engine picks whichever was in force on each day. Rates and plans are per
 * customer. The pure decisions live in `dataHelpers.ts`.
 */

let opening: Promise<SQLite.SQLiteDatabase> | null = null

/** The one connection, opened and brought up to date on first use. */
export function db(): Promise<SQLite.SQLiteDatabase> {
  opening ??= (async () => {
    const conn = await SQLite.openDatabaseAsync('milkdiary-provider.db')
    await conn.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
    const row = await conn.getFirstAsync<{ user_version: number }>('PRAGMA user_version')
    for (let v = row?.user_version ?? 0; v < MIGRATIONS.length; v++) {
      await conn.withExclusiveTransactionAsync(async (txn) => {
        await txn.execAsync(MIGRATIONS[v]!)
        await txn.execAsync(`PRAGMA user_version = ${v + 1}`)
      })
    }
    return conn
  })()
  return opening
}

type Conn = Pick<SQLite.SQLiteDatabase, 'getAllAsync' | 'getFirstAsync' | 'runAsync' | 'execAsync'>

// ------------------------------------------------------------------- settings

export interface Settings {
  businessName: string
  /** The provider's number, as typed. */
  businessPhone: string
  /** The language of every screen, bill and message. */
  language: Lang
}

const languageOf = (value: string): Lang => (isLang(value) ? value : 'en')

const UPSERT_SETTING = 'INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'

/** The saved language, read before the first screen so it is drawn in the right one. */
export async function loadLanguage(): Promise<Lang> {
  const row = await (await db()).getFirstAsync<{ value: string }>("SELECT value FROM setting WHERE key = 'language'")
  return languageOf(row?.value ?? '')
}

export async function saveLanguage(language: Lang): Promise<void> {
  await (await db()).runAsync(UPSERT_SETTING, ['language', language])
}

/** Name and phone; the language is saved on its own by `saveLanguage`. */
export async function saveSettings(settings: Omit<Settings, 'language'>): Promise<void> {
  const conn = await db()
  await conn.withExclusiveTransactionAsync(async (txn) => {
    for (const [key, value] of Object.entries(settings)) await txn.runAsync(UPSERT_SETTING, [key, value.trim()])
  })
}

// -------------------------------------------------------------------- loaders

const SQL = {
  types: 'SELECT id, name, sort, active, default_paise_per_litre AS defaultPaisePerLitre FROM milk_type ORDER BY sort, id',
  customers:
    'SELECT id, name, phone, address, route_order AS routeOrder, active, created_on AS createdOn FROM customer ORDER BY route_order, id',
  rates: 'SELECT customer_id AS customerId, milk_type_id AS milkTypeId, paise_per_litre AS paisePerLitre, effective_from AS effectiveFrom FROM rate',
  plans: 'SELECT customer_id AS customerId, milk_type_id AS milkTypeId, qty_ml AS qtyMl, effective_from AS effectiveFrom FROM plan',
  entries: 'SELECT customer_id AS customerId, date, milk_type_id AS milkTypeId, qty_ml AS qtyMl FROM day_entry',
  pauses: 'SELECT id, customer_id AS customerId, from_date AS "from", resume_on AS resumeOn FROM pause ORDER BY from_date',
  payments: 'SELECT id, customer_id AS customerId, paid_on AS paidOn, amount_paise AS amountPaise, note FROM payment',
  allocations: 'SELECT payment_id AS paymentId, month, amount_paise AS amountPaise FROM payment_month ORDER BY month',
  uses: 'SELECT id, customer_id AS customerId, month, amount_paise AS amountPaise, used_on AS usedOn FROM credit_use',
}

/** Reads every billing table whole. */
async function loadRaw(conn: Conn): Promise<Raw> {
  const [types, customers, rates, plans, entries, pauses, payments, allocations, uses] = await Promise.all([
    conn.getAllAsync<Omit<MilkTypeRow, 'active'> & { active: number }>(SQL.types),
    conn.getAllAsync<Omit<Customer, 'active'> & { active: number }>(SQL.customers),
    conn.getAllAsync<CustomerRate>(SQL.rates),
    conn.getAllAsync<CustomerPlan>(SQL.plans),
    conn.getAllAsync<CustomerEntry>(SQL.entries),
    conn.getAllAsync<CustomerPause>(SQL.pauses),
    conn.getAllAsync<Omit<CustomerPayment, 'allocations' | 'screenshot'>>(SQL.payments),
    conn.getAllAsync<Allocation & { paymentId: number }>(SQL.allocations),
    conn.getAllAsync<CustomerCreditUse>(SQL.uses),
  ])
  return {
    types: types.map((t) => ({ ...t, active: t.active === 1 })),
    customers: customers.map((c) => ({ ...c, active: c.active === 1 })),
    rates,
    plans,
    entries,
    pauses,
    payments: payments.map((p) => ({
      ...p,
      screenshot: null,
      allocations: allocations.filter((a) => a.paymentId === p.id).map(({ month, amountPaise }) => ({ month, amountPaise })),
    })),
    uses,
  }
}

async function readSettings(conn: Conn): Promise<Settings> {
  const rows = await conn.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM setting')
  const get = (key: string) => rows.find((s) => s.key === key)?.value ?? ''
  return { businessName: get('businessName'), businessPhone: get('businessPhone'), language: languageOf(get('language')) }
}

/** Milk types, all customers (route order) and the business settings. */
export interface Setup {
  types: MilkTypeRow[]
  customers: Customer[]
  settings: Settings
}

export async function loadSetup(): Promise<Setup> {
  const conn = await db()
  const raw = await loadRaw(conn)
  return { types: raw.types, customers: raw.customers, settings: await readSettings(conn) }
}

/** One customer with their rates, plans, pauses, and the whole account up to today. */
export interface CustomerData extends CustomerAccount {
  setup: Setup
  customer: Customer
  rates: CustomerRate[]
  plans: CustomerPlan[]
  /** Oldest first. */
  pauses: CustomerPause[]
  entries: CustomerEntry[]
}

export async function loadCustomer(customerId: number): Promise<CustomerData | null> {
  const conn = await db()
  const [raw, settings] = await Promise.all([loadRaw(conn), readSettings(conn)])
  const customer = raw.customers.find((c) => c.id === customerId)
  if (!customer) return null
  const book = bookOf(raw, customerId)
  const account = accountOf(book, raw.types, todayIso())
  return {
    ...account,
    setup: { types: raw.types, customers: raw.customers, settings },
    customer,
    rates: book.rates,
    plans: book.plans,
    pauses: book.pauses,
    entries: book.entries,
  }
}

export interface MonthData {
  setup: Setup
  customer: Customer
  bill: MonthBill
  /** This month's exceptions only. */
  entries: CustomerEntry[]
  /** Days ticked as delivered (route progress, not billing). */
  ticks: IsoDate[]
}

/** One customer's month, billed up to today. */
export async function loadMonth(customerId: number, month: IsoMonth): Promise<MonthData | null> {
  const conn = await db()
  const [raw, settings, ticks] = await Promise.all([
    loadRaw(conn),
    readSettings(conn),
    conn.getAllAsync<{ date: string }>('SELECT date FROM tick WHERE customer_id = ? AND date LIKE ? ORDER BY date', [customerId, `${month}-%`]),
  ])
  const customer = raw.customers.find((c) => c.id === customerId)
  if (!customer) return null
  const book = bookOf(raw, customerId)
  return {
    setup: { types: raw.types, customers: raw.customers, settings },
    customer,
    bill: billMonth(book, raw.types, month, todayIso()),
    entries: book.entries.filter((e) => e.date.startsWith(month)),
    ticks: ticks.map((t) => t.date),
  }
}

/** Bills, payments and balance of one customer: `CustomerData` under its ledger name. */
export const loadLedger = loadCustomer

/** Every customer's outstanding balance, one `monthBill`/`ledger` run per customer. */
export async function loadAllDues(): Promise<AllDues & { setup: Setup }> {
  const conn = await db()
  const [raw, settings] = await Promise.all([loadRaw(conn), readSettings(conn)])
  return { ...allDues(raw, todayIso()), setup: { types: raw.types, customers: raw.customers, settings } }
}

/** The delivery round for one date: active customers in route order with planned and delivered quantities, and who is ticked. */
export async function loadRoute(date: IsoDate): Promise<{ setup: Setup; stops: RouteStop[] }> {
  const conn = await db()
  const [raw, settings, ticks] = await Promise.all([
    loadRaw(conn),
    readSettings(conn),
    conn.getAllAsync<{ customerId: number; date: string }>('SELECT customer_id AS customerId, date FROM tick WHERE date = ?', [date]),
  ])
  return { setup: { types: raw.types, customers: raw.customers, settings }, stops: routeFor(raw, ticks, date) }
}

// ------------------------------------------------------------------ customers

export interface NewCustomer {
  name: string
  phone: string
  address: string
  /** First day of the plan and rate rows. */
  startDate: IsoDate
  milks: NewCustomerMilk[]
}

/** Adds a customer at the end of the route, seeding rate and plan rows (rate from the milk type's default when not given). */
export async function addCustomer(input: NewCustomer): Promise<number> {
  if (!input.name.trim()) throw new Error(tr('Enter the customer name.'))
  const conn = await db()
  let id = 0
  await conn.withExclusiveTransactionAsync(async (txn) => {
    const next = await txn.getFirstAsync<{ n: number }>('SELECT COALESCE(MAX(route_order), 0) + 1 AS n FROM customer')
    id = (
      await txn.runAsync(
        'INSERT INTO customer (name, phone, address, route_order, created_on) VALUES (?, ?, ?, ?, ?)',
        [input.name.trim(), input.phone.trim(), input.address.trim(), next?.n ?? 1, input.startDate],
      )
    ).lastInsertRowId
    const defaults = new Map(
      (await txn.getAllAsync<{ id: number; d: number }>('SELECT id, default_paise_per_litre AS d FROM milk_type')).map((t) => [t.id, t.d]),
    )
    const rows = newCustomerRows(id, input.milks, defaults, input.startDate)
    for (const r of rows.rates) await insertRate(txn, r)
    for (const p of rows.plans) await insertPlan(txn, p)
  })
  return id
}

/** Name, phone and address. Milks, quantities and rates change through `setPlan` / `setRate`. */
export async function editCustomer(id: number, fields: { name: string; phone: string; address: string }): Promise<void> {
  if (!fields.name.trim()) throw new Error(tr('Enter the customer name.'))
  await (await db()).runAsync('UPDATE customer SET name = ?, phone = ?, address = ? WHERE id = ?', [
    fields.name.trim(),
    fields.phone.trim(),
    fields.address.trim(),
    id,
  ])
}

/**
 * Stops a customer, never deletes: old months still bill. Bills follow the plan,
 * not the flag, so every milk they take is set to 0 from `from`.
 */
export async function deactivateCustomer(id: number, from: IsoDate): Promise<void> {
  const conn = await db()
  await conn.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE customer SET active = 0 WHERE id = ?', [id])
    const milks = await txn.getAllAsync<{ milkTypeId: number }>('SELECT DISTINCT milk_type_id AS milkTypeId FROM plan WHERE customer_id = ?', [id])
    for (const m of milks) await insertPlan(txn, { customerId: id, milkTypeId: m.milkTypeId, qtyMl: 0, effectiveFrom: from })
  })
}

/** Back on the route. The plan is left for the person to set (it stays 0 until then). */
export async function reactivateCustomer(id: number): Promise<void> {
  await (await db()).runAsync('UPDATE customer SET active = 1 WHERE id = ?', [id])
}

/** Route order = position in `orderedIds` (1-based). Customers not listed keep their order after the listed ones. */
export async function setRouteOrder(orderedIds: number[]): Promise<void> {
  const conn = await db()
  await conn.withExclusiveTransactionAsync(async (txn) => {
    const rest = (await txn.getAllAsync<{ id: number }>('SELECT id FROM customer ORDER BY route_order, id'))
      .map((r) => r.id)
      .filter((id) => !orderedIds.includes(id))
    let n = 1
    for (const id of [...orderedIds, ...rest]) await txn.runAsync('UPDATE customer SET route_order = ? WHERE id = ?', [n++, id])
  })
}

// ----------------------------------------------------------------- milk types

/** A new milk type; `defaultPaisePerLitre` only seeds new customers. */
export async function addMilkType(name: string, defaultPaisePerLitre: number): Promise<number> {
  if (!name.trim()) throw new Error(tr('Enter the milk name.'))
  if (!Number.isInteger(defaultPaisePerLitre) || defaultPaisePerLitre < 0) throw new Error(tr('Rate must be a whole number of paise.'))
  const conn = await db()
  let id = 0
  await conn.withExclusiveTransactionAsync(async (txn) => {
    const next = await txn.getFirstAsync<{ n: number }>('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM milk_type')
    id = (
      await txn.runAsync('INSERT INTO milk_type (name, sort, default_paise_per_litre) VALUES (?, ?, ?)', [name.trim(), next?.n ?? 1, defaultPaisePerLitre])
    ).lastInsertRowId
  })
  return id
}

export async function renameMilkType(id: number, name: string): Promise<void> {
  await (await db()).runAsync('UPDATE milk_type SET name = ? WHERE id = ?', [name.trim(), id])
}

/** Changes only what a *new* customer starts at; existing customers' rates are untouched. */
export async function setMilkTypeDefaultRate(id: number, defaultPaisePerLitre: number): Promise<void> {
  if (!Number.isInteger(defaultPaisePerLitre) || defaultPaisePerLitre < 0) throw new Error(tr('Rate must be a whole number of paise.'))
  await (await db()).runAsync('UPDATE milk_type SET default_paise_per_litre = ? WHERE id = ?', [defaultPaisePerLitre, id])
}

/** A milk is hidden from pickers, never deleted: past months still bill it. */
export async function setMilkTypeActive(id: number, active: boolean): Promise<void> {
  await (await db()).runAsync('UPDATE milk_type SET active = ? WHERE id = ?', [active ? 1 : 0, id])
}

// --------------------------------------------------------------- rates & plans

async function insertRate(conn: Conn, r: CustomerRate): Promise<void> {
  await conn.runAsync(
    'INSERT INTO rate (customer_id, milk_type_id, effective_from, paise_per_litre) VALUES (?, ?, ?, ?) ON CONFLICT (customer_id, milk_type_id, effective_from) DO UPDATE SET paise_per_litre = excluded.paise_per_litre',
    [r.customerId, r.milkTypeId, r.effectiveFrom, r.paisePerLitre],
  )
}

async function insertPlan(conn: Conn, p: CustomerPlan): Promise<void> {
  await conn.runAsync(
    'INSERT INTO plan (customer_id, milk_type_id, effective_from, qty_ml) VALUES (?, ?, ?, ?) ON CONFLICT (customer_id, milk_type_id, effective_from) DO UPDATE SET qty_ml = excluded.qty_ml',
    [p.customerId, p.milkTypeId, p.effectiveFrom, p.qtyMl],
  )
}

/** A new rate for one customer from a date (adds a row; the same date again replaces that row). */
export async function setRate(customerId: number, milkTypeId: number, from: IsoDate, paisePerLitre: number): Promise<void> {
  if (!Number.isInteger(paisePerLitre) || paisePerLitre < 0) throw new Error(tr('Rate must be a whole number of paise.'))
  await insertRate(await db(), { customerId, milkTypeId, effectiveFrom: from, paisePerLitre })
}

/** A new daily quantity for one customer from a date (adds a row; the same date again replaces that row). */
export async function setPlan(customerId: number, milkTypeId: number, from: IsoDate, qtyMl: number): Promise<void> {
  if (!Number.isInteger(qtyMl) || qtyMl < 0) throw new Error(tr('Quantity must be a whole number of millilitres.'))
  await insertPlan(await db(), { customerId, milkTypeId, effectiveFrom: from, qtyMl })
}

/**
 * Bulk "change rate from date": one new rate row per customer that buys the
 * milk (all active ones, or the `customerIds` given). Returns how many were written.
 */
export async function bulkRateChange(input: BulkRateInput & { alsoSetDefault?: boolean }): Promise<number> {
  const conn = await db()
  let written = 0
  await conn.withExclusiveTransactionAsync(async (txn) => {
    const [customers, rates, plans] = await Promise.all([
      txn.getAllAsync<{ id: number; active: number }>('SELECT id, active FROM customer'),
      txn.getAllAsync<CustomerRate>(SQL.rates),
      txn.getAllAsync<CustomerPlan>(SQL.plans),
    ])
    const rows = bulkRateRows(input, customers.map((c) => ({ id: c.id, active: c.active === 1 })), rates, plans)
    for (const r of rows) await insertRate(txn, r)
    if (input.alsoSetDefault) await txn.runAsync('UPDATE milk_type SET default_paise_per_litre = ? WHERE id = ?', [input.paisePerLitre, input.milkTypeId])
    written = rows.length
  })
  return written
}

// ----------------------------------------------------------------- day entries

/**
 * Writes one customer's day. Only exceptions are stored: a quantity equal to the
 * plan in force (pauses applied) deletes the row. Ticks are separate.
 */
export async function saveDay(customerId: number, date: IsoDate, items: { milkTypeId: number; qtyMl: number }[]): Promise<void> {
  const conn = await db()
  await conn.withExclusiveTransactionAsync(async (txn) => {
    const [plans, pauses, rates, types] = await Promise.all([
      txn.getAllAsync<CustomerPlan>(`${SQL.plans} WHERE customer_id = ?`, [customerId]),
      txn.getAllAsync<CustomerPause>(`SELECT id, customer_id AS customerId, from_date AS "from", resume_on AS resumeOn FROM pause WHERE customer_id = ?`, [customerId]),
      txn.getAllAsync<CustomerRate>(`${SQL.rates} WHERE customer_id = ?`, [customerId]),
      txn.getAllAsync<{ id: number; defaultPaisePerLitre: number }>('SELECT id, default_paise_per_litre AS defaultPaisePerLitre FROM milk_type'),
    ])
    const writes = normaliseDayEntries(
      items.map((i) => ({ ...i, plannedMl: plannedOn(plans, pauses, i.milkTypeId, date) })),
    )
    for (const r of rateSeedsForDay(rates, types, writes.upserts, date)) await insertRate(txn, { ...r, customerId })
    for (const id of writes.deletes) {
      await txn.runAsync('DELETE FROM day_entry WHERE customer_id = ? AND date = ? AND milk_type_id = ?', [customerId, date, id])
    }
    for (const u of writes.upserts) {
      await txn.runAsync(
        'INSERT INTO day_entry (customer_id, date, milk_type_id, qty_ml) VALUES (?, ?, ?, ?) ON CONFLICT (customer_id, date, milk_type_id) DO UPDATE SET qty_ml = excluded.qty_ml',
        [customerId, date, u.milkTypeId, u.qtyMl],
      )
    }
  })
}

/** Marks a customer delivered (or not) on a date. Route progress only: bills ignore it. */
export async function setTick(customerId: number, date: IsoDate, ticked: boolean): Promise<void> {
  const conn = await db()
  if (ticked) await conn.runAsync('INSERT OR IGNORE INTO tick (customer_id, date) VALUES (?, ?)', [customerId, date])
  else await conn.runAsync('DELETE FROM tick WHERE customer_id = ? AND date = ?', [customerId, date])
}

// ---------------------------------------------------------------------- pauses

async function pausesOf(conn: Conn, customerId: number): Promise<Pause[]> {
  return conn.getAllAsync<Pause>('SELECT id, from_date AS "from", resume_on AS resumeOn FROM pause WHERE customer_id = ?', [customerId])
}

/** Stops delivery to one customer from `from` (inclusive) until `resumeOn`, or until resumed. Refuses an overlap. */
export async function addPause(customerId: number, from: IsoDate, resumeOn: IsoDate | null): Promise<void> {
  const conn = await db()
  await conn.withExclusiveTransactionAsync(async (txn) => {
    const problem = pauseProblem(await pausesOf(txn, customerId), { from, resumeOn })
    if (problem) throw new Error(problem)
    await txn.runAsync('INSERT INTO pause (customer_id, from_date, resume_on) VALUES (?, ?, ?)', [customerId, from, resumeOn])
  })
}

/** Sets the day milk comes again. Resuming on the pause's own first day removes it. */
export async function resumePause(customerId: number, pause: Pause, resumeOn: IsoDate | null): Promise<void> {
  const conn = await db()
  if (resumeOn !== null && resumeOn <= pause.from) {
    await conn.runAsync('DELETE FROM pause WHERE id = ? AND customer_id = ?', [pause.id, customerId])
    return
  }
  await conn.withExclusiveTransactionAsync(async (txn) => {
    const problem = pauseProblem(await pausesOf(txn, customerId), { from: pause.from, resumeOn }, pause.id)
    if (problem) throw new Error(problem)
    await txn.runAsync('UPDATE pause SET resume_on = ? WHERE id = ? AND customer_id = ?', [resumeOn, pause.id, customerId])
  })
}

export async function deletePause(id: number): Promise<void> {
  await (await db()).runAsync('DELETE FROM pause WHERE id = ?', [id])
}

// -------------------------------------------------------------------- payments

/**
 * Records one payment and the months it is for. Build `allocations` with
 * `allocatePayment` (splitPayment); an empty list is plain credit, and an
 * amount beyond the months ticked is an advance on the newest of them.
 */
export async function addPayment(
  customerId: number,
  paidOn: IsoDate,
  amountPaise: number,
  note: string,
  allocations: Allocation[],
): Promise<number> {
  checkPayment(amountPaise, allocations)
  const conn = await db()
  let id = 0
  await conn.withExclusiveTransactionAsync(async (txn) => {
    id = (
      await txn.runAsync('INSERT INTO payment (customer_id, paid_on, amount_paise, note) VALUES (?, ?, ?, ?)', [customerId, paidOn, amountPaise, note.trim()])
    ).lastInsertRowId
    for (const a of allocations) {
      await txn.runAsync('INSERT INTO payment_month (payment_id, month, amount_paise) VALUES (?, ?, ?)', [id, a.month, a.amountPaise])
    }
  })
  return id
}

export async function deletePayment(paymentId: number): Promise<void> {
  const conn = await db()
  await conn.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM payment_month WHERE payment_id = ?', [paymentId])
    await txn.runAsync('DELETE FROM payment WHERE id = ?', [paymentId])
  })
}

/** Puts `amountPaise` of the customer's credit on `month`'s bill, as if paid towards it (see `creditToUse`). */
export async function applyCredit(customerId: number, month: IsoMonth, amountPaise: number): Promise<void> {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw new Error(tr('Enter an amount above zero.'))
  await (await db()).runAsync('INSERT INTO credit_use (customer_id, month, amount_paise, used_on) VALUES (?, ?, ?, ?)', [
    customerId,
    month,
    amountPaise,
    todayIso(),
  ])
}

// ---------------------------------------------------------------------- backup

/** Every table as plain rows, for the backup file. */
export async function exportBackup(): Promise<Backup> {
  const conn = await db()
  const rows: Partial<Record<(typeof BACKUP_ORDER)[number], BackupRow[]>> = {}
  for (const t of BACKUP_ORDER) rows[t] = await conn.getAllAsync<BackupRow>(`SELECT ${Object.keys(BACKUP_TABLES[t]).join(', ')} FROM ${t}`)
  return serialiseBackup(rows, MIGRATIONS.length, new Date().toISOString())
}

export async function exportBackupJson(): Promise<string> {
  return JSON.stringify(await exportBackup())
}

/**
 * Replaces everything on the phone with the backup, all or nothing. The text is
 * checked first; a bad file changes nothing.
 */
export async function importBackupJson(text: string): Promise<void> {
  const backup = parseBackup(text, MIGRATIONS.length)
  const conn = await db()
  await conn.withExclusiveTransactionAsync(async (txn) => {
    for (const t of [...BACKUP_ORDER].reverse()) await txn.runAsync(`DELETE FROM ${t}`)
    for (const t of BACKUP_ORDER) {
      const cols = Object.keys(BACKUP_TABLES[t])
      const sql = `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
      for (const row of backup.tables[t]) await txn.runAsync(sql, cols.map((c) => row[c] ?? null))
    }
  })
}
