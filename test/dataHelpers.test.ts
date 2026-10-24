import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { MIGRATIONS } from '../src/migrations'
import {
  BACKUP_ORDER,
  BACKUP_TABLES,
  accountOf,
  allDues,
  allocatePayment,
  billMonth,
  bookOf,
  bulkRateRows,
  checkPayment,
  findPauseOverlap,
  newCustomerRows,
  normaliseDayEntries,
  parseBackup,
  pauseProblem,
  rateSeedsForDay,
  routeFor,
  serialiseBackup,
} from '../src/dataHelpers'
import type { Customer, Raw } from '../src/dataHelpers'

const types = [
  { id: 1, name: 'Cow', active: true, sort: 1, defaultPaisePerLitre: 6000 },
  { id: 2, name: 'Buffalo', active: true, sort: 2, defaultPaisePerLitre: 8000 },
]
const cust = (id: number, active = true): Customer => ({ id, name: `C${id}`, phone: '', address: '', routeOrder: id, active, createdOn: '2026-01-01' })
const empty = (): Raw => ({ types, customers: [], rates: [], plans: [], entries: [], pauses: [], payments: [], uses: [] })

describe('pauses', () => {
  const pauses = [{ id: 1, from: '2026-03-10', resumeOn: '2026-03-15' }]
  it('detects overlap and ignores the pause being changed', () => {
    expect(findPauseOverlap(pauses, { from: '2026-03-14', resumeOn: '2026-03-20' })?.id).toBe(1)
    expect(findPauseOverlap(pauses, { from: '2026-03-15', resumeOn: '2026-03-20' })).toBeUndefined()
    expect(findPauseOverlap(pauses, { from: '2026-03-12', resumeOn: null }, 1)).toBeUndefined()
  })
  it('gives a message for overlap and for a resume date not after the start', () => {
    expect(pauseProblem(pauses, { from: '2026-03-11', resumeOn: null })).toMatch(/already paused/)
    expect(pauseProblem(pauses, { from: '2026-04-01', resumeOn: '2026-04-01' })).toMatch(/resume date/)
    expect(pauseProblem(pauses, { from: '2026-04-01', resumeOn: null })).toBeNull()
  })
})

describe('normaliseDayEntries', () => {
  it('deletes rows equal to the plan and upserts the rest', () => {
    const w = normaliseDayEntries([
      { milkTypeId: 1, qtyMl: 1000, plannedMl: 1000 },
      { milkTypeId: 2, qtyMl: 0, plannedMl: 500 },
    ])
    expect(w.deletes).toEqual([1])
    expect(w.upserts).toEqual([{ milkTypeId: 2, qtyMl: 0 }])
  })
  it('rejects fractions, negatives and duplicates', () => {
    expect(() => normaliseDayEntries([{ milkTypeId: 1, qtyMl: 10.5, plannedMl: 0 }])).toThrow()
    expect(() => normaliseDayEntries([{ milkTypeId: 1, qtyMl: -1, plannedMl: 0 }])).toThrow()
    expect(() => normaliseDayEntries([{ milkTypeId: 1, qtyMl: 1, plannedMl: 0 }, { milkTypeId: 1, qtyMl: 2, plannedMl: 0 }])).toThrow()
  })
})

describe('rateSeedsForDay', () => {
  const owns = [{ milkTypeId: 1, paisePerLitre: 6500, effectiveFrom: '2026-03-01' }]
  it('seeds the default rate for a milk the customer has no rate for', () => {
    const seeds = rateSeedsForDay(owns, types, [{ milkTypeId: 2, qtyMl: 500 }], '2026-03-10')
    expect(seeds).toEqual([{ milkTypeId: 2, paisePerLitre: 8000, effectiveFrom: '2026-03-10' }])
  })
  it('keeps a rate already in force and skips zero quantities', () => {
    expect(rateSeedsForDay(owns, types, [{ milkTypeId: 1, qtyMl: 2000 }], '2026-03-10')).toEqual([])
    expect(rateSeedsForDay(owns, types, [{ milkTypeId: 2, qtyMl: 0 }], '2026-03-10')).toEqual([])
  })
  it('seeds when the only rate starts after the day', () => {
    const later = [{ milkTypeId: 2, paisePerLitre: 9000, effectiveFrom: '2026-03-20' }]
    expect(rateSeedsForDay(later, types, [{ milkTypeId: 2, qtyMl: 500 }], '2026-03-10')).toHaveLength(1)
  })
  it('bills extra and replacement milk at the seeded rate', () => {
    const raw: Raw = {
      ...empty(),
      customers: [cust(1)],
      rates: [{ customerId: 1, milkTypeId: 1, paisePerLitre: 6000, effectiveFrom: '2026-03-01' }],
      plans: [{ customerId: 1, milkTypeId: 1, qtyMl: 1000, effectiveFrom: '2026-03-01' }],
      // 10 Mar: Cow replaced by 1 L Buffalo. 11 Mar: 0.5 L Buffalo extra.
      entries: [
        { customerId: 1, date: '2026-03-10', milkTypeId: 1, qtyMl: 0 },
        { customerId: 1, date: '2026-03-10', milkTypeId: 2, qtyMl: 1000 },
        { customerId: 1, date: '2026-03-11', milkTypeId: 2, qtyMl: 500 },
      ],
    }
    const seeded = {
      ...raw,
      rates: [...raw.rates, ...rateSeedsForDay(raw.rates, types, [{ milkTypeId: 2, qtyMl: 1000 }], '2026-03-10').map((r) => ({ ...r, customerId: 1 }))],
    }
    const bill = billMonth(bookOf(seeded, 1), types, '2026-03', '2026-03-31')
    const buffalo = bill.types.find((t) => t.milkTypeId === 2)!
    expect(buffalo.totalMl).toBe(1500)
    expect(buffalo.amountPaise).toBe(12000)
    expect(bill.missingRate).toEqual([])
  })
})

