import { describe, expect, it } from 'vitest';
import { monthBill, pauseOn, pausesOverlap, plannedOn } from '../src/lib/billing';
import { nextDay, previousDay } from '../src/lib/dates';

const COW = { id: 1, name: 'Cow', active: true };
const base = {
  month: '2026-10',
  asOf: '2026-10-31',
  types: [COW],
  rates: [{ milkTypeId: 1, paisePerLitre: 8500, effectiveFrom: '2026-01-01' }],
  plans: [{ milkTypeId: 1, qtyMl: 1500, effectiveFrom: '2026-01-01' }],
  entries: [],
};

describe('pauses', () => {
  it('bills nothing from the pause until the resume day', () => {
    const bill = monthBill({ ...base, pauses: [{ id: 1, from: '2026-10-10', resumeOn: '2026-10-20' }] });
    expect(bill.days[8]!.status).toBe('plan');
    expect(bill.days.slice(9, 19).every((d) => d.status === 'paused' && d.totalMl === 0)).toBe(true);
    expect(bill.days[19]!.status).toBe('plan');
    expect(bill.types[0]!.totalMl).toBe(21 * 1500);
    expect(bill.paused).toEqual([{ from: '2026-10-10', to: '2026-10-19', days: 10 }]);
  });

  it('keeps an open pause going to the end of the month and beyond', () => {
    const pauses = [{ id: 1, from: '2026-10-25', resumeOn: null }];
    expect(monthBill({ ...base, pauses }).paused).toEqual([{ from: '2026-10-25', to: '2026-10-31', days: 7 }]);
    expect(monthBill({ ...base, month: '2026-11', asOf: '2026-11-30', pauses }).payablePaise).toBe(0);
  });

  it('lets an entry inside a pause win', () => {
    const bill = monthBill({
      ...base,
      pauses: [{ id: 1, from: '2026-10-10', resumeOn: '2026-10-20' }],
      entries: [{ date: '2026-10-15', milkTypeId: 1, qtyMl: 1000 }],
    });
    expect(bill.days[14]!.status).toBe('changed');
    expect(bill.paused).toEqual([
      { from: '2026-10-10', to: '2026-10-14', days: 5 },
      { from: '2026-10-16', to: '2026-10-19', days: 4 },
    ]);
    expect(bill.types[0]!.totalMl).toBe(21 * 1500 + 1000);
  });

  it('shows a planned holiday ahead but still bills only up to asOf', () => {
    const bill = monthBill({ ...base, asOf: '2026-10-05', pauses: [{ id: 1, from: '2026-10-20', resumeOn: null }] });
    expect(bill.days[25]!.status).toBe('paused');
    expect(bill.billedThrough).toBe('2026-10-05');
    expect(bill.complete).toBe(false);
    expect(bill.totalPaise).toBe(5 * 12750);
    expect(bill.projectedPaise).toBe(19 * 12750);
  });

  it('finds and compares pauses', () => {
    const p = { id: 1, from: '2026-10-10', resumeOn: '2026-10-20' };
    expect(pauseOn([p], '2026-10-19')).toBe(p);
    expect(pauseOn([p], '2026-10-20')).toBeUndefined();
    expect(plannedOn(base.plans, [p], 1, '2026-10-12')).toBe(0);
    expect(pausesOverlap(p, { from: '2026-10-20', resumeOn: null })).toBe(false);
    expect(pausesOverlap(p, { from: '2026-10-01', resumeOn: '2026-10-11' })).toBe(true);
    expect(pausesOverlap({ from: '2026-11-01', resumeOn: null }, { from: '2026-12-01', resumeOn: null })).toBe(true);
    expect([nextDay('2026-12-31'), previousDay('2027-03-01')]).toEqual(['2027-01-01', '2027-02-28']);
  });
});
