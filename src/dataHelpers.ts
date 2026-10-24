/**
 * Pure helpers behind `db.ts`: no SQL, no expo. Everything that decides what
 * gets written (or what a pile of rows adds up to) lives here so vitest can
 * cover it. Money is whole paise, milk whole millilitres, dates `YYYY-MM-DD`.
 */
import { addMonths, dateLabel, inForce, ledger, monthBill, monthOf, outstanding, pausesOverlap, plannedOn, splitPayment, tr } from './lib';
import type {
  Allocation,
  CreditUse,
  DayEntry,
  IsoDate,
  IsoMonth,
  Ledger,
  MilkType,
  MonthBill,
  Outstanding,
  Pause,
  Payment,
  Plan,
  Rate,
} from './lib';

// ---------------------------------------------------------------- row shapes

export interface MilkTypeRow extends MilkType {
  sort: number
  defaultPaisePerLitre: number
}

export interface Customer {
  id: number
  name: string
  phone: string
  address: string
  routeOrder: number
  active: boolean
  createdOn: IsoDate
}

type ForCustomer<T> = T & { customerId: number }
export type CustomerRate = ForCustomer<Rate>
export type CustomerPlan = ForCustomer<Plan>
export type CustomerEntry = ForCustomer<DayEntry>
export type CustomerPause = ForCustomer<Pause>
/** `txnRef`: the customer's transaction number, if they gave one. `screenshot`: file name in the app's documents folder. */
export type PaymentRecord = Payment & { txnRef?: string }
export type CustomerPayment = ForCustomer<PaymentRecord>
export type CustomerCreditUse = ForCustomer<CreditUse & { id: number; usedOn: IsoDate }>

/** Every row of the billing tables, whole. The tables are small. */
export interface Raw {
  types: MilkTypeRow[]
  customers: Customer[]
  rates: CustomerRate[]
  plans: CustomerPlan[]
  entries: CustomerEntry[]
  pauses: CustomerPause[]
  payments: CustomerPayment[]
  uses: CustomerCreditUse[]
}

/** One customer's rows: exactly what `monthBill` and `ledger` take. */
export interface Book {
  customerId: number
  rates: CustomerRate[]
  plans: CustomerPlan[]
  entries: CustomerEntry[]
  pauses: CustomerPause[]
  payments: CustomerPayment[]
  uses: CustomerCreditUse[]
}

export function bookOf(raw: Raw, customerId: number): Book {
  const mine = <T extends { customerId: number }>(rows: T[]) => rows.filter((r) => r.customerId === customerId)
  return {
    customerId,
    rates: mine(raw.rates),
    plans: mine(raw.plans),
    entries: mine(raw.entries),
    pauses: mine(raw.pauses),
    payments: mine(raw.payments),
    uses: mine(raw.uses),
  }
}

// -------------------------------------------------------------------- pauses

/** The existing pause that shares a day with `next`, ignoring the one being changed. */
export function findPauseOverlap(pauses: Pause[], next: Omit<Pause, 'id'>, exceptId?: number): Pause | undefined {
  return pauses.find((p) => p.id !== exceptId && pausesOverlap(p, next))
}

/** The message for an overlap, or null when the new stretch is fine. Also checks the dates. */
export function pauseProblem(pauses: Pause[], next: Omit<Pause, 'id'>, exceptId?: number): string | null {
  if (next.resumeOn !== null && next.resumeOn <= next.from) return tr('The resume date must be after the first paused day.')
  const clash = findPauseOverlap(pauses, next, exceptId)
  if (!clash) return null
  return clash.resumeOn
    ? tr('Delivery is already paused from {from} until {to}. Change that pause instead.', { from: dateLabel(clash.from), to: dateLabel(clash.resumeOn) })
    : tr('Delivery is already paused from {from}. Change that pause instead.', { from: dateLabel(clash.from) })
}

// ---------------------------------------------------------------- day entries

export interface DayItemInput {
  milkTypeId: number
  qtyMl: number
  /** What the plan (with pauses) gives that day. */
  plannedMl: number
}

export interface DayWrites {
  upserts: { milkTypeId: number; qtyMl: number }[]
  /** Milk types whose stored exception must be removed (quantity equals the plan). */
  deletes: number[]
}

