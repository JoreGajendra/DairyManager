/** One customer's account: what is owed, month by month, payments, reminder and record-payment. */
import { useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { dateLabel, dueReminderMessage, inr, monthLabel, tr } from '../../lib'
import type { LedgerMonth } from '../../lib'
import type { PaymentRecord } from '../../dataHelpers'
import { ShotThumb } from './ShotView'
import { dropScreenshot } from './paymentShot'
import { deletePayment, loadCustomer } from '../../db'
import type { CustomerData } from '../../db'
import { C, font, muted, space } from '../../ui/theme'
import { Button, Card, ErrorNote, Header, Label, LoadFailed, Loading, Muted, Row, notify, useBack, useGuard } from '../../ui/ui'
import { RecordPaymentSheet } from '../RecordPaymentSheet'
import { billedMonths, inLanguage, reminderLines } from './duesLogic'
import { sendWhatsApp } from './share'

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export function CustomerLedger({ customerId, onBack, onChanged }: { customerId: number; onBack: () => void; onChanged: () => void }) {
  const [data, setData] = useState<CustomerData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const { guard } = useGuard()

  const reload = () =>
    loadCustomer(customerId)
      .then((d) => (d ? setData(d) : setError(tr('Customer not found.'))))
      .catch((e: unknown) => setError(errText(e)))
  useEffect(() => {
    void reload()
  }, [customerId])

  useBack(() => {
    if (paying) return false // the sheet's own back handler closes it
    onBack()
    return true
  }, [paying, onBack])

  if (!data) {
    return (
      <View style={{ flex: 1, padding: space(5) }}>
        <Header title={tr('Dues')} onBack={onBack} />
        {error ? <LoadFailed error={error} onRetry={() => { setError(null); void reload() }} /> : <Loading />}
      </View>
    )
  }

  const { customer, ledger, outstanding, payments, setup } = data
  const lines = reminderLines(ledger)
  const remind = () =>
    sendWhatsApp(
      customer.phone,
      inLanguage(setup.settings.language, () => dueReminderMessage(lines, customer.name, setup.settings.businessName)),
    ).catch((e: unknown) => setError(errText(e)))

  const remove = (p: PaymentRecord) =>
    Alert.alert(tr('Delete payment?'), tr('{amount} paid on {date}. The balance goes back up.', { amount: inr(p.amountPaise), date: dateLabel(p.paidOn) }), [
      { text: tr('Cancel'), style: 'cancel' },
      {
        text: tr('Delete'),
        style: 'destructive',
        onPress: () =>
          void guard(() =>
            deletePayment(p.id)
              .then(async () => {
                dropScreenshot(p.screenshot)
                onChanged()
                await reload()
                notify(tr('Payment deleted'))
              })
              .catch((e: unknown) => {
                setError(errText(e))
                notify(errText(e), 'error')
              }),
          ),
      },
    ])

  const owes = outstanding.netPaise
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: space(5), paddingTop: space(2), paddingBottom: space(10) }}>
        <Header title={customer.name} subtitle={customer.phone || undefined} onBack={onBack} />
        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <Card tone="navy">
          <Label style={{ color: 'rgba(255,255,255,0.7)' }}>{owes < 0 ? tr('Paid ahead') : tr('Outstanding now')}</Label>
          <Text style={{ fontFamily: font.display, fontSize: 30, color: C.white, marginBottom: space(2) }}>{inr(Math.abs(owes))}</Text>
          <Line label={tr('Previous months')} value={inr(outstanding.previousPaise)} />
          <Line label={tr('This month so far')} value={inr(outstanding.currentPaise)} />
          {outstanding.currentPaidPaise ? <Line label={tr('Paid on this month')} value={`− ${inr(outstanding.currentPaidPaise)}`} /> : null}
          {outstanding.creditPaise ? <Line label={tr('Credit (extra paid)')} value={`− ${inr(outstanding.creditPaise)}`} /> : null}
        </Card>

        <Button icon="wallet" style={{ marginBottom: space(2.5) }} onPress={() => setPaying(true)}>
          {tr('Record payment')}
        </Button>
        {lines.length ? (
          <Button icon="chat" variant="ghost" style={{ marginBottom: space(4) }} onPress={remind}>
            {tr('WhatsApp reminder')}
          </Button>
        ) : (
          <View style={{ height: space(2) }} />
        )}

        <Card>
          <Label style={{ marginBottom: space(1) }}>{tr('Months')}</Label>
          {billedMonths(ledger).length === 0 ? <Muted>{tr('No bills yet.')}</Muted> : null}
          {billedMonths(ledger).map((m, i, all) => (
            <MonthRow key={m.month} month={m} last={i === all.length - 1} />
          ))}
        </Card>

        <Card>
          <Label style={{ marginBottom: space(1) }}>{tr('Payments')}</Label>
          {payments.length === 0 ? <Muted>{tr('No payments recorded yet.')}</Muted> : null}
          {payments.map((p, i) => (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2.5), borderBottomWidth: i === payments.length - 1 ? 0 : 1, borderBottomColor: C.line }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: font.body, fontSize: 14, fontWeight: '700', color: C.ink }}>{inr(p.amountPaise)}</Text>
                <Muted>
                  {dateLabel(p.paidOn)}
                  {p.allocations.length ? ` · ${p.allocations.map((a) => monthLabel(a.month)).join(', ')}` : ` · ${tr('credit')}`}
                  {p.note ? ` · ${p.note}` : ''}
                </Muted>
                {p.txnRef ? <Muted>{tr('Txn no {ref}', { ref: p.txnRef })}</Muted> : null}
              </View>
              {p.screenshot ? <ShotThumb name={p.screenshot} /> : null}
              <Pressable onPress={() => remove(p)} hitSlop={10} accessibilityRole="button" accessibilityLabel={tr('Delete payment?')}>
                <Text style={{ fontFamily: font.body, fontSize: 13, color: C.danger }}>{tr('Delete')}</Text>
              </Pressable>
            </View>
          ))}
        </Card>
      </ScrollView>

      {paying ? (
        <RecordPaymentSheet
          customerId={customerId}
          onClose={() => setPaying(false)}
          onDone={() => {
            setPaying(false)
            onChanged()
            void reload()
          }}
        />
      ) : null}
    </View>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  const style = { fontFamily: font.body, fontSize: 13, color: 'rgba(255,255,255,0.85)' } as const
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space(3), paddingVertical: 2 }}>
      <Text style={[style, { flexShrink: 1 }]}>{label}</Text>
      <Text style={style}>{value}</Text>
    </View>
  )
}