describe('rates', () => {
  it('seeds a new customer from the default rate unless one is given', () => {
    const r = newCustomerRows(7, [{ milkTypeId: 1, qtyMl: 1000 }, { milkTypeId: 2, qtyMl: 500, paisePerLitre: 9000 }], { 1: 6000, 2: 8000 }, '2026-03-01')
    expect(r.rates.map((x) => x.paisePerLitre)).toEqual([6000, 9000])
    expect(r.plans.map((x) => x.qtyMl)).toEqual([1000, 500])
    expect(r.rates.every((x) => x.customerId === 7 && x.effectiveFrom === '2026-03-01')).toBe(true)
  })
  it('bulk rows go to active customers who buy that milk, or to the selected ones', () => {
    const customers = [cust(1), cust(2), cust(3, false), cust(4)]
    const plans = [1, 2, 3].map((customerId) => ({ customerId, milkTypeId: 1 }))
    const rates = [{ customerId: 4, milkTypeId: 2 }]
    const all = bulkRateRows({ milkTypeId: 1, from: '2026-05-01', paisePerLitre: 7000 }, customers, rates, plans)
    expect(all.map((r) => r.customerId)).toEqual([1, 2])
    const sel = bulkRateRows({ milkTypeId: 1, from: '2026-05-01', paisePerLitre: 7000, customerIds: [2, 3, 4] }, customers, rates, plans)
    expect(sel.map((r) => r.customerId)).toEqual([2, 3])
    expect(() => bulkRateRows({ milkTypeId: 1, from: '2026-05-01', paisePerLitre: 70.5 }, customers, rates, plans)).toThrow()
  })
})

describe('payments', () => {
  it('splits oldest first with the overflow on the newest month, none ticked is credit', () => {
    expect(allocatePayment(5000, [{ month: '2026-02', duePaise: 3000 }, { month: '2026-01', duePaise: 1000 }])).toEqual([
      { month: '2026-01', amountPaise: 1000 },
      { month: '2026-02', amountPaise: 4000 },
    ])
    expect(allocatePayment(5000, [])).toEqual([])
  })
  it('checks amounts', () => {
    expect(() => checkPayment(0, [])).toThrow()
    expect(() => checkPayment(100, [{ month: '2026-01', amountPaise: 200 }])).toThrow()
    expect(() => checkPayment(100, [{ month: '2026-01', amountPaise: 50 }, { month: '2026-01', amountPaise: 50 }])).toThrow()
    expect(() => checkPayment(100, [{ month: '2026-01', amountPaise: 60 }])).not.toThrow()
  })
})