/** Only exceptions are stored: a quantity equal to the plan deletes the row. */
export function normaliseDayEntries(items: DayItemInput[]): DayWrites {
  const out: DayWrites = { upserts: [], deletes: [] }
  const seen = new Set<number>()
  for (const i of items) {
    if (!Number.isInteger(i.qtyMl) || i.qtyMl < 0) throw new Error(tr('Quantity must be a whole number of millilitres.'))
    if (seen.has(i.milkTypeId)) throw new Error(tr('Each milk can be given only once a day.'))
    seen.add(i.milkTypeId)
    if (i.qtyMl === i.plannedMl) out.deletes.push(i.milkTypeId)
    else out.upserts.push({ milkTypeId: i.milkTypeId, qtyMl: i.qtyMl })
  }
  return out
}

/**
 * Rates to add so milk given on `date` is priced: a milk the customer has no
 * rate for yet (one-off or replacement milk) starts at the milk's default rate
 * from that date. A rate already in force is never touched.
 */
export function rateSeedsForDay(
  rates: Rate[],
  types: { id: number; defaultPaisePerLitre: number }[],
  upserts: { milkTypeId: number; qtyMl: number }[],
  date: IsoDate,
): Rate[] {
  return upserts
    .filter((u) => u.qtyMl > 0 && !inForce(rates, u.milkTypeId, date))
    .flatMap((u) => {
      const type = types.find((t) => t.id === u.milkTypeId)
      return type ? [{ milkTypeId: u.milkTypeId, paisePerLitre: type.defaultPaisePerLitre, effectiveFrom: date }] : []
    })
}

// --------------------------------------------------------------- rates / plans

export interface NewCustomerMilk {
  milkTypeId: number
  qtyMl: number
  /** Omitted: seeded from the milk type's default rate. */
  paisePerLitre?: number
}

/** The first rate and plan rows of a new customer. */
export function newCustomerRows(
  customerId: number,
  items: NewCustomerMilk[],
  defaults: Map<number, number> | Record<number, number>,
  from: IsoDate,
): { rates: CustomerRate[]; plans: CustomerPlan[] } {
  const defaultOf = (id: number) => (defaults instanceof Map ? defaults.get(id) : defaults[id]) ?? 0
  const rates: CustomerRate[] = []
  const plans: CustomerPlan[] = []
  for (const i of items) {
    const paise = i.paisePerLitre ?? defaultOf(i.milkTypeId)
    if (!Number.isInteger(paise) || paise < 0) throw new Error(tr('Rate must be a whole number of paise.'))
    if (!Number.isInteger(i.qtyMl) || i.qtyMl < 0) throw new Error(tr('Quantity must be a whole number of millilitres.'))
    rates.push({ customerId, milkTypeId: i.milkTypeId, paisePerLitre: paise, effectiveFrom: from })
    plans.push({ customerId, milkTypeId: i.milkTypeId, qtyMl: i.qtyMl, effectiveFrom: from })
  }
  return { rates, plans }
}

export interface BulkRateInput {
  milkTypeId: number
  from: IsoDate
  paisePerLitre: number
  /** Omitted: every active customer who buys this milk. */
  customerIds?: number[]
}

/**
 * Rate rows for a bulk "change rate from date". Only customers who actually
 * have a plan or rate for this milk get one; inactive customers are skipped
 * unless named explicitly.
 */
export function bulkRateRows(
  input: BulkRateInput,
  customers: Pick<Customer, 'id' | 'active'>[],
  rates: Pick<CustomerRate, 'customerId' | 'milkTypeId'>[],
  plans: Pick<CustomerPlan, 'customerId' | 'milkTypeId'>[],
): CustomerRate[] {
  if (!Number.isInteger(input.paisePerLitre) || input.paisePerLitre < 0) throw new Error(tr('Rate must be a whole number of paise.'))
  const buys = new Set<number>()
  for (const r of [...rates, ...plans]) if (r.milkTypeId === input.milkTypeId) buys.add(r.customerId)
  const chosen = input.customerIds
    ? new Set(input.customerIds)
    : new Set(customers.filter((c) => c.active).map((c) => c.id))
  return customers
    .filter((c) => chosen.has(c.id) && buys.has(c.id))
    .map((c) => ({ customerId: c.id, milkTypeId: input.milkTypeId, paisePerLitre: input.paisePerLitre, effectiveFrom: input.from }))
}

// ------------------------------------------------------------------- payments

/** Splits a payment over the ticked months (see `splitPayment`); none ticked means plain credit. */
export function allocatePayment(amountPaise: number, selected: { month: IsoMonth; duePaise: number }[]): Allocation[] {
  return selected.length ? splitPayment(amountPaise, selected) : []
}

