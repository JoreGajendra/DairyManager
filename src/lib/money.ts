/**
 * Indian rupee formatting. Money is stored and added up in whole paise so a
 * month of half-litre days never drifts by a floating-point paisa; rupees only
 * appear at the edge, when a figure is shown.
 */

const WHOLE = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const PAISE = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** `₹1,860` when the amount is whole rupees, `₹1,860.50` when it is not. */
export function inr(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}₹${abs % 100 === 0 ? WHOLE.format(abs / 100) : PAISE.format(abs / 100)}`;
}

/** Digits only, same rule as `inr`: `1,860` or `1,860.50`. */
export const inrDigits = (paise: number): string => inr(paise).replace('₹', '');

/** Parse what someone typed as a rupee amount (`64`, `64.5`, `1,200`) into paise, or null. */
export function paiseFromText(text: string): number | null {
  const clean = text.replace(/[₹,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

/** Paise back to the plain text an input field shows: `64`, `64.5`. */
export const rupeeText = (paise: number): string => String(paise / 100);
