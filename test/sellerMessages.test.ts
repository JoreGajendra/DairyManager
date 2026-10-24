import { afterEach, describe, expect, it } from 'vitest';
import { customerBillMessage, dueReminderMessage, receiptMessage, setLang, whatsappUrl } from '../src/lib';

afterEach(() => setLang('en'));

describe('customerBillMessage', () => {
  it('writes the bill to the customer, signed by the business', () => {
    expect(customerBillMessage('2026-09', 28000, 168000, 0, 'Sunita', 'Patil Dairy')).toBe(
      ['Hello Sunita,', '*Milk bill · September 2026*', 'Milk: 28 L', 'Bill: *₹1,680*', '— Patil Dairy'].join('\n'),
    );
  });

  it('shows paid and balance when something is paid, never below zero', () => {
    const text = customerBillMessage('2026-09', 15000, 90000, 40000, 'Sunita', '');
    expect(text).toContain('Paid: ₹400');
    expect(text).toContain('Balance: *₹500*');
    expect(text).not.toContain('—');
    expect(customerBillMessage('2026-09', 15000, 90000, 95000, '', '')).toContain('Balance: *₹0*');
  });

  it('is written in Marathi when saved so', () => {
    setLang('mr');
    const text = customerBillMessage('2026-09', 28000, 168000, 50000, 'सुनीता', 'पाटील डेअरी');
    expect(text).toContain('नमस्कार सुनीता,');
    expect(text).toContain('बिल: *₹1,680*');
    expect(text).toContain('बाकी: *₹1,180*');
    expect(text).toContain('— पाटील डेअरी');
  });
});

describe('receiptMessage', () => {
  const alloc = [
    { month: '2026-08', amountPaise: 50000 },
    { month: '2026-09', amountPaise: 20000 },
  ];
  it('thanks the customer and lists the months, marking the running one as advance', () => {
    const text = receiptMessage(70000, '2026-09-05', 'UPI', alloc, '2026-09', 'Sunita', 'Patil Dairy');
    expect(text).toContain('Hello Sunita,');
    expect(text).toContain('*Payment received*');
    expect(text).toContain('Amount: *₹700*');
    expect(text).toContain('Mode: UPI');
    expect(text).toContain('• August 2026: ₹500');
    expect(text).toContain('• September 2026 (advance): ₹200');
    expect(text).toContain('Thank you!');
    expect(text.endsWith('— Patil Dairy')).toBe(true);
  });

  it('works with no note and no allocations, in Marathi', () => {
    setLang('mr');
    const text = receiptMessage(50000, '2026-09-05', '', [], '2026-09', '', '');
    expect(text).toContain('*पैसे मिळाले*');
    expect(text).toContain('₹500');
    expect(text).toContain('धन्यवाद!');
    expect(text).not.toContain('Mode');
  });
});

describe('dueReminderMessage', () => {
  const months = [
    { month: '2026-07', payablePaise: 100000, paidPaise: 100000 },
    { month: '2026-08', payablePaise: 100000, paidPaise: 50000 },
    { month: '2026-09', payablePaise: 168000, paidPaise: 0 },
  ];
  it('lists only months still owed and the total', () => {
    const text = dueReminderMessage(months, 'Sunita', 'Patil Dairy');
    expect(text).not.toContain('July');
    expect(text).toContain('August 2026: ₹500');
    expect(text).toContain('September 2026: ₹1,680');
    expect(text).toContain('*Total to pay: ₹2,180*');
    expect(text).toContain('*Milk bill reminder*');
  });

  it('is written in Marathi', () => {
    setLang('mr');
    const text = dueReminderMessage(months, 'सुनीता', 'पाटील डेअरी');
    expect(text).toContain('*एकूण भरायचे: ₹2,180*');
    expect(text).toContain('*दुधाच्या बिलाची आठवण*');
  });

  it('opens a wa.me chat with the text', () => {
    const url = whatsappUrl('98765 43210', dueReminderMessage(months, '', ''));
    expect(url.startsWith('https://wa.me/919876543210?text=')).toBe(true);
  });
});
