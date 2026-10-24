import { QTY_STEP_ML, litreDigits, mlFromText } from '../../lib'
import type { RouteStop } from '../../dataHelpers'

/** Pure decisions for the Today screen, kept apart from React so they can be tested. */

export interface Progress {
  done: number
  total: number
}

/** How many stops on the round are ticked. */
export function progressOf(stops: Pick<RouteStop, 'ticked'>[]): Progress {
  return { done: stops.filter((s) => s.ticked).length, total: stops.length }
}

export type StopState = 'asPlanned' | 'changed' | 'none'

/** `none`: nothing is going out; `changed`: any quantity differs from the plan; else as planned. */
export function stopState(items: { plannedMl: number; qtyMl: number }[]): StopState {
  if (items.every((i) => i.qtyMl === 0)) return 'none'
  return items.some((i) => i.qtyMl !== i.plannedMl) ? 'changed' : 'asPlanned'
}

/** What a quantity box shows, in litres: `1.5`. */
export const qtyText = (ml: number): string => litreDigits(ml)

/** Typed litres to whole millilitres, or null when it is not a quantity. */
export const parseQty = (text: string): number | null => mlFromText(text)

/** Moves a typed quantity by one step (or `by` ml), never below zero. An unreadable box counts as `fallbackMl`. */
export function nudgeQty(text: string, by: number, fallbackMl: number): string {
  const current = parseQty(text) ?? fallbackMl
  return qtyText(Math.max(0, current + by))
}

export const STEP_ML = QTY_STEP_ML

/** The lines to hand to `saveDay`, or null while any box is not a valid quantity. */
export function dayItems(lines: { milkTypeId: number; text: string }[]): { milkTypeId: number; qtyMl: number }[] | null {
  const items: { milkTypeId: number; qtyMl: number }[] = []
  for (const l of lines) {
    const qtyMl = parseQty(l.text)
    if (qtyMl === null) return null
    items.push({ milkTypeId: l.milkTypeId, qtyMl })
  }
  return items
}

/** Every milk of the stop set to 0: the customer was not delivered to. */
export const notDeliveredItems = (items: { milkTypeId: number }[]): { milkTypeId: number; qtyMl: number }[] =>
  items.map((i) => ({ milkTypeId: i.milkTypeId, qtyMl: 0 }))
