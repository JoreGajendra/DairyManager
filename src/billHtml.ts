import { dateLabel, dayMonthLabel, exceptions, getLang, inr, litreDigits, litres, monthLabel, setLang, todayIso, tr, weekdayLabel } from './lib'
import type { BillDay, IsoDate, Lang, Ledger, LedgerMonth, MilkType, MonthBill, Payment } from './lib'
import { calendarCells } from './screens/customers/customerView'
import { C } from './ui/theme'

/** Who the bill is from and to, and the language it is written in. Independent of the database. */
export interface BillHeader {
  customerId: number
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

const STYLE = `
  * { margin: 0; box-sizing: border-box; }
  @page { margin: 0; }
  body { font-family: -apple-system, Roboto, 'Noto Sans Devanagari', 'Segoe UI', sans-serif; color: ${C.ink}; padding: 0 36px 28px; font-size: 12px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .band { background: ${C.navy}; color: #fff; margin: 0 -36px 22px; padding: 26px 36px 22px; border-bottom: 4px solid ${C.butter}; display: flex; justify-content: space-between; align-items: flex-end; }
  .bandsub { color: rgba(255,255,255,.75); margin-top: 4px; font-size: 12px; }
  .bandtitle { font-size: 22px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: ${C.butter}; }
  .parties { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 20px; line-height: 1.5; }
  .meta { width: auto; min-width: 220px; } .meta td { border: 0; padding: 2px 0 2px 16px; }
  .items { margin-top: 14px; } .items th { background: ${C.milk}; border-bottom: 1.5px solid ${C.navy}; padding: 6px 8px; } .items td { padding: 7px 8px; }
  .badge { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 10.5px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; }
  .paid { background: #DDF3E4; color: #1B6B3A; } .due { background: #FBE7D5; color: #9A4B0E; }
  .foot { margin-top: 26px; padding-top: 10px; border-top: 1px solid ${C.line}; text-align: center; color: rgba(23,34,51,.6); font-size: 10.5px; }
  .brand { font-weight: 800; font-size: 24px; color: #fff; } .brand b { color: ${C.butter}; }
  h1 { font-size: 20px; color: ${C.navy}; } h2 { font-size: 16px; color: ${C.navy}; margin-bottom: 8px; }
  .l { font-size: 9.5px; letter-spacing: .4px; text-transform: uppercase; color: rgba(23,34,51,.6); margin-bottom: 2px; }
  .m { color: rgba(23,34,51,.6); }
  table { width: 100%; border-collapse: collapse; }
  td, th { padding: 3px 4px; border-bottom: 1px solid ${C.line}; text-align: left; vertical-align: top; }
  th { font-weight: 400; font-size: 9.5px; letter-spacing: .4px; text-transform: uppercase; color: rgba(23,34,51,.6); }
  .r { text-align: right; } .b { font-weight: 700; }
  .cal { table-layout: fixed; border-collapse: separate; border-spacing: 3px; } .cal th { text-align: center; border: 0; padding: 0 0 2px; }
  .cal td { height: 38px; text-align: center; vertical-align: middle; border: 0; border-radius: 8px; padding: 2px; line-height: 1.25; } .cal td i { display: block; font-style: normal; font-size: 9px; } .cal td b { font-size: 11.5px; }
  .total { display: flex; justify-content: space-between; align-items: baseline; border-top: 2px solid ${C.navy}; padding-top: 8px; margin-top: 4px; }
  .fig { font-size: 22px; font-weight: 800; color: ${C.navy}; }
  .month { page-break-inside: avoid; margin-bottom: 28px; }
`

const page = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>${body}</body></html>`

/** `MD-202610-007`: the month and the customer, so the same bill always has the same number. */
export const billRef = (month: string, customerId: number): string => `MD-${month.replace('-', '')}-${String(customerId).padStart(3, '0')}`

/** Navy band with the business, then who the bill is to and its reference, period and issue date. */
function head(title: string, period: string, ref: string, settings: BillHeader, status = ''): string {
  const name = settings.businessName.trim()
  const phone = settings.businessPhone.trim()
  const lines = (parts: string[]) => parts.map((l) => l.trim()).filter(Boolean).map(esc).join('<br>')
  const meta = (label: string, value: string) => `<tr><td class="m">${label}</td><td class="r b">${value}</td></tr>`
  return `<div class="band">
    <div><div class="brand">${name ? esc(name) : 'Dairy<b>Manager</b>'}</div>${phone ? `<div class="bandsub">${tr('Phone')} ${esc(phone)}</div>` : ''}</div>
    <div class="bandtitle">${title}</div></div>
  <div class="parties">
    <div><div class="l">${tr('Bill to')}</div><div class="b" style="font-size:14px">${esc(settings.customerName)}</div>${lines([settings.customerPhone, settings.customerAddress])}</div>
    <table class="meta">${meta(tr('Bill no'), ref)}${meta(tr('Period'), period)}${meta(tr('Issued'), dateLabel(todayIso()))}${status ? meta(tr('Status'), status) : ''}</table></div>`
}

const FILL: Record<string, [string, string]> = {
  plan: [C.sky, C.blueText],
  changed: [C.amber, C.amberText],
  none: [C.none, 'rgba(23,34,51,.6)'],
  off: [C.none, 'rgba(23,34,51,.6)'],
  paused: [C.paused, C.pausedText],
  future: [C.white, 'rgba(23,34,51,.6)'],
}

/** The month as a grid like the Customers calendar: each day's litres, coloured by what happened. */
function calendarHtml(bill: MonthBill): string {
  const byDate = new Map(bill.days.map((d) => [d.date, d]))
  const cells = calendarCells(bill.month)
  // 2026-10-04 is a Sunday: seven days from it give the week-head labels.
  const head = ['04', '05', '06', '07', '08', '09', '10'].map((d) => `<th class="l">${weekdayLabel(`2026-10-${d}`)}</th>`).join('')
  const rows: string[] = []
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7).map((date) => {
      const day = date ? byDate.get(date) : undefined
      if (!date || !day) return '<td></td>'
      const [bg, fg] = FILL[day.status]!
      const dash = day.status === 'paused' || day.status === 'none' || day.status === 'off'
      const border = day.status === 'future' ? `border:1px solid ${C.line};` : ''
      return `<td style="background:${bg};color:${fg};${border}"><i>${Number(date.slice(8))}</i><b>${dash ? '-' : litreDigits(day.totalMl)}</b></td>`
    })
    rows.push(`<tr>${week.join('')}</tr>`)
  }
  return `<div class="l" style="margin:20px 0 4px">${tr('Delivery record')}</div><table class="cal"><tr>${head}</tr>${rows.join('')}</table>`
}

/** One month in the sheet layout, with its amount lines and the days that were different. */
function monthSection(bill: MonthBill, types: MilkType[], notes: Record<IsoDate, string>): string {
  const shown = bill.types.filter((t) => t.totalMl > 0)
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
  return `<table class="items"><tr><th>${tr('Item')}</th><th class="r">${tr('Qty')} × ${tr('Rate')}</th><th class="r">${tr('Amount')}</th></tr>${lines}${roundOff}
      <tr><td class="b">${tr('Total qty')}</td><td class="r b">${litres(totalMl)}</td><td></td></tr></table>
    <div class="total"><div class="l">${tr('Total bill amount')}</div><div class="fig">${inr(bill.payablePaise)}</div></div>
    ${calendarHtml(bill)}
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
    const badge = statusBadge(bill, paid)
    return page(
      head(tr('Milk bill'), `${monthLabel(bill.month)}${through}`, billRef(bill.month, settings.customerId), settings, badge) +
        monthSection(bill, types, notes) +
        paidLine(paid) +
        foot(),
    )
  })
}