/** Throws when a payment cannot be stored as given. */
export function checkPayment(amountPaise: number, allocations: Allocation[]): void {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw new Error(tr('Enter an amount above zero.'))
  const months = new Set<string>()
  let sum = 0
  for (const a of allocations) {
    if (!Number.isInteger(a.amountPaise) || a.amountPaise <= 0) throw new Error(tr('Each month needs an amount above zero.'))
    if (months.has(a.month)) throw new Error(tr('A month can appear only once in a payment.'))
    months.add(a.month)
    sum += a.amountPaise
  }
  if (sum > amountPaise) throw new Error(tr('The months add up to more than the amount paid.'))
}

// ------------------------------------------------------------- bills & ledgers

/** One customer's whole account up to `today`: bills by month, ledger, what is owed. */
export interface CustomerAccount {
  ledger: Ledger
  /** Every month from the first plan or entry up to and including this month. */
  bills: Record<IsoMonth, MonthBill>
  /** This month, billed so far. */
  current: MonthBill
  outstanding: Outstanding
  /** Newest first. */
  payments: PaymentRecord[]
}

export function billMonth(book: Book, types: MilkType[], month: IsoMonth, today: IsoDate): MonthBill {
  return monthBill({
    month,
    asOf: today,
    types,
    rates: book.rates,
    plans: book.plans,
    pauses: book.pauses,
    entries: book.entries.filter((e) => e.date.startsWith(month)),
  })
}

/** `monthBill` and `ledger` called once for this customer's rows. */
export function accountOf(book: Book, types: MilkType[], today: IsoDate): CustomerAccount {
  const thisMonth = monthOf(today)
  const starts = [...book.plans.map((p) => p.effectiveFrom), ...book.entries.map((e) => e.date)].filter((d) => d <= today).sort()
  const bills: Record<IsoMonth, MonthBill> = {}
  for (let m = starts.length ? monthOf(starts[0]!) : thisMonth; m < thisMonth; m = addMonths(m, 1)) bills[m] = billMonth(book, types, m, today)
  const current = billMonth(book, types, thisMonth, today)
  bills[thisMonth] = current
  const payments = [...book.payments].sort((a, b) => (a.paidOn === b.paidOn ? b.id - a.id : a.paidOn < b.paidOn ? 1 : -1))
  const l = ledger(
    Object.values(bills).map((b) => ({ month: b.month, payablePaise: b.payablePaise, final: b.month < thisMonth })),
    payments,
    book.uses.map(({ month, amountPaise }) => ({ month, amountPaise })),
  )
  return { ledger: l, bills, current, outstanding: outstanding(l), payments }
}

export interface DueRow {
  customer: Customer
  outstanding: Outstanding
  ledger: Ledger
}

export interface AllDues {
  rows: DueRow[]
  /** Sum of positive `netPaise` over all customers: what the provider is owed. */
  owedPaise: number
  /** Sum of paid-ahead balances (negative `netPaise`), as a positive number. */
  aheadPaise: number
}

/** Every customer's outstanding balance, one engine call per customer. Inactive customers appear only while a balance remains. */
export function allDues(raw: Raw, today: IsoDate): AllDues {
  const rows: DueRow[] = []
  for (const customer of [...raw.customers].sort((a, b) => a.routeOrder - b.routeOrder || a.id - b.id)) {
    const acct = accountOf(bookOf(raw, customer.id), raw.types, today)
    if (!customer.active && acct.outstanding.netPaise === 0) continue
    rows.push({ customer, outstanding: acct.outstanding, ledger: acct.ledger })
  }
  let owedPaise = 0
  let aheadPaise = 0
  for (const r of rows) {
    if (r.outstanding.netPaise > 0) owedPaise += r.outstanding.netPaise
    else aheadPaise -= r.outstanding.netPaise
  }
  return { rows, owedPaise, aheadPaise }
}

// --------------------------------------------------------------------- backup

type Kind = 'int' | 'text' | 'int?' | 'text?'

/** Every table in the backup, parents first, with its columns and their types. */
export const BACKUP_TABLES = {
  milk_type: { id: 'int', name: 'text', sort: 'int', active: 'int', default_paise_per_litre: 'int' },
  customer: { id: 'int', name: 'text', phone: 'text', address: 'text', route_order: 'int', active: 'int', created_on: 'text' },
  rate: { customer_id: 'int', milk_type_id: 'int', effective_from: 'text', paise_per_litre: 'int' },
  plan: { customer_id: 'int', milk_type_id: 'int', effective_from: 'text', qty_ml: 'int' },
  day_entry: { customer_id: 'int', date: 'text', milk_type_id: 'int', qty_ml: 'int' },
  pause: { id: 'int', customer_id: 'int', from_date: 'text', resume_on: 'text?' },
  payment: { id: 'int', customer_id: 'int', paid_on: 'text', amount_paise: 'int', note: 'text', txn_ref: 'text', screenshot: 'text?' },
  payment_month: { payment_id: 'int', month: 'text', amount_paise: 'int' },
  credit_use: { id: 'int', customer_id: 'int', month: 'text', amount_paise: 'int', used_on: 'text' },
  tick: { customer_id: 'int', date: 'text' },
  setting: { key: 'text', value: 'text' },
} as const satisfies Record<string, Record<string, Kind>>