describe('accounts', () => {
  const raw = (): Raw => ({
    ...empty(),
    customers: [cust(1), cust(2)],
    // Customer 1: 1 L cow at 60/L. Customer 2: 2 L cow at 70/L, paused 10th-20th January.
    rates: [
      { customerId: 1, milkTypeId: 1, paisePerLitre: 6000, effectiveFrom: '2026-01-01' },
      { customerId: 2, milkTypeId: 1, paisePerLitre: 7000, effectiveFrom: '2026-01-01' },
    ],
    plans: [
      { customerId: 1, milkTypeId: 1, qtyMl: 1000, effectiveFrom: '2026-01-01' },
      { customerId: 2, milkTypeId: 1, qtyMl: 2000, effectiveFrom: '2026-01-01' },
    ],
    pauses: [{ id: 1, customerId: 2, from: '2026-01-10', resumeOn: '2026-01-20' }],
  })
  it('bills customers independently', () => {
    const r = raw()
    const a = accountOf(bookOf(r, 1), types, '2026-02-15')
    const b = accountOf(bookOf(r, 2), types, '2026-02-15')
    expect(a.bills['2026-01']!.payablePaise).toBe(31 * 6000)
    expect(b.bills['2026-01']!.payablePaise).toBe(21 * 2 * 7000)
    expect(a.outstanding.previousPaise).toBe(31 * 6000)
  })
  it('all dues: payments stay with their customer; inactive paid-up customers drop out', () => {
    const r = raw()
    r.customers.push(cust(3, false))
    r.payments.push({ id: 1, customerId: 1, paidOn: '2026-02-01', amountPaise: 31 * 6000, note: '', screenshot: null, allocations: [{ month: '2026-01', amountPaise: 31 * 6000 }] })
    const d = allDues(r, '2026-02-15')
    expect(d.rows.map((x) => x.customer.id)).toEqual([1, 2])
    expect(d.rows[0]!.outstanding.previousPaise).toBe(0)
    expect(d.rows[1]!.outstanding.previousPaise).toBe(21 * 2 * 7000)
    expect(d.owedPaise).toBeGreaterThan(0)
  })
  it('an entry changes a bill (ticks are not even part of the billing rows)', () => {
    const r = raw()
    const before = accountOf(bookOf(r, 1), types, '2026-02-15').bills['2026-02']!.totalPaise
    r.entries.push({ customerId: 1, date: '2026-02-03', milkTypeId: 1, qtyMl: 0 })
    expect(accountOf(bookOf(r, 1), types, '2026-02-15').bills['2026-02']!.totalPaise).toBeLessThan(before)
  })
  it('route shows planned vs delivered and the tick', () => {
    const r = raw()
    r.entries.push({ customerId: 1, date: '2026-01-12', milkTypeId: 1, qtyMl: 1500 })
    const stops = routeFor(r, [{ customerId: 1, date: '2026-01-12' }], '2026-01-12')
    expect(stops).toHaveLength(1) // customer 2 is paused with nothing entered
    expect(stops[0]!.items[0]).toEqual({ milkTypeId: 1, plannedMl: 1000, qtyMl: 1500 })
    expect(stops[0]!.ticked).toBe(true)
  })
})