function MonthRow({ month, last }: { month: LedgerMonth; last: boolean }) {
  const status =
    month.status === 'paid'
      ? { text: tr('Paid'), bg: C.sky, color: C.blueText }
      : month.status === 'part'
        ? { text: tr('Part paid · {amount} due', { amount: inr(month.duePaise) }), bg: C.amber, color: C.amberText }
        : month.status === 'advance'
          ? { text: tr('Advance {amount}', { amount: inr(month.paidPaise) }), bg: C.sky, color: C.blueText }
          : month.final
            ? { text: tr('Due {amount}', { amount: inr(month.duePaise) }), bg: C.amber, color: C.amberText }
            : { text: tr('Running'), bg: C.none, color: muted }
  return (
    <Row
      last={last}
      label={
        <View>
          <Text style={{ fontFamily: font.body, fontSize: 14, color: C.ink }}>{monthLabel(month.month)}</Text>
          <Text
            style={{ alignSelf: 'flex-start', marginTop: 3, fontFamily: font.body, fontSize: 11, color: status.color, backgroundColor: status.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' }}
          >
            {status.text}
          </Text>
        </View>
      }
    >
      <Text style={{ fontFamily: font.body, fontSize: 14, fontWeight: '700', color: C.ink }}>{inr(month.payablePaise)}</Text>
      <Muted>{month.final ? tr('Paid {amount}', { amount: inr(month.paidPaise) }) : tr('so far · paid {amount}', { amount: inr(month.paidPaise) })}</Muted>
    </Row>
  )
}
