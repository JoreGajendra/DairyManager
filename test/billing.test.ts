import { describe, expect, it } from 'vitest';
import { exceptions, inForce, monthBill } from '../src/lib/billing';
import type { DayEntry, MilkType, Plan, Rate } from '../src/lib/billing';
import { addMonths, daysInMonth, isIsoDate, monthDays, tomorrowIso } from '../src/lib/dates';
import { inr, paiseFromText } from '../src/lib/money';
import { litres, mlFromText } from '../src/lib/quantity';

const COW: MilkType = { id: 1, name: 'Cow', active: true };
const BUFFALO: MilkType = { id: 2, name: 'Buffalo', active: true };

const rate = (milkTypeId: number, rupees: number, effectiveFrom: string): Rate => ({
  milkTypeId,
  paisePerLitre: Math.round(rupees * 100),
  effectiveFrom,
});
const plan = (milkTypeId: number, qtyMl: number, effectiveFrom: string): Plan => ({ milkTypeId, qtyMl, effectiveFrom });
const entry = (date: string, milkTypeId: number, qtyMl: number): DayEntry => ({ date, milkTypeId, qtyMl });

const base = {
  month: '2026-09',
  asOf: '2026-09-30',
  types: [COW],
  rates: [rate(1, 60, '2026-01-01')],
  plans: [plan(1, 1000, '2026-01-01')],
  entries: [] as DayEntry[],
};

describe('monthBill', () => {
  it('bills every day at plan when nothing changed', () => {
    const bill = monthBill(base);
    expect(bill.days).toHaveLength(30);
    expect(bill.days.every((d) => d.status === 'plan')).toBe(true);
    expect(bill.types[0]).toMatchObject({ totalMl: 30000, daysDelivered: 30, amountPaise: 180000 });
    expect(bill.totalPaise).toBe(180000);
    expect(bill.complete).toBe(true);
    expect(exceptions(bill)).toEqual([]);
  });

  it('leaves out a no-delivery day and prices a changed day', () => {
    const bill = monthBill({
      ...base,
      entries: [entry('2026-09-03', 1, 0), entry('2026-09-10', 1, 2000)],
    });
    expect(bill.days[2]!.status).toBe('none');
    expect(bill.days[9]!.status).toBe('changed');
    expect(bill.days[9]!.amountPaise).toBe(12000);
    // 28 days at 1 L + one day at 2 L = 30 L
    expect(bill.types[0]).toMatchObject({ totalMl: 30000, daysDelivered: 29, amountPaise: 180000 });
    expect(exceptions(bill).map((d) => d.date)).toEqual(['2026-09-03', '2026-09-10']);
  });

  it('treats an entry equal to the plan as the plan', () => {
    const bill = monthBill({ ...base, entries: [entry('2026-09-05', 1, 1000)] });
    expect(bill.days[4]!.status).toBe('plan');
  });

  it('keeps the old rate before a mid-month rate change', () => {
    const bill = monthBill({ ...base, rates: [...base.rates, rate(1, 64, '2026-09-15')] });
    const cow = bill.types[0]!;
    expect(cow.periods).toEqual([
      { paisePerLitre: 6000, from: '2026-09-01', to: '2026-09-14', days: 14, totalMl: 14000, amountPaise: 84000 },
      { paisePerLitre: 6400, from: '2026-09-15', to: '2026-09-30', days: 16, totalMl: 16000, amountPaise: 102400 },
    ]);
    expect(bill.totalPaise).toBe(186400);
  });

  it('applies a new daily quantity only from its date', () => {
    const bill = monthBill({ ...base, plans: [...base.plans, plan(1, 1500, '2026-09-21')] });
    // 20 × 1 L + 10 × 1.5 L = 35 L at ₹60
    expect(bill.types[0]!.totalMl).toBe(35000);
    expect(bill.totalPaise).toBe(210000);
    expect(bill.days[20]!.status).toBe('plan');
  });

  it('bills two milks and splits each by its own rate', () => {
    const bill = monthBill({
      ...base,
      types: [COW, BUFFALO],
      rates: [...base.rates, rate(2, 70, '2026-01-01')],
      plans: [...base.plans, plan(2, 500, '2026-01-01')],
      entries: [entry('2026-09-01', 2, 0)],
    });
    expect(bill.types.map((t) => t.amountPaise)).toEqual([180000, 101500]); // 29 × 0.5 L × ₹70
    expect(bill.totalPaise).toBe(281500);
    expect(bill.days[0]!.status).toBe('changed'); // cow still came
  });

  it('marks days before the first plan as off and bills nothing for them', () => {
    const bill = monthBill({ ...base, plans: [plan(1, 1000, '2026-09-16')] });
    expect(bill.days[14]!.status).toBe('off');
    expect(bill.days[15]!.status).toBe('plan');
    expect(bill.totalPaise).toBe(15 * 6000);
  });

  it('stops billing at asOf and projects the rest at plan', () => {
    const bill = monthBill({ ...base, asOf: '2026-09-25' });
    expect(bill.billedThrough).toBe('2026-09-25');
    expect(bill.complete).toBe(false);
    expect(bill.days[25]!.status).toBe('future');
    expect(bill.totalPaise).toBe(25 * 6000);
    expect(bill.projectedPaise).toBe(30 * 6000);
  });

  it('bills nothing for a month that has not started', () => {
    const bill = monthBill({ ...base, asOf: '2026-08-31' });
    expect(bill.billedThrough).toBeNull();
    expect(bill.totalPaise).toBe(0);
    expect(bill.types[0]!.totalMl).toBe(0);
  });

  it('reports milk without a rate instead of silently pricing it', () => {
    const bill = monthBill({ ...base, rates: [rate(1, 60, '2026-09-29')] });
    expect(bill.missingRate).toHaveLength(28);
    expect(bill.totalPaise).toBe(12000);
  });

  it('rounds each rate period once, to the paisa', () => {
    // 0.25 L × ₹65.50 × 30 = ₹491.25
    const bill = monthBill({ ...base, rates: [rate(1, 65.5, '2026-01-01')], plans: [plan(1, 250, '2026-01-01')] });
    expect(bill.totalPaise).toBe(49125);
    // 0.333 L × ₹61 × 30 = 609.39 (not 30 × round(20.313))
    const odd = monthBill({ ...base, rates: [rate(1, 61, '2026-01-01')], plans: [plan(1, 333, '2026-01-01')] });
    expect(odd.totalPaise).toBe(60939);
  });

  it('keeps a retired milk only in months it was delivered', () => {
    const retired = { ...BUFFALO, active: false };
    const input = { ...base, types: [COW, retired], rates: [...base.rates, rate(2, 70, '2026-01-01')] };
    expect(monthBill(input).types.map((t) => t.name)).toEqual(['Cow']);
    const withDelivery = monthBill({ ...input, entries: [entry('2026-09-02', 2, 1000)] });
    expect(withDelivery.types.map((t) => t.name)).toEqual(['Cow', 'Buffalo']);
  });

  it('handles February in a leap year', () => {
    const bill = monthBill({ ...base, month: '2028-02', asOf: '2028-03-01' });
    expect(bill.days).toHaveLength(29);
    expect(bill.totalPaise).toBe(29 * 6000);
  });
});