export type BackupTable = keyof typeof BACKUP_TABLES
export const BACKUP_ORDER = Object.keys(BACKUP_TABLES) as BackupTable[]
export const BACKUP_APP = 'milkdiary-provider'

export type BackupRow = Record<string, string | number | null>

export interface Backup {
  app: typeof BACKUP_APP
  /** The `user_version` the rows belong to. */
  schema: number
  exportedAt: string
  tables: Record<BackupTable, BackupRow[]>
}

/** Keeps only the known columns of each row, so a backup never carries stray fields. */
export function serialiseBackup(rows: Partial<Record<BackupTable, BackupRow[]>>, schema: number, exportedAt: string): Backup {
  const tables = {} as Record<BackupTable, BackupRow[]>
  for (const t of BACKUP_ORDER) {
    const cols = Object.keys(BACKUP_TABLES[t])
    tables[t] = (rows[t] ?? []).map((r) => Object.fromEntries(cols.map((c) => [c, r[c] ?? null])))
  }
  return { app: BACKUP_APP, schema, exportedAt, tables }
}

const kindOk = (kind: Kind, v: unknown): boolean => {
  if (v === null) return kind.endsWith('?')
  return kind.startsWith('int') ? typeof v === 'number' && Number.isInteger(v) : typeof v === 'string'
}

/** Parses and checks backup text. Throws a readable error; never returns a half-valid backup. */
export function parseBackup(text: string, currentSchema: number): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error(tr('This file is not a DairyManager backup.'))
  }
  const b = data as Partial<Backup> | null
  if (!b || typeof b !== 'object' || b.app !== BACKUP_APP || typeof b.schema !== 'number' || !b.tables || typeof b.tables !== 'object') {
    throw new Error(tr('This file is not a DairyManager backup.'))
  }
  if (b.schema > currentSchema) throw new Error(tr('This backup was made by a newer version of the app.'))
  for (const t of BACKUP_ORDER) {
    const rows = (b.tables as Record<string, unknown>)[t]
    if (!Array.isArray(rows)) throw new Error(tr('The backup is missing "{table}".', { table: t }))
    const spec: Record<string, Kind> = BACKUP_TABLES[t]
    rows.forEach((row, i) => {
      if (!row || typeof row !== 'object') throw new Error(tr('Bad row {n} in "{table}".', { n: i + 1, table: t }))
      // Backups made before schema 2 have no transaction number or screenshot.
      if (t === 'payment' && b.schema! < 2) Object.assign(row, { txn_ref: '', screenshot: null })
      for (const [col, kind] of Object.entries(spec)) {
        if (!kindOk(kind, (row as Record<string, unknown>)[col])) {
          throw new Error(tr('Bad value for {column} in row {n} of "{table}".', { column: col, n: i + 1, table: t }))
        }
      }
    })
  }
  return b as Backup
}

// ---------------------------------------------------------------------- route

export interface RouteItem {
  milkTypeId: number
  plannedMl: number
  /** Delivered quantity: the exception if one exists, else the plan. */
  qtyMl: number
}

export interface RouteStop {
  customer: Customer
  items: RouteItem[]
  /** Route progress only; never read by billing. */
  ticked: boolean
}

/** Active customers in route order with what is planned and delivered on `date`. Customers with nothing planned or entered are left out. */
export function routeFor(raw: Raw, ticks: { customerId: number; date: IsoDate }[], date: IsoDate): RouteStop[] {
  const stops: RouteStop[] = []
  for (const customer of [...raw.customers].filter((c) => c.active).sort((a, b) => a.routeOrder - b.routeOrder || a.id - b.id)) {
    const book = bookOf(raw, customer.id)
    const items: RouteItem[] = []
    for (const t of raw.types) {
      const plannedMl = plannedOn(book.plans, book.pauses, t.id, date)
      const entry = book.entries.find((e) => e.date === date && e.milkTypeId === t.id)
      const qtyMl = entry ? entry.qtyMl : plannedMl
      if (plannedMl > 0 || entry) items.push({ milkTypeId: t.id, plannedMl, qtyMl })
    }
    if (!items.length) continue
    stops.push({ customer, items, ticked: ticks.some((k) => k.customerId === customer.id && k.date === date) })
  }
  return stops
}
