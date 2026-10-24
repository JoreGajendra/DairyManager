import { describe, expect, it } from 'vitest'
import { addableMilks, calendarCells, emptyDrafts, filterCustomers, milkLines, milksFromDrafts, moveId } from '../src/screens/customers/customerView'
import type { Customer, MilkTypeRow } from '../src/dataHelpers'

const c = (id: number, name: string, phone = '', address = ''): Customer => ({ id, name, phone, address, routeOrder: id, active: true, createdOn: '2026-01-01' })
const types: MilkTypeRow[] = [
  { id: 1, name: 'Cow', active: true, sort: 1, defaultPaisePerLitre: 6000 },
  { id: 2, name: 'Buffalo', active: true, sort: 2, defaultPaisePerLitre: 7550 },
  { id: 3, name: 'Old', active: false, sort: 3, defaultPaisePerLitre: 100 },
]

describe('customer view helpers', () => {
  it('searches name, phone and address, every word', () => {
    const list = [c(1, 'Asha Patil', '98200', 'Rose Lane'), c(2, 'Ravi Kale', '98111', 'Lotus Road')]
    expect(filterCustomers(list, '')).toHaveLength(2)
    expect(filterCustomers(list, 'ASHA').map((x) => x.id)).toEqual([1])
    expect(filterCustomers(list, '981 lotus').map((x) => x.id)).toEqual([2])
    expect(filterCustomers(list, 'asha lotus')).toEqual([])
  })

  it('moves an id one place and stops at the ends', () => {
    expect(moveId([1, 2, 3], 2, -1)).toEqual([2, 1, 3])
    expect(moveId([1, 2, 3], 2, 1)).toEqual([1, 3, 2])
    expect(moveId([1, 2, 3], 1, -1)).toEqual([1, 2, 3])
    expect(moveId([1, 2, 3], 3, 1)).toEqual([1, 2, 3])
    expect(moveId([1, 2, 3], 9, 1)).toEqual([1, 2, 3])
  })

  it('seeds drafts from active milks and turns chosen ones into millilitres and paise', () => {
    const drafts = emptyDrafts(types)
    expect(drafts.map((d) => [d.name, d.rate])).toEqual([['Cow', '60'], ['Buffalo', '75.5']])
    expect(milksFromDrafts(drafts)).toEqual({ milks: [] })
    drafts[1] = { ...drafts[1]!, on: true, qty: '1.5' }
    expect(milksFromDrafts(drafts)).toEqual({ milks: [{ milkTypeId: 2, qtyMl: 1500, paisePerLitre: 7550 }] })
    drafts[1] = { ...drafts[1]!, qty: 'x' }
    expect(milksFromDrafts(drafts)).toHaveProperty('error')
    drafts[1] = { ...drafts[1]!, qty: '1', rate: '' }
    expect(milksFromDrafts(drafts)).toHaveProperty('error')
  })

  it('reads the milk in force on a date and lists milks still to add', () => {
    const plans = [
      { customerId: 1, milkTypeId: 1, qtyMl: 1000, effectiveFrom: '2026-01-01' },
      { customerId: 1, milkTypeId: 1, qtyMl: 2000, effectiveFrom: '2026-03-01' },
    ]
    const rates = [{ customerId: 1, milkTypeId: 1, paisePerLitre: 6000, effectiveFrom: '2026-01-01' }]
    expect(milkLines(plans, rates, types, '2026-02-10')).toEqual([{ milkTypeId: 1, name: 'Cow', qtyMl: 1000, paisePerLitre: 6000 }])
    expect(milkLines(plans, rates, types, '2026-03-10')[0]!.qtyMl).toBe(2000)
    expect(addableMilks(plans, types).map((t) => t.id)).toEqual([2])
  })

  it('lays a month out in whole weeks, Sunday first', () => {
    const cells = calendarCells('2026-10') // 1 Oct 2026 is a Thursday
    expect(cells.length % 7).toBe(0)
    expect(cells.slice(0, 5)).toEqual([null, null, null, null, '2026-10-01'])
    expect(cells.filter(Boolean)).toHaveLength(31)
  })
})
