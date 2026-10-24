/**
 * Saved plans: a set of milks, each with a rate and a daily quantity, put on a
 * stretch of days in one go (a whole old month, or part of one).
 *
 * <p>Applying one does not add a second way of billing. It writes ordinary rate
 * and plan steps into the timeline the bill engine already reads: the plan's
 * values from the first day, and whatever was in force before from the day
 * after the last, so days outside the stretch bill exactly as they did.
 */
import { inForce } from './billing';
import type { Plan, Rate } from './billing';
import { nextDay } from './dates';
import { tr } from './i18n';
import type { IsoDate } from './dates';

export interface TemplateItem {
  milkTypeId: number;
  paisePerLitre: number;
  qtyMl: number;
}

export interface PlanTemplate {
  id: number;
  name: string;
  items: TemplateItem[];
}

/** One saved plan on the days `from` to `to`, both included. */
export interface TemplateUse {
  template: PlanTemplate;
  from: IsoDate;
  to: IsoDate;
}

export interface Timeline {
  rates: Rate[];
  plans: Plan[];
}

const byDate = <T extends { milkTypeId: number; effectiveFrom: IsoDate }>(a: T, b: T): number =>
  a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : a.milkTypeId - b.milkTypeId;

/**
 * The timeline with `use.template` on its days: its milks at its rates and
 * quantities, and every other milk that had a plan then at 0. Rate and plan
 * steps that started inside the stretch are replaced by it.
 */
export function applyTemplate(timeline: Timeline, { template, from, to }: TemplateUse): Timeline {
  if (to < from) throw new Error(tr('The last day must be on or after the first.'));
  const after = nextDay(to);
  const outside = (r: { effectiveFrom: IsoDate }) => r.effectiveFrom < from || r.effectiveFrom > to;
  const rates = timeline.rates.filter(outside);
  const plans = timeline.plans.filter(outside);
  const ids = new Set([...timeline.plans.map((p) => p.milkTypeId), ...template.items.map((i) => i.milkTypeId)]);

  for (const id of ids) {
    const item = template.items.find((i) => i.milkTypeId === id);
    // A milk not in the plan only needs stopping if something of it was planned in the stretch.
    if (!item && !inForce(timeline.plans, id, to)) continue;

    const qtyMl = item?.qtyMl ?? 0;
    plans.push({ milkTypeId: id, effectiveFrom: from, qtyMl });
    if (item) rates.push({ milkTypeId: id, effectiveFrom: from, paisePerLitre: item.paisePerLitre });

    // The day after goes back to what it had, unless a step already starts then.
    const planAfter = inForce(timeline.plans, id, after)?.qtyMl ?? 0;
    if (planAfter !== qtyMl && !plans.some((p) => p.milkTypeId === id && p.effectiveFrom === after)) {
      plans.push({ milkTypeId: id, effectiveFrom: after, qtyMl: planAfter });
    }
    const rateAfter = inForce(timeline.rates, id, after);
    if (item && rateAfter && rateAfter.paisePerLitre !== item.paisePerLitre && !rates.some((r) => r.milkTypeId === id && r.effectiveFrom === after)) {
      rates.push({ milkTypeId: id, effectiveFrom: after, paisePerLitre: rateAfter.paisePerLitre });
    }
  }
  return { rates: rates.sort(byDate), plans: plans.sort(byDate) };
}

/** Several saved plans on stretches that must not share a day, applied in date order. */
export function applyTemplates(timeline: Timeline, uses: TemplateUse[]): Timeline {
  const ordered = [...uses].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i]!.from <= ordered[i - 1]!.to) throw new Error(tr('Two plans cover the same day. Give each its own days.'));
  }
  return ordered.reduce(applyTemplate, timeline);
}
