import { describe, expect, it } from 'vitest';
import { monthBill } from '../src/lib/billing';
import { applyTemplate, applyTemplates } from '../src/lib/templates';
import type { PlanTemplate, Timeline } from '../src/lib/templates';

const COW = { id: 1, name: 'Cow', active: true };
const BUFFALO = { id: 2, name: 'Buffalo', active: true };

// Cow 1 L at ₹60 since 1 Sep; nothing before.
const timeline: Timeline = {
  rates: [{ milkTypeId: 1, paisePerLitre: 6000, effectiveFrom: '2026-09-01' }],
  plans: [{ milkTypeId: 1, qtyMl: 1000, effectiveFrom: '2026-09-01' }],
};

const cowAt56: PlanTemplate = { id: 1, name: 'Cow 1.5 L', items: [{ milkTypeId: 1, paisePerLitre: 5600, qtyMl: 1500 }] };
const buffaloOnly: PlanTemplate = { id: 2, name: 'Buffalo', items: [{ milkTypeId: 2, paisePerLitre: 7000, qtyMl: 500 }] };

const bill = (t: Timeline, month: string) =>
  monthBill({ month, asOf: '2026-09-30', types: [COW, BUFFALO], entries: [], ...t });

describe('saved plans', () => {
  it('bills an old month from nothing, and leaves the months after it alone', () => {
    const next = applyTemplate(timeline, { template: cowAt56, from: '2026-08-01', to: '2026-08-31' });
    expect(bill(next, '2026-08').types[0]!.totalMl).toBe(31 * 1500);
    expect(bill(next, '2026-08').payablePaise).toBe(260400);
    expect(bill(next, '2026-09').payablePaise).toBe(bill(timeline, '2026-09').payablePaise);
    // September already had its own steps, so nothing is added on the 1st.
    expect(next.plans.filter((p) => p.effectiveFrom === '2026-09-01')).toEqual([{ milkTypeId: 1, qtyMl: 1000, effectiveFrom: '2026-09-01' }]);
  });

  it('puts part of a month back to what it had after the stretch', () => {
    const next = applyTemplate(timeline, { template: buffaloOnly, from: '2026-09-10', to: '2026-09-19' });
    const sept = bill(next, '2026-09');
    expect(sept.days[8]!.items.map((i) => i.qtyMl)).toEqual([1000, 0]);
    expect(sept.days[9]!.items.map((i) => i.qtyMl)).toEqual([0, 500]);
    expect(sept.days[18]!.items.map((i) => i.qtyMl)).toEqual([0, 500]);
    expect(sept.days[19]!.items.map((i) => i.qtyMl)).toEqual([1000, 0]);
    expect(sept.days[19]!.items[0]!.paisePerLitre).toBe(6000);
  });

  it('replaces steps that started inside the stretch', () => {
    const withChange: Timeline = {
      rates: [...timeline.rates, { milkTypeId: 1, paisePerLitre: 6400, effectiveFrom: '2026-09-15' }],
      plans: timeline.plans,
    };
    const next = applyTemplate(withChange, { template: cowAt56, from: '2026-09-01', to: '2026-09-30' });
    expect(next.rates).toEqual([
      { milkTypeId: 1, paisePerLitre: 5600, effectiveFrom: '2026-09-01' },
      { milkTypeId: 1, paisePerLitre: 6400, effectiveFrom: '2026-10-01' },
    ]);
    expect(next.plans).toEqual([
      { milkTypeId: 1, qtyMl: 1500, effectiveFrom: '2026-09-01' },
      { milkTypeId: 1, qtyMl: 1000, effectiveFrom: '2026-10-01' },
    ]);
  });

  it('applies two plans on the two halves of a month', () => {
    const next = applyTemplates(timeline, [
      { template: buffaloOnly, from: '2026-08-16', to: '2026-08-31' },
      { template: cowAt56, from: '2026-08-01', to: '2026-08-15' },
    ]);
    const aug = bill(next, '2026-08');
    expect(aug.days[14]!.items.map((i) => i.qtyMl)).toEqual([1500, 0]);
    expect(aug.days[15]!.items.map((i) => i.qtyMl)).toEqual([0, 500]);
    expect(bill(next, '2026-09').payablePaise).toBe(bill(timeline, '2026-09').payablePaise);
  });

  it('refuses plans that share a day', () => {
    expect(() =>
      applyTemplates(timeline, [
        { template: cowAt56, from: '2026-08-01', to: '2026-08-15' },
        { template: buffaloOnly, from: '2026-08-15', to: '2026-08-31' },
      ]),
    ).toThrow('same day');
  });
});
