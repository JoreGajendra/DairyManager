/**
 * What has been billed, what has been paid, and what is still owed.
 *
 * <p>A payment names the months it is for (its allocations): one payment often
 * settles two or three months, and an advance in the middle of a month is a
 * payment for the month still running. When that month ends, its final bill
 * less the advance is what remains.
 *
 * <p>Money that fits no month's bill (paid over a finished month's bill, or not
 * given a month at all) goes into a pool that settles the oldest finished bills
 * still owing; what is left after that is credit. So editing an old day after
 * paying just moves the balance, and nothing has to be re-matched by hand.
 */
import type { IsoDate, IsoMonth } from './dates';

export interface Allocation {
  month: IsoMonth;
  amountPaise: number;
}

export interface Payment {
  id: number;
  paidOn: IsoDate;
  amountPaise: number;
  note: string;
  /** Local file of the transaction screenshot, if one was attached. */
  screenshot: string | null;
  allocations: Allocation[];
}

export interface MonthDue {
  month: IsoMonth;
  payablePaise: number;
  /** False for the month still running: its bill is "so far" and can still grow. */
  final: boolean;
}

/** `advance`: something paid towards the running month. */
export type MonthStatus = 'paid' | 'part' | 'unpaid' | 'advance';

export interface LedgerMonth extends MonthDue {
  paidPaise: number;
  /** Negative only for a running month paid ahead of its bill so far. */
  duePaise: number;
  status: MonthStatus;
}

export interface Ledger {
  /** Oldest first. */
  months: LedgerMonth[];
  /** Owed on finished months. */
  duePaise: number;
  /** Paid beyond every finished bill and not given to the running month. */
  creditPaise: number;
}

/** Credit moved onto a month's bill: it counts as paid towards that month and leaves the credit. */
export interface CreditUse {
  month: IsoMonth;
  amountPaise: number;
}

export function ledger(months: MonthDue[], payments: Payment[], uses: CreditUse[] = []): Ledger {
  const sorted = [...months].sort((a, b) => (a.month < b.month ? -1 : 1));
  const known = new Set(sorted.map((m) => m.month));
  const given = new Map<IsoMonth, number>();
  let pool = 0;
  for (const u of uses) {
    if (!known.has(u.month)) continue;
    given.set(u.month, (given.get(u.month) ?? 0) + u.amountPaise);
    pool -= u.amountPaise;
  }
  for (const p of payments) {
    let allocated = 0;
    for (const a of p.allocations) {
      allocated += a.amountPaise;
      if (known.has(a.month)) given.set(a.month, (given.get(a.month) ?? 0) + a.amountPaise);
      else pool += a.amountPaise;
    }
    pool += Math.max(0, p.amountPaise - allocated);
  }

  // Finished months keep what was paid for them up to their bill; any extra joins the pool.
  const paid = new Map<IsoMonth, number>();
  for (const m of sorted) {
    const g = given.get(m.month) ?? 0;
    if (m.final) {
      paid.set(m.month, Math.min(g, m.payablePaise));
      pool += Math.max(0, g - m.payablePaise);
    } else {
      paid.set(m.month, g);
    }
  }
  // The pool settles the oldest finished bills still owing.
  for (const m of sorted) {
    if (!m.final || pool <= 0) continue;
    const top = Math.min(pool, m.payablePaise - paid.get(m.month)!);
    paid.set(m.month, paid.get(m.month)! + top);
    pool -= top;
  }

  const rows = sorted.map((m): LedgerMonth => {
    const p = paid.get(m.month)!;
    const due = m.payablePaise - p;
    const status: MonthStatus = !m.final
      ? p > 0 ? 'advance' : 'unpaid'
      : due === 0 ? 'paid'
      : p > 0 ? 'part'
      : 'unpaid';
    return { ...m, paidPaise: p, duePaise: due, status };
  });
  return {
    months: rows,
    duePaise: rows.filter((m) => m.final).reduce((s, m) => s + m.duePaise, 0),
    creditPaise: Math.max(0, pool),
  };
}

/** What is owed right now, and how it is made up. `netPaise` is negative when paid ahead. */
export interface Outstanding {
  /** Finished months still owing. */
  previousPaise: number;
  /** The running month's bill so far, and what is paid towards it (an advance, or credit used). */
  currentPaise: number;
  currentPaidPaise: number;
  /** Paid beyond every finished bill, not yet used on the running month. */
  creditPaise: number;
  netPaise: number;
}

export function outstanding(l: Ledger): Outstanding {
  const running = l.months.find((m) => !m.final);
  const currentPaise = running?.payablePaise ?? 0;
  const currentPaidPaise = running?.paidPaise ?? 0;
  return {
    previousPaise: l.duePaise,
    currentPaise,
    currentPaidPaise,
    creditPaise: l.creditPaise,
    netPaise: l.duePaise + currentPaise - currentPaidPaise - l.creditPaise,
  };
}

/** How much credit can go on the running month's bill so far: the smaller of the credit and what is left of it. */
export function creditToUse(l: Ledger): number {
  const running = l.months.find((m) => !m.final);
  return running ? Math.max(0, Math.min(l.creditPaise, running.payablePaise - running.paidPaise)) : 0;
}

/**
 * Splits one payment over the months ticked for it, oldest first, each up to
 * what it owes. A short payment leaves the last months part-paid; anything over
 * the total goes to the newest month ticked (an advance, or credit).
 */
export function splitPayment(amountPaise: number, selected: { month: IsoMonth; duePaise: number }[]): Allocation[] {
  const months = [...selected].sort((a, b) => (a.month < b.month ? -1 : 1));
  let left = amountPaise;
  const out = months.map((m) => {
    const take = Math.min(left, Math.max(0, m.duePaise));
    left -= take;
    return { month: m.month, amountPaise: take };
  });
  if (left > 0 && out.length) out[out.length - 1]!.amountPaise += left;
  return out.filter((a) => a.amountPaise > 0);
}
