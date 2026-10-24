/** Milk quantity. Stored in whole millilitres, shown in litres. */
import { tr } from './i18n';
import { inr } from './money';

const LITRES = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 });

/** `1 L`, `1.5 L`, `0.25 L`. */
export const litres = (ml: number): string => `${LITRES.format(ml / 1000)} ${tr('L')}`;

/** `₹64 / L`. */
export const perLitre = (paise: number): string => `${inr(paise)} / ${tr('L')}`;

/** Just the number, for tight calendar cells: `1.5`. */
export const litreDigits = (ml: number): string => LITRES.format(ml / 1000);

/** Parse typed litres (`1`, `1.5`, `.75`) into millilitres, or null. */
export function mlFromText(text: string): number | null {
  const clean = text.trim();
  if (!/^(\d+(\.\d{0,3})?|\.\d{1,3})$/.test(clean)) return null;
  return Math.round(Number(clean) * 1000);
}

/** The step the +/- buttons move by. */
export const QTY_STEP_ML = 250;
