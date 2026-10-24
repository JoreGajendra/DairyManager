/**
 * Pure helpers behind the Dues screen, the payment sheet and the bulk-rate
 * sheet: no React, no SQL. Money is whole paise.
 */
import { checkPayment, allocatePayment, bulkRateRows } from '../../dataHelpers'
import type { Customer, CustomerPlan, CustomerRate, DueRow } from '../../dataHelpers'
import { creditToUse, getLang, paiseFromText, setLang } from '../../lib'
import type { Allocation, DueLine, IsoMonth, Lang, Ledger, LedgerMonth } from '../../lib'

/** Customers owing most first; paid-ahead and settled ones last. `query` matches name or phone. */
export function sortedDues(rows: DueRow[], query: string): DueRow[] {
  const q = query.trim().toLowerCase()
  return rows
    .filter((r) => !q || r.customer.name.toLowerCase().includes(q) || r.customer.phone.includes(q))
    .sort((a, b) => b.outstanding.netPaise - a.outstanding.netPaise || a.customer.routeOrder - b.customer.routeOrder || a.customer.id - b.customer.id)
}

/** The months a payment can be ticked against: finished months still owing, then the running month (an advance). */
export function payableMonths(l: Ledger): LedgerMonth[] {
  const owing = l.months.filter((m) => m.final && m.duePaise > 0)
  const running = l.months.find((m) => !m.final)
  return running ? [...owing, running] : owing
}

/** Months worth listing in a ledger view, newest first: those with a bill or a payment. */
export function billedMonths(l: Ledger): LedgerMonth[] {
  return l.months.filter((m) => m.payablePaise > 0 || m.paidPaise > 0).reverse()
}

/** Each finished month still owing, as the reminder message lists it. */
export function reminderLines(l: Ledger): DueLine[] {
  return l.months.filter((m) => m.final && m.duePaise > 0).map((m) => ({ month: m.month, payablePaise: m.payablePaise, paidPaise: m.paidPaise }))
}

/** The ticked months the amount starts at: everything they owe. */
export function suggestedPaise(selected: { duePaise: number }[]): number {
  return selected.reduce((s, m) => s + Math.max(0, m.duePaise), 0)
}

export interface PaymentPlan {
  /** What will be stored; empty means plain credit. */
  allocations: Allocation[]
  /** Part of the amount not given to any month (credit). */
  creditPaise: number
  /** Why it cannot be saved, or null. */
  error: string | null
}

/**
 * The allocations for a payment. Without `manual` the amount is split over the
 * ticked months by `allocatePayment` (oldest first, extra on the newest). With
 * `manual` (month -> typed rupees) those amounts are used as typed; whatever
 * is left of the amount is credit.
 */
export function planPayment(
  amountPaise: number | null,
  selected: { month: IsoMonth; duePaise: number }[],
  manual: Record<IsoMonth, string> | null,
): PaymentPlan {
  if (!amountPaise) return { allocations: [], creditPaise: 0, error: 'amount' }
  const allocations: Allocation[] = manual
    ? Object.entries(manual)
        .map(([month, text]) => ({ month, amountPaise: text.trim() ? paiseFromText(text) ?? -1 : 0 }))
        .filter((a) => a.amountPaise !== 0)
        .sort((a, b) => (a.month < b.month ? -1 : 1))
    : allocatePayment(amountPaise, selected)
  try {
    checkPayment(amountPaise, allocations)
  } catch (e) {
    return { allocations, creditPaise: 0, error: e instanceof Error ? e.message : String(e) }
  }
  return { allocations, creditPaise: amountPaise - allocations.reduce((s, a) => s + a.amountPaise, 0), error: null }
}

/** Credit that can go onto the running month's bill so far (see `creditToUse`). */
export const creditOffer = (l: Ledger): { month: IsoMonth; amountPaise: number } | null => {
  const running = l.months.find((m) => !m.final)
  const amountPaise = creditToUse(l)
  return running && amountPaise > 0 ? { month: running.month, amountPaise } : null
}

/** Runs `build` (which calls `tr`) in the saved language, then restores the app's. */
export function inLanguage<T>(lang: Lang, build: () => T): T {
  const before = getLang()
  setLang(lang)
  try {
    return build()
  } finally {
    setLang(before)
  }
}

/** How many of the chosen customers a bulk rate change would write a row for (those that buy the milk). */
export function bulkPreviewCount(
  milkTypeId: number,
  customers: Pick<Customer, 'id' | 'active'>[],
  chosenIds: number[] | undefined,
  rates: Pick<CustomerRate, 'customerId' | 'milkTypeId'>[],
  plans: Pick<CustomerPlan, 'customerId' | 'milkTypeId'>[],
): number {
  return bulkRateRows({ milkTypeId, from: '2000-01-01', paisePerLitre: 0, customerIds: chosenIds }, customers, rates, plans).length
}