export type BillStatusKind = 'paid' | 'part' | 'unpaid'

/** Where a bill stands, or null when there is nothing to pay. */
export function billStatus(bill: MonthBill, paid?: LedgerMonth): BillStatusKind | null {
  if (bill.payablePaise === 0) return null
  if (paid && paid.final && paid.duePaise <= 0) return 'paid'
  return paid && paid.paidPaise > 0 ? 'part' : 'unpaid'
}

export const statusText = (status: BillStatusKind): string => (status === 'paid' ? tr('Fully paid') : status === 'part' ? tr('Part paid') : tr('Unpaid'))

function statusBadge(bill: MonthBill, paid?: LedgerMonth): string {
  const status = billStatus(bill, paid)
  return status ? `<span class="badge ${status === 'paid' ? 'paid' : 'due'}">${statusText(status)}</span>` : ''
}

const foot = () => `<div class="foot">${tr('Thank you!')}</div>`

/**
 * A payment receipt for the provider: amount, date, the months it is for, the
 * transaction screenshot, and each of those months' bills.
 */
export function receiptHtml(
  payment: Payment & { txnRef?: string },
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
      head(tr('Payment'), dateLabel(payment.paidOn), `PR-${String(payment.id).padStart(4, '0')}`, settings) +
        `<div class="total" style="border-top:0;padding-top:0"><div><div class="l">${tr('Paid')}</div>${payment.note ? esc(payment.note) : ''}${payment.txnRef ? `<div class="m">${tr('Txn no {ref}', { ref: esc(payment.txnRef) })}</div>` : ''}</div><div class="fig">${inr(payment.amountPaise)}</div></div>
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
    return page(head(tr('Milk statement'), range, `ST-${String(settings.customerId).padStart(3, '0')}`, settings) + summary + paid + `<div style="margin-top:28px">${months}</div>` + foot())
  })
}
