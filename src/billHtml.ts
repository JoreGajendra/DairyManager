import { dateLabel, dayMonthLabel, exceptions, getLang, inr, litreDigits, litres, monthLabel, setLang, tr } from './lib'
import type { BillDay, IsoDate, Lang, Ledger, LedgerMonth, MilkType, MonthBill, Payment } from './lib'
import { C } from './ui/theme'

/** Who the bill is from and to, and the language it is written in. Independent of the database. */
export interface BillHeader {
  businessName: string
  businessPhone: string
  customerName: string
  customerPhone: string
  customerAddress: string
  lang: Lang
}

/** Runs `build` with the bill's language set, then restores the app's language. */
function inLang<T>(lang: Lang, build: () => T): T {
  const before = getLang()
  setLang(lang)
  try {
    return build()
  } finally {
    setLang(before)
  }
}

/**
 * The bills `expo-print` turns into PDFs, laid out like the household's own
 * sheet: two Date / Qty columns (1–16 and 17–end) with a total under each, then
 * total litres × rate = the amount, rounded to the rupee.
 */

const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** What changed on a day, in words: `No delivery` or `Cow 2 L (plan 1 L)`. */
export function changeText(day: BillDay, types: MilkType[]): string {
  if (day.status === 'none') return tr('No delivery')
  const name = (id: number) => types.find((t) => t.id === id)?.name ?? ''
  return day.items
    .filter((i) => i.overridden)
    .map((i) => tr('{name} {qty} (plan {plan})', { name: name(i.milkTypeId), qty: litres(i.qtyMl), plan: litres(i.plannedMl) }))
    .join(', ')
}

/** What a day shows in the sheet: litres, 0 for no delivery, blank before it happens. */
export function sheetQty(day: BillDay, milkTypeId: number, billedThrough: IsoDate | null): string {
  if (billedThrough === null || day.date > billedThrough) return ''
  const item = day.items.find((i) => i.milkTypeId === milkTypeId)
  return item ? litreDigits(item.qtyMl) : ''
}

const STYLE = `
  * { margin: 0; box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, 'Noto Sans Devanagari', 'Segoe UI', sans-serif; color: ${C.ink}; padding: 36px; font-size: 12px; }
  .brand { font-weight: 800; font-size: 20px; color: ${C.navy}; } .brand b { color: ${C.blueText}; }
  h1 { font-size: 20px; color: ${C.navy}; } h2 { font-size: 16px; color: ${C.navy}; margin-bottom: 8px; }
  .l { font-size: 9.5px; letter-spacing: .4px; text-transform: uppercase; color: rgba(23,34,51,.6); margin-bottom: 2px; }
  .m { color: rgba(23,34,51,.6); }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 3px 4px; border-bottom: 1px solid ${C.line}; text-align: left; vertical-align: top; }
  th { font-weight: 400; font-size: 9.5px; letter-spacing: .4px; text-transform: uppercase; color: rgba(23,34,51,.6); }
  .r { text-align: right; } .b { font-weight: 700; }
  .sheet { display: flex; align-items: flex-start; gap: 24px; margin-bottom: 12px; } .sheet > table { flex: 1; }
  .sheet tr.t td { border-top: 1.5px solid ${C.navy}; border-bottom: 0; font-weight: 700; }
  .total { display: flex; justify-content: space-between; align-items: baseline; border-top: 2px solid ${C.navy}; padding-top: 8px; margin-top: 4px; }
  .fig { font-size: 22px; font-weight: 800; color: ${C.navy}; }
  .month { page-break-inside: avoid; margin-bottom: 28px; }
`