describe('inForce', () => {
  it('picks the latest record on or before the date', () => {
    const rates = [rate(1, 60, '2026-01-01'), rate(1, 64, '2026-09-15'), rate(1, 70, '2026-12-01')];
    expect(inForce(rates, 1, '2026-09-14')!.paisePerLitre).toBe(6000);
    expect(inForce(rates, 1, '2026-09-15')!.paisePerLitre).toBe(6400);
    expect(inForce(rates, 1, '2025-12-31')).toBeUndefined();
    expect(inForce(rates, 2, '2026-09-15')).toBeUndefined();
  });
});

describe('helpers', () => {
  it('formats and parses money and litres', () => {
    expect(inr(186400)).toBe('₹1,864');
    expect(inr(49125)).toBe('₹491.25');
    expect(inr(12345678)).toBe('₹1,23,456.78');
    expect(paiseFromText('64.5')).toBe(6450);
    expect(paiseFromText('₹1,200')).toBe(120000);
    expect(paiseFromText('6.555')).toBeNull();
    expect(litres(1500)).toBe('1.5 L');
    expect(mlFromText('.75')).toBe(750);
    expect(mlFromText('abc')).toBeNull();
  });

  it('walks months and validates dates', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(daysInMonth('2026-02')).toBe(28);
    expect(monthDays('2026-09')[29]).toBe('2026-09-30');
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(tomorrowIso(new Date(2026, 11, 31))).toBe('2027-01-01');
  });
});