describe('schema and backup', () => {
  const open = () => {
    const d = new DatabaseSync(':memory:')
    d.exec('PRAGMA foreign_keys = ON')
    for (const m of MIGRATIONS) d.exec(m)
    return d
  }
  it('migrations run and every backup column exists', () => {
    const d = open()
    for (const t of BACKUP_ORDER) {
      const cols = (d.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name).sort()
      expect(Object.keys(BACKUP_TABLES[t]).sort()).toEqual(cols)
    }
  })
  it('round-trips through serialise, parse and a real database', () => {
    const d = open()
    d.exec(`INSERT INTO milk_type (id, name, sort, active, default_paise_per_litre) VALUES (1,'Cow',1,1,6000);
      INSERT INTO customer (id,name,phone,address,route_order,active,created_on) VALUES (1,'A','','',1,1,'2026-01-01');
      INSERT INTO pause (id,customer_id,from_date,resume_on) VALUES (1,1,'2026-01-05',NULL);
      INSERT INTO setting VALUES ('language','mr');`)
    const rows: Record<string, unknown[]> = {}
    for (const t of BACKUP_ORDER) rows[t] = d.prepare(`SELECT ${Object.keys(BACKUP_TABLES[t]).join(',')} FROM ${t}`).all().map((r) => ({ ...r }))
    const b = serialiseBackup(rows as never, MIGRATIONS.length, '2026-01-01T00:00:00Z')
    const back = parseBackup(JSON.stringify(b), MIGRATIONS.length)
    expect(back.tables.pause[0]!.resume_on).toBeNull()
    const d2 = open()
    for (const t of BACKUP_ORDER) {
      const cols = Object.keys(BACKUP_TABLES[t])
      const ins = d2.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      for (const row of back.tables[t]) ins.run(...cols.map((c) => row[c] ?? null))
    }
    expect((d2.prepare('SELECT COUNT(*) n FROM customer').get() as { n: number }).n).toBe(1)
  })
  it('restores every table exactly, replacing what was there (as importBackupJson does)', () => {
    const d = open()
    d.exec(`INSERT INTO milk_type (id,name,sort,active,default_paise_per_litre) VALUES (1,'Cow',1,1,6000),(2,'म्हैस',2,0,8050);
      INSERT INTO customer (id,name,phone,address,route_order,active,created_on) VALUES (1,'रामू','9876543210','Gali 1',2,1,'2026-01-01'),(2,'Sita','','',1,0,'2026-02-01');
      INSERT INTO rate VALUES (1,1,'2026-01-01',6000),(1,1,'2026-03-01',6400),(2,2,'2026-02-01',8050);
      INSERT INTO plan VALUES (1,1,'2026-01-01',1500),(1,1,'2026-03-01',0),(2,2,'2026-02-01',500);
      INSERT INTO day_entry VALUES (1,'2026-01-05',1,2000),(1,'2026-01-06',1,0);
      INSERT INTO pause (id,customer_id,from_date,resume_on) VALUES (1,1,'2026-01-10','2026-01-15'),(2,1,'2026-02-01',NULL);
      INSERT INTO payment (id,customer_id,paid_on,amount_paise,note) VALUES (1,1,'2026-02-02',500000,'cash "part"'),(2,2,'2026-02-03',1,'');
      INSERT INTO payment_month VALUES (1,'2026-01',300000),(1,'2026-02',200000);
      INSERT INTO credit_use (id,customer_id,month,amount_paise,used_on) VALUES (1,1,'2026-03',1000,'2026-03-02');
      INSERT INTO tick VALUES (1,'2026-01-05'),(2,'2026-02-05');
      INSERT INTO setting VALUES ('language','mr'),('businessName','Gokul Dairy'),('businessPhone','9000000000');`)
    const dump = (db: DatabaseSync) =>
      Object.fromEntries(BACKUP_ORDER.map((t) => [t, db.prepare(`SELECT ${Object.keys(BACKUP_TABLES[t]).join(',')} FROM ${t} ORDER BY 1,2`).all().map((r) => ({ ...r }))]))
    const before = dump(d)
    // Every table has data, so the comparison below means something.
    for (const t of BACKUP_ORDER) expect((before[t] as unknown[]).length, t).toBeGreaterThan(0)

    const text = JSON.stringify(serialiseBackup(before as never, MIGRATIONS.length, '2026-04-01T00:00:00Z'))
    const back = parseBackup(text, MIGRATIONS.length)

    // A phone with different data on it, restored into.
    const target = open()
    target.exec(`INSERT INTO milk_type (id,name) VALUES (9,'Old');
      INSERT INTO customer (id,name,created_on) VALUES (9,'Old','2025-01-01');
      INSERT INTO payment (id,customer_id,paid_on,amount_paise) VALUES (9,9,'2025-01-02',100);
      INSERT INTO payment_month VALUES (9,'2025-01',100);
      INSERT INTO setting VALUES ('language','en'),('stale','x');`)
    for (const t of [...BACKUP_ORDER].reverse()) target.exec(`DELETE FROM ${t}`)
    for (const t of BACKUP_ORDER) {
      const cols = Object.keys(BACKUP_TABLES[t])
      const ins = target.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      for (const row of back.tables[t]) ins.run(...cols.map((c) => row[c] ?? null))
    }
    expect(dump(target)).toEqual(before)
    // The next new row after a restore gets an unused id.
    target.exec(`INSERT INTO customer (name,created_on) VALUES ('New','2026-04-01')`)
    expect((target.prepare('SELECT MAX(id) m FROM customer').get() as { m: number }).m).toBeGreaterThan(2)
  })
  it('rejects bad backups', () => {
    const good = serialiseBackup({}, MIGRATIONS.length, 'x')
    expect(() => parseBackup('nope', MIGRATIONS.length)).toThrow()
    expect(() => parseBackup(JSON.stringify({ ...good, app: 'other' }), MIGRATIONS.length)).toThrow()
    expect(() => parseBackup(JSON.stringify({ ...good, schema: 99 }), MIGRATIONS.length)).toThrow(/newer/)
    const bad = { ...good, tables: { ...good.tables, payment: [{ id: 1, customer_id: 1, paid_on: 'x', amount_paise: 1.5, note: '', txn_ref: '', screenshot: null }] } }
    expect(() => parseBackup(JSON.stringify(bad), MIGRATIONS.length)).toThrow(/amount_paise/)
    expect(() => parseBackup(JSON.stringify({ ...good, tables: { ...good.tables, tick: undefined } }), MIGRATIONS.length)).toThrow(/tick/)
  })
  it('accepts a backup made before payments had a transaction number', () => {
    const old = serialiseBackup({}, 1, 'x')
    const tables = { ...old.tables, payment: [{ id: 1, customer_id: 1, paid_on: '2026-01-01', amount_paise: 100, note: '' }] }
    const back = parseBackup(JSON.stringify({ ...old, tables }), MIGRATIONS.length)
    expect(back.tables.payment[0]).toMatchObject({ txn_ref: '', screenshot: null })
  })
  it('enforces pause and payment constraints in SQL', () => {
    const d = open()
    d.exec(`INSERT INTO customer (id,name,created_on) VALUES (1,'A','2026-01-01')`)
    expect(() => d.exec(`INSERT INTO pause (customer_id,from_date,resume_on) VALUES (1,'2026-01-05','2026-01-05')`)).toThrow()
    expect(() => d.exec(`INSERT INTO payment (customer_id,paid_on,amount_paise) VALUES (1,'2026-01-05',0)`)).toThrow()
  })
})
