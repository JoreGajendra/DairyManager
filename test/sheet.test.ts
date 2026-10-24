import { describe, expect, it } from 'vitest';
import { monthBill } from '../src/lib/billing';
import type { DayEntry, Plan } from '../src/lib/billing';
import { creditToUse, ledger, outstanding, splitPayment } from '../src/lib/ledger';

/**
 * The household's own handwritten sheet for Jan–Mar 2026 at ₹85 a litre,
 * entered the way the app would record it: a daily plan that changes a few
 * times, and 0 for each day nothing came.
 */
const COW = { id: 1, name: 'Cow', active: true };
const rates = [{ milkTypeId: 1, paisePerLitre: 8500, effectiveFrom: '2026-01-01' }];
const plans: Plan[] = [
  ['2026-01-01', 1500], ['2026-01-14', 1000],
  ['2026-02-01', 1000], ['2026-02-06', 2000], ['2026-02-12', 1500],
  ['2026-03-01', 1500], ['2026-03-27', 1000],
].map(([effectiveFrom, qtyMl]) => ({ milkTypeId: 1, effectiveFrom: effectiveFrom as string, qtyMl: qtyMl as number }));
const zeros = ['2026-01-01', '2026-01-12', '2026-01-18', '2026-01-21', '2026-01-27', '2026-02-25', '2026-03-05', '2026-03-19', '2026-03-24', '2026-03-25'];
const entries: DayEntry[] = zeros.map((date) => ({ date, milkTypeId: 1, qtyMl: 0 }));

const bill = (month: string) => monthBill({ month, asOf: '2026-09-25', types: [COW], rates, plans, entries });

describe('the Jan–Mar 2026 sheet', () => {
  it.each([
    ['2026-01', 31500, 267750, 267800],
    ['2026-02', 41000, 348500, 348500],
    ['2026-03', 38000, 323000, 323000],
  ])('%s: litres, exact amount and rounded bill match', (month, ml, exact, payable) => {
    const b = bill(month);
    expect(b.types[0]!.totalMl).toBe(ml);
    expect(b.totalPaise).toBe(exact);
    expect(b.payablePaise).toBe(payable);
  });

  it('matches each half-month column total', () => {
    const half = (month: string, from: number, to: number) =>
      bill(month).days.slice(from - 1, to).reduce((s, d) => s + d.totalMl, 0);
    expect([half('2026-01', 1, 16), half('2026-01', 17, 31)]).toEqual([19500, 12000]);
    expect([half('2026-02', 1, 16), half('2026-02', 17, 28)]).toEqual([24500, 16500]);
    expect([half('2026-03', 1, 16), half('2026-03', 17, 31)]).toEqual([22500, 15500]);
  });

  it('shows the round-off the sheet does by hand', () => {
    expect(bill('2026-01').roundOffPaise).toBe(50);
  });
});

describe('ledger', () => {
  const months = ['2026-01', '2026-02', '2026-03'].map((m) => ({ month: m, payablePaise: bill(m).payablePaise, final: true }));
  const pay = (amountPaise: number, allocations: { month: string; amountPaise: number }[] = [], id = 1) => ({
    id, paidOn: '2026-04-05', amountPaise, note: '', screenshot: null, allocations,
  });
  const status = (l: ReturnType<typeof ledger>) => l.months.map((m) => m.status);

  it('owes everything before any payment', () => {
    const l = ledger(months, []);
    expect(l.duePaise).toBe(267800 + 348500 + 323000);
    expect(status(l)).toEqual(['unpaid', 'unpaid', 'unpaid']);
  });

  it('settles the months ticked, even when they skip one', () => {
    const allocations = splitPayment(267800 + 323000, [
      { month: '2026-01', duePaise: 267800 },
      { month: '2026-03', duePaise: 323000 },
    ]);
    const l = ledger(months, [pay(590800, allocations)]);
    expect(status(l)).toEqual(['paid', 'unpaid', 'paid']);
    expect(l.duePaise).toBe(348500);
  });

  it('part-pays the newest ticked month when the payment is short', () => {
    const allocations = splitPayment(500000, months.slice(0, 2).map((m) => ({ month: m.month, duePaise: m.payablePaise })));
    expect(allocations).toEqual([{ month: '2026-01', amountPaise: 267800 }, { month: '2026-02', amountPaise: 232200 }]);
    const l = ledger(months, [pay(500000, allocations)]);
    expect(l.months.map((m) => [m.status, m.duePaise])).toEqual([['paid', 0], ['part', 116300], ['unpaid', 323000]]);
  });

  it('takes a mid-month advance off the final bill', () => {
    const running = [...months, { month: '2026-04', payablePaise: 120000, final: false }];
    const advance = pay(200000, [{ month: '2026-04', amountPaise: 200000 }]);
    const during = ledger(running, [advance]);
    expect(during.months[3]).toMatchObject({ status: 'advance', paidPaise: 200000, duePaise: -80000 });
    expect(during.duePaise).toBe(939300);
    // April ends at ₹3,400: ₹1,400 left to pay.
    const ended = ledger([...months, { month: '2026-04', payablePaise: 340000, final: true }], [advance]);
    expect(ended.months[3]).toMatchObject({ status: 'part', duePaise: 140000 });
  });

  it('moves money paid over a finished bill to the oldest bill owing, then to credit', () => {
    const over = ledger(months, [pay(400000, [{ month: '2026-03', amountPaise: 400000 }])]);
    expect(over.months.map((m) => m.paidPaise)).toEqual([77000, 0, 323000]);
    const unassigned = ledger(months, [pay(1000000)]);
    expect(unassigned.duePaise).toBe(0);
    expect(unassigned.creditPaise).toBe(1000000 - 939300);
  });

  it('adds up what is outstanding, net of credit', () => {
    const running = [...months, { month: '2026-04', payablePaise: 120000, final: false }];
    // Jan and Feb cleared, March paid ₹1,000 over its bill: ₹1,000 credit, April so far ₹1,200.
    const l = ledger(running, [pay(267800 + 348500 + 323000 + 100000, [])]);
    expect(outstanding(l)).toEqual({ previousPaise: 0, currentPaise: 120000, currentPaidPaise: 0, creditPaise: 100000, netPaise: 20000 });
    // With unpaid March, previous due and credit do not both exist.
    const owing = ledger(running, [pay(267800 + 348500)]);
    expect(outstanding(owing)).toMatchObject({ previousPaise: 323000, creditPaise: 0, netPaise: 323000 + 120000 });
  });

  it('puts credit on the running month, and the net owed stays the same', () => {
    const running = [...months, { month: '2026-04', payablePaise: 120000, final: false }];
    const payments = [pay(267800 + 348500 + 323000 + 100000)];
    const before = ledger(running, payments);
    expect(creditToUse(before)).toBe(100000);
    const after = ledger(running, payments, [{ month: '2026-04', amountPaise: 100000 }]);
    expect(after.creditPaise).toBe(0);
    expect(after.months[3]).toMatchObject({ status: 'advance', paidPaise: 100000, duePaise: 20000 });
    expect(outstanding(after).netPaise).toBe(outstanding(before).netPaise);
    // The month ends at ₹1,500: the credit is now paid towards it.
    const ended = ledger([...months, { month: '2026-04', payablePaise: 150000, final: true }], payments, [{ month: '2026-04', amountPaise: 100000 }]);
    expect(ended.months[3]).toMatchObject({ status: 'part', duePaise: 50000 });
    expect(ended.duePaise).toBe(50000);
  });
});
