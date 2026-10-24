import { Text, View } from 'react-native'
import { dateLabel, dayMonthLabel, exceptions, inr, litres, monthLabel, todayIso, tr } from '../../lib'
import type { IsoMonth, LedgerMonth, MonthBill } from '../../lib'
import { billRef, billStatus, changeText, statusText } from '../../billHtml'
import type { MilkTypeRow } from '../../dataHelpers'
import { C, font, muted, space } from '../../ui/theme'
import { MonthCalendar } from '../customers/MonthCalendar'
import { billHeader } from './billsModel'
import type { BillCustomer, BillSettings } from './billsModel'

const body = { fontFamily: font.body, fontSize: 12, color: C.ink } as const
const small = { fontFamily: font.body, fontSize: 9.5, letterSpacing: 0.4, textTransform: 'uppercase', color: muted } as const
const bold = { ...body, fontWeight: '700' } as const

/**
 * The bill as the customer gets it, laid out like the PDF (`billHtml.ts`): navy
 * header, bill-to and details, items and total, the day-by-day record, what was
 * different, what is paid. This view is what "Share as image" captures.
 */
export function BillSheet({
  month,
  bill,
  paid,
  types,
  customer,
  settings,
}: {
  month: IsoMonth
  bill: MonthBill
  paid: LedgerMonth | undefined
  types: MilkTypeRow[]
  customer: BillCustomer
  settings: BillSettings
}) {
  const header = billHeader(settings, customer)
  const shown = bill.types.filter((t) => t.totalMl > 0)
  const through = bill.complete ? '' : bill.billedThrough ? ` · ${tr('to {date}', { date: dayMonthLabel(bill.billedThrough) })}` : ''
  const status = billStatus(bill, paid)
  const totalMl = shown.reduce((s, t) => s + t.totalMl, 0)
  const different = [
    ...exceptions(bill)
      .filter((d) => d.status !== 'future')
      .map((d): [string, string, string] => [d.date, dayMonthLabel(d.date), changeText(d, types)]),
    ...bill.paused.map((r): [string, string, string] => [
      r.from,
      dayMonthLabel(r.from),
      r.days > 1 ? tr('Paused to {date} · {count} days', { date: dayMonthLabel(r.to), count: r.days }) : tr('Paused · 1 day'),
    ]),
  ].sort((a, b) => (a[0] < b[0] ? -1 : 1))

  const meta = (label: string, value: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space(4) }}>
      <Text style={{ ...body, color: muted }}>{label}</Text>
      <Text style={bold}>{value}</Text>
    </View>
  )

  return (
    <View style={{ backgroundColor: C.white, overflow: 'hidden' }}>
      <View style={{ backgroundColor: C.navy, borderBottomWidth: 4, borderBottomColor: C.butter, paddingHorizontal: space(5), paddingTop: space(5), paddingBottom: space(4), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: font.display, fontSize: 22, color: C.white }}>{header.businessName || 'DairyManager'}</Text>
          {header.businessPhone ? <Text style={{ ...body, color: 'rgba(255,255,255,0.75)', marginTop: 2 }}>{`${tr('Phone')} ${header.businessPhone}`}</Text> : null}
        </View>
        <Text style={{ fontFamily: font.display, fontSize: 18, letterSpacing: 1.2, color: C.butter, textTransform: 'uppercase' }}>{tr('Milk bill')}</Text>
      </View>

      <View style={{ padding: space(5) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space(4), marginBottom: space(4) }}>
          <View style={{ flexShrink: 1 }}>
            <Text style={small}>{tr('Bill to')}</Text>
            <Text style={{ ...bold, fontSize: 14 }}>{header.customerName}</Text>
            {header.customerPhone ? <Text style={body}>{header.customerPhone}</Text> : null}
            {header.customerAddress ? <Text style={body}>{header.customerAddress}</Text> : null}
          </View>
          <View style={{ gap: 2 }}>
            {meta(tr('Bill no'), billRef(month, customer.id))}
            {meta(tr('Period'), `${monthLabel(month)}${through}`)}
            {meta(tr('Issued'), dateLabel(todayIso()))}
            {status ? meta(tr('Status'), statusText(status)) : null}
          </View>
        </View>

        <View style={{ flexDirection: 'row', backgroundColor: C.milk, borderBottomWidth: 1.5, borderBottomColor: C.navy, paddingVertical: 6, paddingHorizontal: 8 }}>
          <Text style={{ ...small, flex: 1 }}>{tr('Item')}</Text>
          <Text style={{ ...small, flex: 1.4, textAlign: 'right' }}>{`${tr('Qty')} × ${tr('Rate')}`}</Text>
          <Text style={{ ...small, flex: 1, textAlign: 'right' }}>{tr('Amount')}</Text>
        </View>
        {shown.length === 0 ? (
          <Text style={{ ...body, color: muted, padding: 8 }}>{bill.complete ? tr('No milk delivered this month.') : tr('No milk delivered yet this month.')}</Text>
        ) : null}
        {shown.flatMap((t) =>
          t.periods.map((p) => (
            <View key={`${t.milkTypeId}-${p.from}`} style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 7, paddingHorizontal: 8 }}>
              <Text style={{ ...body, flex: 1 }}>
                {t.name}
                {t.periods.length > 1 ? <Text style={{ color: muted }}>{` ${dayMonthLabel(p.from)}–${dayMonthLabel(p.to)}`}</Text> : null}
              </Text>
              <Text style={{ ...body, flex: 1.4, textAlign: 'right' }}>{`${litres(p.totalMl)} × ${inr(p.paisePerLitre)}`}</Text>
              <Text style={{ ...body, flex: 1, textAlign: 'right' }}>{inr(p.amountPaise)}</Text>
            </View>
          )),
        )}
        {bill.roundOffPaise ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 8 }}>
            <Text style={{ ...body, color: muted }}>{tr('Round off')}</Text>
            <Text style={{ ...body, color: muted }}>{`${bill.roundOffPaise > 0 ? '+' : '−'}${inr(Math.abs(bill.roundOffPaise))}`}</Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 8 }}>
          <Text style={bold}>{tr('Total qty')}</Text>
          <Text style={bold}>{litres(totalMl)}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderTopWidth: 2, borderTopColor: C.navy, paddingTop: space(2), marginTop: 4 }}>
          <Text style={small}>{tr('Total bill amount')}</Text>
          <Text style={{ fontFamily: font.display, fontSize: 24, color: C.navy }}>{inr(bill.payablePaise)}</Text>
        </View>
        {paid && paid.paidPaise > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space(2) }}>
            <Text style={{ ...body, color: muted }}>
              {paid.final ? tr('Paid {amount}', { amount: inr(paid.paidPaise) }) : tr('Advance paid {amount}', { amount: inr(paid.paidPaise) })}
            </Text>
            <Text style={bold}>
              {paid.duePaise > 0
                ? tr('Balance {amount}', { amount: inr(paid.duePaise) })
                : paid.duePaise < 0
                  ? tr('Paid ahead {amount}', { amount: inr(-paid.duePaise) })
                  : tr('Fully paid')}
            </Text>
          </View>
        ) : null}

        <Text style={{ ...small, marginTop: space(5), marginBottom: 6 }}>{tr('Delivery record')}</Text>
        <MonthCalendar month={month} days={bill.days} />

        {different.length ? (
          <View style={{ marginTop: space(4) }}>
            <Text style={{ ...small, marginBottom: 4 }}>{tr('Days that were different')}</Text>
            {different.map(([date, day, text]) => (
              <View key={`${date}-${text}`} style={{ flexDirection: 'row', gap: space(3), borderBottomWidth: 1, borderBottomColor: C.line, paddingVertical: 3 }}>
                <Text style={{ ...body, width: 52 }}>{day}</Text>
                <Text style={{ ...body, flex: 1 }}>{text}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={{ ...body, fontSize: 10.5, color: muted, textAlign: 'center', borderTopWidth: 1, borderTopColor: C.line, marginTop: space(5), paddingTop: space(3) }}>{tr('Thank you!')}</Text>
      </View>
    </View>
  )
}
