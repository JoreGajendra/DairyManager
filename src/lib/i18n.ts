/**
 * The app's languages. Every sentence is written once in English and looked up
 * by that English text, so a missing translation shows English rather than
 * nothing. The language is one module-level setting: a screen calls `tr` while
 * it renders, and changing the language re-renders the app.
 */
import { MR } from './mr';

export type Lang = 'en' | 'mr';

export const LANGUAGES: readonly { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'mr', label: 'मराठी' },
];

let current: Lang = 'en';

export const setLang = (lang: Lang): void => {
  current = lang;
};

export const getLang = (): Lang => current;

export const isLang = (value: string): value is Lang => value === 'en' || value === 'mr';

/** `tr('Paid {amount}', { amount: '₹5' })`: the text in the current language, `{name}` filled in. */
export function tr(text: string, vars?: Record<string, string | number>): string {
  const line = current === 'mr' ? (MR[text] ?? text) : text;
  return vars ? line.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? '')) : line;
}
