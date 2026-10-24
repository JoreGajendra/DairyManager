/**
 * The month bill: what was delivered each day and what it costs.
 *
 * <p>Nothing is stored per day unless the day was different. A day's quantity
 * is the standing daily plan in force on that date, unless an entry was written
 * for that date and milk type, in which case the entry wins (0 = not delivered).
 * Price is the rate in force on that date, so a rate change on the 15th leaves
 * the first fourteen days at the old price. Plans and rates both carry an
 * effective-from date and the latest one on or before the day applies.
 *
 * <p>Money is in paise and milk in millilitres, both integers. Each rate period
 * is priced once on its total quantity and rounded once, so the bill is the sum
 * of its printed lines.
 */
import { monthDays, nextDay } from './dates';
import type { IsoDate, IsoMonth } from './dates';

export interface MilkType {
  id: number;
  name: string;
  active: boolean;
}

export interface Rate {
  milkTypeId: number;
  paisePerLitre: number;
  effectiveFrom: IsoDate;
}

export interface Plan {
  milkTypeId: number;
  qtyMl: number;
  effectiveFrom: IsoDate;
}

/** A day that was not the plan: a changed quantity, or 0 for no delivery. */
export interface DayEntry {
  date: IsoDate;
  milkTypeId: number;
  qtyMl: number;
}

/**
 * - `plan`: delivered as planned.
 * - `changed`: an entry changed the quantity of at least one milk.
 * - `none`: nothing was delivered on a day that had something planned.
 * - `off`: nothing planned and nothing entered (before the first plan, or a plan of 0).
 * - `paused`: inside a pause (away on holiday) with nothing entered; billed as 0.
 * - `future`: after `asOf`; shown at plan but not billed yet.
 */
export type DayStatus = 'plan' | 'changed' | 'none' | 'off' | 'paused' | 'future';

/**
 * Delivery stopped for a stretch, e.g. a holiday. `from` is the first day
 * without milk; `resumeOn` the first day it comes again, or null while nobody
 * knows yet. Inside a pause the plan counts as 0, so no day needs its own entry,
 * but an entry still wins (milk taken one day in the middle).
 */
export interface Pause {
  id: number;
  from: IsoDate;
  resumeOn: IsoDate | null;
}

/** The pause covering `date`, if any. */
export const pauseOn = (pauses: Pause[], date: IsoDate): Pause | undefined =>
  pauses.find((p) => p.from <= date && (p.resumeOn === null || date < p.resumeOn));

/** True when two pauses share a day. Open-ended pauses run forever. */
export const pausesOverlap = (a: Omit<Pause, 'id'>, b: Omit<Pause, 'id'>): boolean =>
  (b.resumeOn === null || a.from < b.resumeOn) && (a.resumeOn === null || b.from < a.resumeOn);

/** A daily plan with pauses applied: what should come on `date`. */
export const plannedOn = (plans: Plan[], pauses: Pause[], milkTypeId: number, date: IsoDate): number =>
  pauseOn(pauses, date) ? 0 : (inForce(plans, milkTypeId, date)?.qtyMl ?? 0);

/** A run of paused days inside one month. */
export interface PausedRun {
  from: IsoDate;
  to: IsoDate;
  days: number;
}

export interface DayItem {
  milkTypeId: number;
  qtyMl: number;
  plannedMl: number;
  /** null when milk was delivered but no rate was set for that date yet. */
  paisePerLitre: number | null;
  overridden: boolean;
}

export interface BillDay {
  date: IsoDate;
  status: DayStatus;
  items: DayItem[];
  totalMl: number;
  /** For display on the day; the month total is priced per rate period, not summed from these. */
  amountPaise: number;
}

/** One printed bill line: a milk at one price. */
export interface RatePeriod {
  paisePerLitre: number;
  from: IsoDate;
  to: IsoDate;
  days: number;
  totalMl: number;
  amountPaise: number;
}

export interface TypeTotal {
  milkTypeId: number;
  name: string;
  totalMl: number;
  daysDelivered: number;
  periods: RatePeriod[];
  amountPaise: number;
}

export interface MonthBill {
  month: IsoMonth;
  /** Last day billed: `asOf` clamped into the month, or the month end once it is over. */
  billedThrough: IsoDate | null;
  complete: boolean;
  days: BillDay[];
  types: TypeTotal[];
  totalPaise: number;
  /** `totalPaise` rounded to the nearest rupee, half up: what is actually paid (₹2,677.50 → ₹2,678). */
  payablePaise: number;
  /** `payablePaise - totalPaise`, between -50 and +50 paise; printed as "Round off". */
  roundOffPaise: number;
  /** The whole month with the remaining days at plan. Equals `totalPaise` once the month is over. */
  projectedPaise: number;
  /** Dates with milk but no rate for it; those litres are billed at nothing until a rate is set. */
  missingRate: IsoDate[];
  /** Paused stretches in this month, for the bill's "days that were different". */
  paused: PausedRun[];
}

export interface MonthBillInput {
  month: IsoMonth;
  /** Usually today. Days after it are `future`. */
  asOf: IsoDate;
  types: MilkType[];
  rates: Rate[];
  plans: Plan[];
  entries: DayEntry[];
  pauses?: Pause[];
}

