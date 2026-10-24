/**
 * The WhatsApp messages the milk provider sends to a household customer,
 * written in the provider's voice and the saved language. Kept away from the
 * screens so the wording is tested once. Send with `whatsappUrl` (whatsapp.ts).
 */
import { dateLabel, monthLabel } from './dates';
import type { IsoDate, IsoMonth } from './dates';
import { tr } from './i18n';
import type { Allocation } from './ledger';
import { inr } from './money';
import { litres } from './quantity';

const greeting = (customer: string): string => (customer.trim() ? tr('Hello {name},', { name: customer.trim() }) : '');
const signed = (lines: string[], business: string): string => {
  const text = lines.filter((l, i) => l !== '' || i > 0).join('\n');
  return business.trim() ? `${text}\n— ${business.trim()}` : text;
};

/** The month's bill in one message, less any advance already paid. */
export function customerBillMessage(
  month: IsoMonth,
  litresMl: number,
  payablePaise: number,
  paidPaise: number,
  customer: string,
  business: string,
): string {
  const lines = [
    greeting(customer),
    tr('*Milk bill · {month}*', { month: monthLabel(month) }),
    tr('Milk: {qty}', { qty: litres(litresMl) }),
    tr('Bill: *{amount}*', { amount: inr(payablePaise) }),
  ];
  if (paidPaise > 0) {
    lines.push(tr('Paid: {amount}', { amount: inr(paidPaise) }), tr('Balance: *{amount}*', { amount: inr(Math.max(0, payablePaise - paidPaise)) }));
  }
  return signed(lines, business);
}

/** After a payment is recorded: how much, when, which months, and thanks. */
export function receiptMessage(
  amountPaise: number,
  paidOn: IsoDate,
  note: string,
  allocations: Allocation[],
  runningMonth: IsoMonth,
  customer: string,
  business: string,
): string {
  const lines = [
    greeting(customer),
    tr('*Payment received*'),
    tr('Amount: *{amount}*', { amount: inr(amountPaise) }),
    tr('Date: {date}', { date: dateLabel(paidOn) }),
  ];
  if (note.trim()) lines.push(tr('Mode: {mode}', { mode: note.trim() }));
  if (allocations.length) {
    lines.push('', tr('For:'));
    for (const a of allocations) {
      const vars = { month: monthLabel(a.month), amount: inr(a.amountPaise) };
      lines.push(`• ${a.month === runningMonth ? tr('{month} (advance): {amount}', vars) : tr('{month}: {amount}', vars)}`);
    }
  }
  lines.push('', tr('Thank you!'));
  return signed(lines, business);
}

export interface DueLine {
  month: IsoMonth;
  payablePaise: number;
  paidPaise: number;
}

/** A gentle reminder listing each month still owed and the total to pay. */
export function dueReminderMessage(months: DueLine[], customer: string, business: string): string {
  const balance = (m: DueLine): number => Math.max(0, m.payablePaise - m.paidPaise);
  const owed = months.filter((m) => balance(m) > 0);
  const total = owed.reduce((s, m) => s + balance(m), 0);
  const lines = [greeting(customer), tr('*Milk bill reminder*')];
  for (const m of owed) lines.push(tr('{month}: {amount}', { month: monthLabel(m.month), amount: inr(balance(m)) }));
  lines.push(tr('*Total to pay: {amount}*', { amount: inr(total) }), '', tr('Please pay when you can. Thank you!'));
  return signed(lines, business);
}
