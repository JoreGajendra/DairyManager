/**
 * Pure decisions behind the Customers screens: searching, route moves, the form
 * drafts and the calendar grid. No React, so vitest can cover them.
 */
import { inForce, mlFromText, paiseFromText, tr, weekday, monthDays } from '../../lib'
import type { IsoDate, IsoMonth } from '../../lib'
import type { Customer, CustomerPlan, CustomerRate, MilkTypeRow, NewCustomerMilk } from '../../dataHelpers'

/** Customers whose name, phone or address contains every word typed. */
export function filterCustomers(customers: Customer[], query: string): Customer[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return customers
  return customers.filter((c) => {
    const hay = `${c.name} ${c.phone} ${c.address}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}

/** The ids with `id` moved `delta` places (-1 up, +1 down); unchanged at either end. */
export function moveId(ids: number[], id: number, delta: -1 | 1): number[] {
  const at = ids.indexOf(id)
  const to = at + delta
  if (at < 0 || to < 0 || to >= ids.length) return ids
  const out = [...ids]
  out[at] = out[to]!
  out[to] = id
  return out
}

/** One milk in the add-customer form. */
export interface MilkDraft {
  milkTypeId: number
  name: string
  on: boolean
  /** Litres as typed. */
  qty: string
  /** Rupees per litre as typed; seeded from the milk's default rate. */
  rate: string
}

const rupees = (paise: number): string => String(paise / 100)

/** One draft per active milk type, all off, rate filled from the default. */
export function emptyDrafts(types: MilkTypeRow[]): MilkDraft[] {
  return types
    .filter((t) => t.active)
    .map((t) => ({ milkTypeId: t.id, name: t.name, on: false, qty: '1', rate: rupees(t.defaultPaisePerLitre) }))
}

/** The milks to create, or the sentence saying what is wrong. */
export function milksFromDrafts(drafts: MilkDraft[]): { milks: NewCustomerMilk[] } | { error: string } {
  const milks: NewCustomerMilk[] = []
  for (const d of drafts.filter((x) => x.on)) {
    const qtyMl = mlFromText(d.qty)
    if (qtyMl === null) return { error: tr('Enter litres for {name}.', { name: d.name }) }
    const paisePerLitre = paiseFromText(d.rate)
    if (paisePerLitre === null) return { error: tr('Enter a rate for {name}.', { name: d.name }) }
    milks.push({ milkTypeId: d.milkTypeId, qtyMl, paisePerLitre })
  }
  return { milks }
}

/** A milk a customer takes, as of a date. */
export interface MilkLine {
  milkTypeId: number
  name: string
  qtyMl: number
  paisePerLitre: number | null
}

/** Every milk the customer has a plan for, with the quantity and rate in force on `date`. */
export function milkLines(plans: CustomerPlan[], rates: CustomerRate[], types: MilkTypeRow[], date: IsoDate): MilkLine[] {
  return types
    .filter((t) => plans.some((p) => p.milkTypeId === t.id))
    .map((t) => ({
      milkTypeId: t.id,
      name: t.name,
      qtyMl: inForce(plans, t.id, date)?.qtyMl ?? 0,
      paisePerLitre: inForce(rates, t.id, date)?.paisePerLitre ?? null,
    }))
}

/** Active milk types the customer has no plan for yet. */
export function addableMilks(plans: CustomerPlan[], types: MilkTypeRow[]): MilkTypeRow[] {
  return types.filter((t) => t.active && !plans.some((p) => p.milkTypeId === t.id))
}

/** A month as weeks of seven (Sunday first): null pads the days of the neighbouring months. */
export function calendarCells(month: IsoMonth): (IsoDate | null)[] {
  const days = monthDays(month)
  const cells: (IsoDate | null)[] = Array.from({ length: weekday(days[0]!) }, () => null)
  cells.push(...days)
  while (cells.length % 7) cells.push(null)
  return cells
}
