/**
 * Calendar dates as ISO strings (`2026-09-25`) and months as `2026-09`.
 *
 * <p>A delivery belongs to a day on the wall calendar, not to an instant, so
 * nothing here goes through a timezone: strings compare in date order, and a
 * `Date` is only built in UTC to find weekdays and month lengths.
 */

import { getLang } from './i18n';

export type IsoDate = string;
export type IsoMonth = string;

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const SHORT_MR = ['जाने', 'फेब्रु', 'मार्च', 'एप्रि', 'मे', 'जून', 'जुलै', 'ऑग', 'सप्टें', 'ऑक्टो', 'नोव्हें', 'डिसें'] as const;
const LONG_MR = [
  'जानेवारी', 'फेब्रुवारी', 'मार्च', 'एप्रिल', 'मे', 'जून',
  'जुलै', 'ऑगस्ट', 'सप्टेंबर', 'ऑक्टोबर', 'नोव्हेंबर', 'डिसेंबर',
] as const;
const WEEKDAYS_MR = ['रवि', 'सोम', 'मंगळ', 'बुध', 'गुरु', 'शुक्र', 'शनि'] as const;

/** Month and weekday names in the app's current language. */
const shortMonths = (): readonly string[] => (getLang() === 'mr' ? SHORT_MR : SHORT);
const longMonths = (): readonly string[] => (getLang() === 'mr' ? LONG_MR : LONG);

const pad = (n: number): string => String(n).padStart(2, '0');

/** Today on the phone's own clock. */
export function todayIso(now: Date = new Date()): IsoDate {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const monthOf = (date: IsoDate): IsoMonth => date.slice(0, 7);

const parts = (month: IsoMonth): [number, number] => {
  const [y, m] = month.split('-').map(Number);
  return [y!, m!];
};

export function daysInMonth(month: IsoMonth): number {
  const [y, m] = parts(month);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Every day of the month, in order. */
export function monthDays(month: IsoMonth): IsoDate[] {
  return Array.from({ length: daysInMonth(month) }, (_, i) => `${month}-${pad(i + 1)}`);
}

/** `2026-09` moved by n months, either way. */
export function addMonths(month: IsoMonth, n: number): IsoMonth {
  const [y, m] = parts(month);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** 0 = Sunday. */
export function weekday(date: IsoDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

export const weekdayLabel = (date: IsoDate): string => (getLang() === 'mr' ? WEEKDAYS_MR : WEEKDAYS)[weekday(date)]!;

/** `September 2026`. */
export function monthLabel(month: IsoMonth): string {
  const [y, m] = parts(month);
  return `${longMonths()[m - 1]} ${y}`;
}

/** `25 Sep 2026`. */
export function dateLabel(date: IsoDate): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${pad(d!)} ${shortMonths()[m! - 1]} ${y}`;
}

/** `25 Sep`, for lists inside one month. */
export function dayMonthLabel(date: IsoDate): string {
  const [, m, d] = date.split('-').map(Number);
  return `${pad(d!)} ${shortMonths()[m! - 1]}`;
}

/** Strict `YYYY-MM-DD` check that also rejects 31 Feb. */
export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const [y, m, d] = text.split('-').map(Number);
  return m! >= 1 && m! <= 12 && d! >= 1 && d! <= daysInMonth(`${y}-${pad(m!)}`);
}

/** Tomorrow on the phone's own clock. */
export function tomorrowIso(now: Date = new Date()): IsoDate {
  return todayIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
}

/** The calendar day after `date`. */
export function nextDay(date: IsoDate): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y!, m! - 1, d! + 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** The calendar day before `date`. */
export function previousDay(date: IsoDate): IsoDate {
  const [y, m, d] = date.split('-').map(Number);
  const prev = new Date(Date.UTC(y!, m! - 1, d! - 1));
  return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
}