const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>${body}</body></html>`

function head(title: string, subtitle: string, settings: BillHeader): string {
  const name = settings.businessName.trim()
  const party = (label: string, lines: string[], align: string) => {
    const shown = lines.map((l) => l.trim()).filter(Boolean)
    return shown.length ? `<div style="text-align:${align}"><div class="l">${label}</div>${shown.map(esc).join('<br>')}</div>` : '<div></div>'
  }
  return `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
    <div class="brand">${name ? esc(name) : 'milk<b>diary</b>'}</div>
    <div style="text-align:right"><h1>${title}</h1><div class="m">${subtitle}</div></div></div>
  <div style="display:flex;justify-content:space-between;margin-bottom:16px">${party(tr('From'), [settings.businessPhone], 'left')}${party(tr('To'), [settings.customerName, settings.customerPhone, settings.customerAddress], 'right')}</div>`
}

/** One month in the sheet layout, with its amount lines and the days that were different. */
function monthSection(bill: MonthBill, types: MilkType[], notes: Record<IsoDate, string>): string {
  const shown = bill.types.filter((t) => t.totalMl > 0)
  const cols = shown.length ? shown : bill.types
  const half = (days: BillDay[]) => {
    const heads = cols.map((t) => `<th class="r">${cols.length > 1 ? esc(t.name) : tr('Qty')}</th>`).join('')
    const rows = days
      .map(
        (d) => `<tr><td>${Number(d.date.slice(8))}</td>${cols.map((t) => `<td class="r">${sheetQty(d, t.milkTypeId, bill.billedThrough)}</td>`).join('')}</tr>`,
      )
      .join('')
    const totals = cols
      .map((t) => {
        const ml = days
          .filter((d) => bill.billedThrough !== null && d.date <= bill.billedThrough)
          .reduce((s, d) => s + (d.items.find((i) => i.milkTypeId === t.milkTypeId)?.qtyMl ?? 0), 0)
        return `<td class="r">${litreDigits(ml)}</td>`
      })
      .join('')
    return `<table><tr><th>${tr('Date')}</th>${heads}</tr>${rows}<tr class="t"><td>${tr('Total')}</td>${totals}</tr></table>`
  }
  const lines = shown
    .flatMap((t) =>
      t.periods.map(
        (p) => `<tr><td>${esc(t.name)}${t.periods.length > 1 ? ` <span class="m">${dayMonthLabel(p.from)}–${dayMonthLabel(p.to)}</span>` : ''}</td>
          <td class="r">${litres(p.totalMl)} × ${inr(p.paisePerLitre)} =</td><td class="r">${inr(p.amountPaise)}</td></tr>`,
      ),
    )
    .join('')
  const roundOff = bill.roundOffPaise
    ? `<tr><td class="m">${tr('Round off')}</td><td></td><td class="r m">${bill.roundOffPaise > 0 ? '+' : '−'}${inr(Math.abs(bill.roundOffPaise))}</td></tr>`
    : ''
  // Changed days and paused stretches, in date order.
  const different = [
    ...exceptions(bill)
      .filter((d) => d.status !== 'future')
      .map((d): [string, string] => [
        d.date,
        `<tr><td style="width:60px">${dayMonthLabel(d.date)}</td><td>${esc(changeText(d, types))}${notes[d.date] ? ` <span class="m">— ${esc(notes[d.date]!)}</span>` : ''}</td></tr>`,
      ]),
    ...bill.paused.map((r): [string, string] => [
      r.from,
      `<tr><td style="width:60px">${dayMonthLabel(r.from)}</td><td>${r.days > 1 ? tr('Paused to {date} · {count} days', { date: dayMonthLabel(r.to), count: r.days }) : tr('Paused · 1 day')}</td></tr>`,
    ]),
  ]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, row]) => row)
    .join('')
  const totalMl = shown.reduce((s, t) => s + t.totalMl, 0)
  return `<div class="sheet">${half(bill.days.slice(0, 16))}${half(bill.days.slice(16))}</div>
    <table><tr><td class="b">${tr('Total qty')}</td><td class="r b">${litres(totalMl)}</td><td></td></tr>${lines}${roundOff}</table>
    <div class="total"><div class="l">${tr('Total bill amount')}</div><div class="fig">${inr(bill.payablePaise)}</div></div>
    ${different ? `<div class="l" style="margin:14px 0 4px">${tr('Days that were different')}</div><table>${different}</table>` : ''}`
}

/** "Paid ₹2,000 · Balance ₹1,485" under a month's total, when something was paid towards it. */
function paidLine(row: LedgerMonth | undefined): string {
  if (!row || row.paidPaise === 0) return ''
  const rest =
    row.duePaise > 0
      ? tr('Balance {amount}', { amount: inr(row.duePaise) })
      : row.duePaise < 0
        ? tr('Paid ahead {amount}', { amount: inr(-row.duePaise) })
        : tr('Fully paid')
  return `<div style="display:flex;justify-content:space-between;margin-top:6px"><div class="m">${row.final ? tr('Paid {amount}', { amount: inr(row.paidPaise) }) : tr('Advance paid {amount}', { amount: inr(row.paidPaise) })}</div><div class="b">${rest}</div></div>`
}

/** One month's bill, with what is already paid towards it. */
export function billHtml(bill: MonthBill, types: MilkType[], settings: BillHeader, notes: Record<IsoDate, string>, paid?: LedgerMonth): string {
  return inLang(settings.lang, () => {
    const through = bill.complete ? '' : bill.billedThrough ? ` · ${tr('to {date}', { date: dayMonthLabel(bill.billedThrough) })}` : ` · ${tr('not started')}`
    return page(head(tr('Milk bill'), `${monthLabel(bill.month)}${through}`, settings) + monthSection(bill, types, notes) + paidLine(paid))
  })
}

/**
 * A payment receipt for the provider: amount, date, the months it is for, the
 * transaction screenshot, and each of those months' bills.
 */
export function receiptHtml(
  payment: Payment,
  ledger: Ledger,
  bills: Record<string, MonthBill>,
  types: MilkType[],
  settings: BillHeader,
  notes: Record<IsoDate, string>,
  screenshot: { base64: string; mime: string } | null,
): string {
  return inLang(settings.lang, () => {
    const rows = payment.allocations
      .map((a) => {
        const m = ledger.months.find((x) => x.month === a.month)
        const state = !m ? '' : !m.final ? tr('advance') : m.duePaise === 0 ? tr('fully paid') : tr('{amount} still due', { amount: inr(m.duePaise) })
        return `<tr><td>${monthLabel(a.month)}</td><td class="r">${m ? inr(m.payablePaise) : ''}${m && !m.final ? ` ${tr('so far')}` : ''}</td><td class="r b">${inr(a.amountPaise)}</td><td class="r m">${state}</td></tr>`
      })
      .join('')
    const picture = screenshot
      ? `<div class="l" style="margin:18px 0 6px">${tr('Transaction screenshot')}</div><img src="data:${screenshot.mime};base64,${screenshot.base64}" style="max-width:100%;max-height:640px;border:1px solid ${C.line};border-radius:8px">`
      : ''
    const months = payment.allocations
      .map((a) => bills[a.month])
      .filter((b): b is MonthBill => b !== undefined)
      .map((b) => `<div class="month" style="page-break-before:always"><h2>${monthLabel(b.month)}</h2>${monthSection(b, types, notes)}</div>`)
      .join('')
    return page(
      head(tr('Payment'), dateLabel(payment.paidOn), settings) +
        `<div class="total" style="border-top:0;padding-top:0"><div><div class="l">${tr('Paid')}</div>${payment.note ? esc(payment.note) : ''}</div><div class="fig">${inr(payment.amountPaise)}</div></div>
      <table style="margin-top:14px"><tr><th>${tr('For')}</th><th class="r">${tr('Bill')}</th><th class="r">${tr('Paid now')}</th><th></th></tr>${rows}</table>
      <div class="total" style="margin-top:14px"><div class="l">${tr('Still to pay on finished months')}</div><div class="fig" style="font-size:18px">${inr(ledger.duePaise)}</div></div>` +
        picture +
        months,
    )
  })
}

/**
 * Several months to pay together: a summary of what each month costs and what
 * is already paid against it, the total due, then each month's sheet.
 */
export function statementHtml(
  bills: MonthBill[],
  ledger: Ledger,
  payments: Payment[],
  types: MilkType[],
  settings: BillHeader,
  notes: Record<IsoDate, string>,
): string {
  return inLang(settings.lang, () => {
    const rows = bills.map((b) => ledger.months.find((m) => m.month === b.month)!).filter(Boolean)
    const due = rows.reduce((s, m) => s + m.duePaise, 0)
    const range = bills.length ? `${monthLabel(bills[0]!.month)} – ${monthLabel(bills[bills.length - 1]!.month)}` : ''
    const summary = `<table style="margin-bottom:6px"><tr><th>${tr('Month')}</th><th class="r">${tr('Bill')}</th><th class="r">${tr('Paid')}</th><th class="r">${tr('Due')}</th></tr>
    ${rows.map((m) => `<tr><td>${monthLabel(m.month)}</td><td class="r">${inr(m.payablePaise)}</td><td class="r">${m.paidPaise ? inr(m.paidPaise) : '–'}</td><td class="r b">${inr(m.duePaise)}</td></tr>`).join('')}</table>
    <div class="total" style="margin-bottom:10px"><div class="l">${tr('Total to pay')}</div><div class="fig">${inr(due)}</div></div>`
    const recent = payments.slice(0, 5)
    const paid = recent.length
      ? `<div class="l" style="margin:10px 0 4px">${tr('Last payments')}</div><table>${recent.map((p) => `<tr><td>${dateLabel(p.paidOn)}</td><td class="r">${inr(p.amountPaise)}</td><td class="m">${esc(p.note)}</td></tr>`).join('')}</table>`
      : ''
    const months = bills.map((b) => `<div class="month"><h2>${monthLabel(b.month)}</h2>${monthSection(b, types, notes)}</div>`).join('')
    return page(head(tr('Milk statement'), range, settings) + summary + paid + `<div style="margin-top:28px">${months}</div>`)
  })
}
