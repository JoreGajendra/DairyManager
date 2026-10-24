import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { dateLabel, monthLabel, weekdayLabel } from '../src/lib/dates';
import { getLang, setLang, tr } from '../src/lib/i18n';
import { MR } from '../src/lib/mr';
import { litres, perLitre } from '../src/lib/quantity';

const ROOT = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === 'android' || name === 'ios' ? [] : sources(path);
    return /\.tsx?$/.test(name) && name !== 'mr.ts' ? [path] : [];
  });
}

/** Every English text the app passes to `tr()`, read out of the source. */
function usedKeys(): Set<string> {
  const call = /\btr\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`([^`$]*)`)/g;
  const keys = new Set<string>();
  for (const file of [...sources(join(ROOT, 'src')), join(ROOT, 'App.tsx')]) {
    for (const m of readFileSync(file, 'utf8').matchAll(call)) keys.add((m[1] ?? m[2] ?? m[3]!).replace(/\\'/g, "'"));
  }
  return keys;
}

/**
 * All source text, for the leftover check. A key counts as used when it appears
 * as a quoted string anywhere in the source, which also covers texts looked up
 * from tables (tab labels, date choices) and passed to `tr()` as a variable.
 */
function sourceText(): string {
  return [...sources(join(ROOT, 'src')), join(ROOT, 'App.tsx')].map((f) => readFileSync(f, 'utf8')).join('\n');
}

const holes = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();
// Words the date pickers look up from a table rather than a `tr()` call.
const TABLE_KEYS = ['1st of this month', '1st of next month', 'Yesterday', 'Today', 'Tomorrow', 'Other date', 'Customers', 'Bills', 'Dues', 'Setup'];

describe('Marathi', () => {
  afterEach(() => setLang('en'));

  it('translates every text the app shows', () => {
    const missing = [...usedKeys(), ...TABLE_KEYS].filter((key) => !MR[key]);
    expect(missing).toEqual([]);
  });

  it('has no translation left over from text that was removed', () => {
    const text = sourceText();
    const quoted = (key: string) => [`'${key.replace(/'/g, "\\'")}'`, `"${key}"`, '`' + key + '`'].some((q) => text.includes(q));
    expect(Object.keys(MR).filter((key) => !quoted(key))).toEqual([]);
  });

  it('keeps the {names} and bold marks of each text', () => {
    for (const [en, mr] of Object.entries(MR)) {
      expect(holes(mr), en).toEqual(holes(en));
      expect(mr.split('*').length, en).toBe(en.split('*').length);
    }
  });

  it('falls back to English for a text with no translation', () => {
    setLang('mr');
    expect(tr('Nothing like this exists')).toBe('Nothing like this exists');
    expect(tr('Paid {amount}', { amount: '₹5' })).toBe('भरले ₹5');
  });

  it('names months, weekdays and dates in Marathi', () => {
    setLang('mr');
    expect(getLang()).toBe('mr');
    expect(monthLabel('2026-09')).toBe('सप्टेंबर 2026');
    expect(weekdayLabel('2026-10-12')).toBe('सोम');
    expect(dateLabel('2026-10-12')).toBe('12 ऑक्टो 2026');
    expect(litres(1500)).toBe('1.5 लि');
    expect(perLitre(6400)).toBe('₹64 / लि');
  });
});
