import { describe, expect, it } from 'vitest';
import { monthBill } from '../src/lib/billing';
import type { DayEntry, MilkType, Pause, Plan, Rate } from '../src/lib/billing';
import { ledger } from '../src/lib/ledger';
import type { MonthDue, Payment } from '../src/lib/ledger';

const COW: MilkType = { id: 1, name: 'Cow', active: true };

interface Customer {
  rates: Rate[];
  plans: Plan[];
  entries: DayEntry[];
  pauses: Pause[];
}

// Customer A: 1 L at Rs 60, one pause (3 days) and one 2 L day.
const A: Customer = {
  rates: [{ milkTypeId: 1, paisePerLitre: 6000, effectiveFrom: '2026-01-01' }],
  plans: [{ milkTypeId: 1, qtyMl: 1000, effectiveFrom: '2026-01-01' }],
  entries: [{ date: '2026-09-20', milkTypeId: 1, qtyMl: 2000 }],
  pauses: [{ id: 1, from: '2026-09-10', resumeOn: '2026-09-13' }],
};
// Customer B: 0.5 L at Rs 55.50, paused the first 5 days.
const B: Customer = {
  rates: [{ milkTypeId: 1, paisePerLitre: 5550, effectiveFrom: '2026-01-01' }],
  plans: [{ milkTypeId: 1, qtyMl: 500, effectiveFrom: '2026-01-01' }],
  entries: [],
  pauses: [{ id: 1, from: '2026-09-01', resumeOn: '2026-09-06' }],
};

const bill = (c: Customer) => monthBill({ month: '2026-09', asOf: '2026-09-30', types: [COW], ...c });

const pay = (id: number, paidOn: string, amountPaise: number, month: string): Payment => ({
  id,
  paidOn,
  amountPaise,
  note: '',
  screenshot: null,
  allocations: [{ month, amountPaise }],
});

describe('two customers', () => {
  it('bill independently with hand-computed paise', () => {
    const a = bill(A);
    // 30 days - 3 paused = 27 L at plan + 1 extra L on the 20th = 28 L x 6000
    expect(a.types[0]).toMatchObject({ totalMl: 28000, amountPaise: 168000 });
    expect(a.payablePaise).toBe(168000);
    expect(a.roundOffPaise).toBe(0);
    expect(a.paused).toEqual([{ from: '2026-09-10', to: '2026-09-12', days: 3 }]);

    const b = bill(B);
    // 25 days x 0.5 L = 12.5 L x 5550 = 69375 paise, rounded to 69400
    expect(b.types[0]).toMatchObject({ totalMl: 12500, amountPaise: 69375 });
    expect(b.totalPaise).toBe(69375);
    expect(b.payablePaise).toBe(69400);
    expect(b.roundOffPaise).toBe(25);
    expect(b.paused).toEqual([{ from: '2026-09-01', to: '2026-09-05', days: 5 }]);
  });

  it('gives the same result whichever customer is computed first', () => {
    const first = [bill(A), bill(B)];
    const second = [bill(B), bill(A)];
    expect(second[1]).toEqual(first[0]);
    expect(second[0]).toEqual(first[1]);
    expect(first[0]).not.toEqual(first[1]);
  });

  it('keeps each customer ledger separate', () => {
    const aMonths: MonthDue[] = [
      { month: '2026-08', payablePaise: 100000, final: true },
      { month: '2026-09', payablePaise: bill(A).payablePaise, final: true },
    ];
    const bMonths: MonthDue[] = [{ month: '2026-09', payablePaise: bill(B).payablePaise, final: true }];
    const aPay = [pay(1, '2026-09-05', 50000, '2026-08')];
    const bPay = [pay(2, '2026-10-01', 69400, '2026-09')];

    const la = ledger(aMonths, aPay);
    expect(la.months.map((m) => [m.month, m.paidPaise, m.duePaise])).toEqual([
      ['2026-08', 50000, 50000],
      ['2026-09', 0, 168000],
    ]);
    expect(la.duePaise).toBe(218000);
    expect(la.creditPaise).toBe(0);

    const lb = ledger(bMonths, bPay);
    expect(lb.months.map((m) => [m.month, m.paidPaise, m.duePaise, m.status])).toEqual([['2026-09', 69400, 0, 'paid']]);
    expect(lb.duePaise).toBe(0);
    expect(lb.creditPaise).toBe(0);
    // Computing B's ledger does not change A's.
    expect(ledger(aMonths, aPay)).toEqual(la);
  });
});