/** The record in force on `date`: the latest effective-from on or before it. */
export function inForce<T extends { milkTypeId: number; effectiveFrom: IsoDate }>(
  records: T[],
  milkTypeId: number,
  date: IsoDate,
): T | undefined {
  let best: T | undefined;
  for (const r of records) {
    if (r.milkTypeId !== milkTypeId || r.effectiveFrom > date) continue;
    if (!best || r.effectiveFrom >= best.effectiveFrom) best = r;
  }
  return best;
}

const priced = (ml: number, paisePerLitre: number): number => Math.round((ml * paisePerLitre) / 1000);

/** To the nearest whole rupee, half up, as the handwritten bill does. */
export const toRupee = (paise: number): number => Math.round(paise / 100) * 100;

export function monthBill({ month, asOf, types, rates, plans, entries, pauses = [] }: MonthBillInput): MonthBill {
  const dates = monthDays(month);
  const entryFor = new Map(entries.map((e) => [`${e.date}|${e.milkTypeId}`, e.qtyMl]));

  const days: BillDay[] = dates.map((date) => {
    const paused = pauseOn(pauses, date) !== undefined;
    const items: DayItem[] = types.map((t) => {
      const plannedMl = plannedOn(plans, pauses, t.id, date);
      const entered = entryFor.get(`${date}|${t.id}`);
      return {
        milkTypeId: t.id,
        plannedMl,
        qtyMl: entered ?? plannedMl,
        paisePerLitre: inForce(rates, t.id, date)?.paisePerLitre ?? null,
        overridden: entered !== undefined && entered !== plannedMl,
      };
    });
    const totalMl = items.reduce((s, i) => s + i.qtyMl, 0);
    const plannedMl = items.reduce((s, i) => s + i.plannedMl, 0);
    // A pause is shown ahead of time too, so a planned holiday is visible on the calendar.
    const status: DayStatus =
      paused && !items.some((i) => i.overridden) ? 'paused'
      : date > asOf ? 'future'
      : totalMl === 0 && plannedMl > 0 ? 'none'
      : items.some((i) => i.overridden) ? 'changed'
      : totalMl === 0 ? 'off'
      : 'plan';
    const amountPaise = items.reduce((s, i) => s + priced(i.qtyMl, i.paisePerLitre ?? 0), 0);
    return { date, status, items, totalMl, amountPaise };
  });

  const billed = (d: BillDay) => d.date <= asOf;
  const missingRate = days
    .filter((d) => billed(d) && d.items.some((i) => i.qtyMl > 0 && i.paisePerLitre === null))
    .map((d) => d.date);

  const totalsOver = (subset: BillDay[]): TypeTotal[] =>
    types
      .map((t, index) => {
        const periods: RatePeriod[] = [];
        let totalMl = 0;
        let daysDelivered = 0;
        for (const day of subset) {
          const item = day.items[index]!;
          if (item.qtyMl === 0) continue;
          totalMl += item.qtyMl;
          daysDelivered += 1;
          const rate = item.paisePerLitre ?? 0;
          const last = periods[periods.length - 1];
          if (last && last.paisePerLitre === rate) {
            last.to = day.date;
            last.days += 1;
            last.totalMl += item.qtyMl;
          } else {
            periods.push({ paisePerLitre: rate, from: day.date, to: day.date, days: 1, totalMl: item.qtyMl, amountPaise: 0 });
          }
        }
        for (const p of periods) p.amountPaise = priced(p.totalMl, p.paisePerLitre);
        const amountPaise = periods.reduce((s, p) => s + p.amountPaise, 0);
        return { milkTypeId: t.id, name: t.name, totalMl, daysDelivered, periods, amountPaise, active: t.active };
      })
      // A retired milk still shows in a month it was delivered in.
      .filter((t) => t.active || t.totalMl > 0)
      .map(({ active: _, ...t }) => t);

  const billedTypes = totalsOver(days.filter(billed));
  const totalPaise = billedTypes.reduce((s, t) => s + t.amountPaise, 0);
  const projectedPaise = totalsOver(days).reduce((s, t) => s + t.amountPaise, 0);
  const billedDays = days.filter(billed);

  return {
    month,
    billedThrough: billedDays.length ? billedDays[billedDays.length - 1]!.date : null,
    complete: billedDays.length === days.length,
    days,
    types: billedTypes,
    totalPaise,
    payablePaise: toRupee(totalPaise),
    roundOffPaise: toRupee(totalPaise) - totalPaise,
    projectedPaise,
    missingRate,
    paused: days.reduce<PausedRun[]>((runs, d) => {
      if (d.status !== 'paused') return runs;
      const last = runs[runs.length - 1];
      if (last && nextDay(last.to) === d.date) {
        last.to = d.date;
        last.days += 1;
      } else {
        runs.push({ from: d.date, to: d.date, days: 1 });
      }
      return runs;
    }, []),
  };
}

/** Days that were not the plan, for the report's exceptions list. */
export const exceptions = (bill: MonthBill): BillDay[] =>
  bill.days.filter((d) => d.status === 'changed' || d.status === 'none');
