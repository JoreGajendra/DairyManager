import { describe, expect, it } from 'vitest'
import { accountOf, allDues, bookOf } from '../src/dataHelpers'
import type { Customer, Raw } from '../src/dataHelpers'
import { getLang, ledger } from '../src/lib'
import type { MonthDue, Payment } from '../src/lib'
import { billedMonths, bulkPreviewCount, creditOffer, inLanguage, payableMonths, planPayment, reminderLines, sortedDues, suggestedPaise } from '../src/screens/dues/duesLogic'

const m = (month: string, payablePaise: number, final = true): MonthDue => ({ month, payablePaise, final })
const pay = (id: number, amountPaise: number, allocations: Payment['allocations'] = []): Payment => ({ id, paidOn: '2026-10-05', amountPaise, note: '', screenshot: null, allocations })
// Aug and Sep finished (Rs 1000 and Rs 1200), October running (Rs 400 so far).
const months = [m('2026-08', 100000), m('2026-09', 120000), m('2026-10', 40000, false)]

describe('payableMonths / billedMonths', () => {
  it('offers finished months still owing, then the running month', () => {
    const l = ledger(months, [pay(1, 100000, [{ month: '2026-08', amountPaise: 100000 }])])
    expect(payableMonths(l).map((x) => x.month)).toEqual(['2026-09', '2026-10'])
    expect(billedMonths(l).map((x) => x.month)).toEqual(['2026-10', '2026-09', '2026-08'])
  })
})

describe('planPayment', () => {
  const owing = (l: ReturnType<typeof ledger>) => payableMonths(l).filter((x) => x.final)

  it('splits a full payment oldest first and matches the ledger', () => {
    const l = ledger(months, [])
    const sel = owing(l)
    expect(suggestedPaise(sel)).toBe(220000)
    const plan = planPayment(220000, sel, null)
    expect(plan.error).toBeNull()
    expect(plan.allocations).toEqual([{ month: '2026-08', amountPaise: 100000 }, { month: '2026-09', amountPaise: 120000 }])
    const after = ledger(months, [pay(1, 220000, plan.allocations)])
    expect(after.duePaise).toBe(0)
    expect(after.creditPaise).toBe(0)
  })

  it('part payment fills the oldest month and leaves the rest due', () => {
    const l = ledger(months, [])
    const plan = planPayment(150000, owing(l), null)
    expect(plan.allocations).toEqual([{ month: '2026-08', amountPaise: 100000 }, { month: '2026-09', amountPaise: 50000 }])
    const after = ledger(months, [pay(1, 150000, plan.allocations)])
    expect(after.months.map((x) => [x.month, x.status, x.duePaise])).toEqual([
      ['2026-08', 'paid', 0],
      ['2026-09', 'part', 70000],
      ['2026-10', 'unpaid', 40000],
    ])
    expect(after.duePaise).toBe(70000)
  })

  it('advance: ticking only the running month shows as paid towards it', () => {
    const l = ledger(months, [])
    const running = payableMonths(l).filter((x) => !x.final)
    const plan = planPayment(30000, running, null)
    expect(plan.allocations).toEqual([{ month: '2026-10', amountPaise: 30000 }])
    const after = ledger(months, [pay(1, 30000, plan.allocations)])
    expect(after.months[2]!.status).toBe('advance')
    expect(after.months[2]!.paidPaise).toBe(30000)
    expect(after.duePaise).toBe(220000)
  })

  it('no months ticked is credit that settles the oldest bill', () => {
    const plan = planPayment(50000, [], null)
    expect(plan.allocations).toEqual([])
    expect(plan.creditPaise).toBe(50000)
    const after = ledger(months, [pay(1, 50000, plan.allocations)])
    expect(after.months[0]!.paidPaise).toBe(50000)
    expect(after.duePaise).toBe(170000)
    expect(after.creditPaise).toBe(0)
  })

  it('an overpayment becomes credit that can be put on the running month', () => {
    const two = months.slice(0, 2).concat(months[2]!)
    const plan = planPayment(250000, two.filter((x) => x.final).map((x) => ({ month: x.month, duePaise: x.payablePaise })), null)
    // The extra is added to the newest month ticked, which the ledger pools as credit.
    const after = ledger(two, [pay(1, 250000, plan.allocations)])
    expect(after.duePaise).toBe(0)
    expect(after.creditPaise).toBe(30000)
    expect(creditOffer(after)).toEqual({ month: '2026-10', amountPaise: 30000 })
    // Using it moves it onto the month: paid towards it, credit gone.
    const used = ledger(two, [pay(1, 250000, plan.allocations)], [{ month: '2026-10', amountPaise: 30000 }])
    expect(used.creditPaise).toBe(0)
    expect(used.months[2]!.paidPaise).toBe(30000)
    expect(creditOffer(used)).toBeNull()
  })

  it('manual per-month amounts are used as typed; the rest is credit', () => {
    const sel = [{ month: '2026-08', duePaise: 100000 }, { month: '2026-09', duePaise: 120000 }]
    const plan = planPayment(150000, sel, { '2026-08': '600', '2026-09': '800' })
    expect(plan.error).toBeNull()
    expect(plan.allocations).toEqual([{ month: '2026-08', amountPaise: 60000 }, { month: '2026-09', amountPaise: 80000 }])
    expect(plan.creditPaise).toBe(10000)
  })

  it('rejects manual amounts that exceed the payment or are not numbers', () => {
    const sel = [{ month: '2026-08', duePaise: 100000 }]
    expect(planPayment(50000, sel, { '2026-08': '600' }).error).toMatch(/more than/)
    expect(planPayment(50000, sel, { '2026-08': 'abc' }).error).not.toBeNull()
    expect(planPayment(null, sel, null).error).not.toBeNull()
  })
})

