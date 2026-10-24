import { afterEach, describe, expect, it } from 'vitest'
import { monthBill, setLang } from '../src/lib'
import type { LedgerMonth } from '../src/lib'
import { billFileName, billHeader, billRow, billTotals, billWhatsApp, sendAllQueue, visibleRows } from '../src/screens/bills/billsModel'

afterEach(() => setLang('en'))

const types = [{ id: 1, name: 'Cow', active: true }]
const customer = { id: 7, name: ' Sunita ', phone: '98765 43210', address: 'Lane 2', active: true }
const bill = monthBill({
  month: '2026-09',
  asOf: '2026-10-05',
  types,
  rates: [{ milkTypeId: 1, paisePerLitre: 6000, effectiveFrom: '2026-01-01' }],
  plans: [{ milkTypeId: 1, qtyMl: 1000, effectiveFrom: '2026-01-01' }],
  entries: [],
})
const paid = (paidPaise: number, final = true): LedgerMonth => ({
  month: '2026-09',
  payablePaise: bill.payablePaise,
  final,
  paidPaise,
  duePaise: bill.payablePaise - paidPaise,
  status: 'unpaid',
})

describe('billHeader', () => {
  it('trims the parties and carries the language', () => {
    const h = billHeader({ businessName: ' Patil Dairy ', businessPhone: '999', language: 'mr' }, customer)
    expect(h).toMatchObject({ businessName: 'Patil Dairy', customerName: 'Sunita', customerAddress: 'Lane 2', lang: 'mr' })
  })
})

describe('billRow', () => {
  it('30 litres at 60 a litre is 1800 rupees, unpaid', () => {
    const row = billRow(customer, bill, undefined)
    expect(row).toMatchObject({ litresMl: 30000, payablePaise: 180000, paidPaise: 0, duePaise: 180000, status: 'unpaid', hasPhone: true })
  })
  it('classifies part, paid and advance', () => {
    expect(billRow(customer, bill, paid(50000))).toMatchObject({ status: 'part', duePaise: 130000 })
    expect(billRow(customer, bill, paid(180000))).toMatchObject({ status: 'paid', duePaise: 0 })
    expect(billRow(customer, bill, paid(300000))).toMatchObject({ status: 'paid', duePaise: 0 })
    expect(billRow(customer, bill, paid(50000, false)).status).toBe('advance')
  })
  it('flags a missing or unusable phone', () => {
    expect(billRow({ ...customer, phone: '' }, bill, undefined).hasPhone).toBe(false)
  })
})

describe('lists and totals', () => {
  const empty = monthBill({ month: '2026-09', asOf: '2026-10-05', types, rates: [], plans: [], entries: [] })
  const rows = [billRow(customer, bill, paid(50000)), billRow({ ...customer, id: 8 }, empty, undefined)]
  it('hides customers with nothing this month', () => {
    expect(rows[1]!.status).toBe('none')
    expect(visibleRows(rows)).toHaveLength(1)
  })
  it('adds up', () => {
    expect(billTotals(visibleRows(rows))).toEqual({ count: 1, litresMl: 30000, payablePaise: 180000, paidPaise: 50000, duePaise: 130000 })
  })
  it('send-all walks customers who owe a bill', () => {
    expect(sendAllQueue(rows).map((r) => r.customerId)).toEqual([7])
  })
})

describe('billWhatsApp', () => {
  it('builds the message and the wa.me link', () => {
    const row = billRow(customer, bill, undefined)
    const { text, url } = billWhatsApp('2026-09', row, customer, 'Patil Dairy')
    expect(text).toContain('Bill: *₹1,800*')
    expect(url?.startsWith('https://wa.me/919876543210?text=')).toBe(true)
  })
  it('has no link without a phone', () => {
    const c = { ...customer, phone: '' }
    expect(billWhatsApp('2026-09', billRow(c, bill, undefined), c, '').url).toBeNull()
  })
  it('is written in the saved language', () => {
    setLang('mr')
    const row = billRow(customer, bill, undefined)
    expect(billWhatsApp('2026-09', row, customer, '').text).toContain('दुधाचे बिल')
  })
})

describe('billFileName', () => {
  it('is MilkBill-month-year-customer, without spaces or symbols', () => {
    expect(billFileName('2026-10', 'Asha Patil')).toBe('MilkBill-October-2026-Asha-Patil')
    expect(billFileName('2026-01', '  Dr. R/K  Shah! ')).toBe('MilkBill-January-2026-Dr-R-K-Shah')
  })
  it('keeps Marathi names and falls back when nothing is left', () => {
    expect(billFileName('2026-03', 'आशा पाटील')).toBe('MilkBill-March-2026-आशा-पाटील')
    expect(billFileName('2026-03', '???')).toBe('MilkBill-March-2026-Customer')
  })
})