describe('reminderLines', () => {
  it('lists finished months still owing with their bill and what is paid', () => {
    const l = ledger(months, [pay(1, 150000, [{ month: '2026-08', amountPaise: 100000 }, { month: '2026-09', amountPaise: 50000 }])])
    expect(reminderLines(l)).toEqual([{ month: '2026-09', payablePaise: 120000, paidPaise: 50000 }])
    expect(reminderLines(ledger(months, [pay(1, 220000, [{ month: '2026-08', amountPaise: 100000 }, { month: '2026-09', amountPaise: 120000 }])]))).toEqual([])
  })
})

describe('sortedDues', () => {
  const cust = (id: number, name: string, phone = ''): Customer => ({ id, name, phone, address: '', routeOrder: id, active: true, createdOn: '2026-01-01' })
  const types = [{ id: 1, name: 'Cow', active: true, sort: 1, defaultPaisePerLitre: 6000 }]
  const raw: Raw = {
    types,
    customers: [cust(1, 'Asha', '9876543210'), cust(2, 'Bhima'), cust(3, 'Chitra')],
    rates: [1, 2, 3].map((customerId) => ({ customerId, milkTypeId: 1, effectiveFrom: '2026-08-01', paisePerLitre: 6000 })),
    plans: [
      { customerId: 1, milkTypeId: 1, effectiveFrom: '2026-08-01', qtyMl: 1000 },
      { customerId: 2, milkTypeId: 1, effectiveFrom: '2026-08-01', qtyMl: 2000 },
      { customerId: 3, milkTypeId: 1, effectiveFrom: '2026-08-01', qtyMl: 500 },
    ],
    entries: [],
    pauses: [],
    payments: [],
    uses: [],
  }
  const today = '2026-10-20'

  it('orders by amount owed, largest first, and filters by name or phone', () => {
    const all = allDues(raw, today)
    expect(sortedDues(all.rows, '').map((r) => r.customer.name)).toEqual(['Bhima', 'Asha', 'Chitra'])
    expect(sortedDues(all.rows, 'ash').map((r) => r.customer.name)).toEqual(['Asha'])
    expect(sortedDues(all.rows, '98765').map((r) => r.customer.name)).toEqual(['Asha'])
    expect(sortedDues(all.rows, 'zzz')).toEqual([])
  })

  it('a recorded payment lowers that customer only, matching accountOf', () => {
    const before = allDues(raw, today)
    const bhima = before.rows.find((r) => r.customer.id === 2)!.outstanding
    const payment = { customerId: 2, id: 1, paidOn: '2026-10-05', amountPaise: bhima.previousPaise, note: '', screenshot: null, allocations: [] }
    const after = allDues({ ...raw, payments: [payment] }, today)
    expect(after.rows.find((r) => r.customer.id === 2)!.outstanding.previousPaise).toBe(0)
    expect(after.owedPaise).toBe(before.owedPaise - bhima.previousPaise)
    expect(accountOf(bookOf({ ...raw, payments: [payment] }, 1), types, today).outstanding.previousPaise).toBe(before.rows.find((r) => r.customer.id === 1)!.outstanding.previousPaise)
  })

  it('previews how many chosen customers buy the milk', () => {
    const cs = raw.customers
    expect(bulkPreviewCount(1, cs, undefined, raw.rates, raw.plans)).toBe(3)
    expect(bulkPreviewCount(1, cs, [1, 2], raw.rates, raw.plans)).toBe(2)
    expect(bulkPreviewCount(2, cs, undefined, raw.rates, raw.plans)).toBe(0)
    expect(bulkPreviewCount(1, [{ id: 1, active: true }, { id: 2, active: false }], undefined, raw.rates, raw.plans)).toBe(1)
  })
})

describe('inLanguage', () => {
  it('sets the language for the build and restores it', () => {
    const before = getLang()
    expect(inLanguage('mr', () => getLang())).toBe('mr')
    expect(getLang()).toBe(before)
  })
})
