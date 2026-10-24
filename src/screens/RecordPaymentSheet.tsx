/**
 * RecordPaymentSheet: a bottom sheet that records one payment for one customer.
 *
 * Props
 *   customerId  id of the customer paying.
 *   onDone      called once, after the sheet has changed anything (a payment saved or credit
 *               applied), when the user finishes or closes it. Reload and close the sheet.
 *   onClose     called when the sheet is closed with nothing changed. Just close it.
 * Render it only while open: `{open && <RecordPaymentSheet customerId={id} onDone={...} onClose={...} />}`.
 *
 * The sheet loads the customer itself. The user ticks the months the money is for
 * (finished months owing, and the running month as an advance); the amount follows
 * the ticks until typed over and is split oldest first (`allocatePayment`), or edited
 * month by month. No months ticked keeps the money as credit. Existing credit can be
 * put onto the running month's bill. After saving, a WhatsApp receipt and a PDF receipt
 * are offered.
 */
import { useEffect, useRef, useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { inr, monthLabel, monthOf, paiseFromText, receiptMessage, rupeeText, todayIso, tr } from '../lib'
import type { IsoDate, IsoMonth, LedgerMonth, Payment } from '../lib'
import { receiptHtml } from '../billHtml'
import { addPayment, applyCredit, loadCustomer } from '../db'
import type { CustomerData } from '../db'
import { C, faint, font, space } from '../ui/theme'
import { Button, Card, DateChoice, ErrorNote, Field, Icon, Label, Loading, Muted, notify, styles, useGuard } from '../ui/ui'
import { creditOffer, inLanguage, payableMonths, planPayment, suggestedPaise } from './dues/duesLogic'
import { Sheet } from './dues/Sheet'
import { sendWhatsApp, sharePdf } from './dues/share'

export function RecordPaymentSheet({ customerId, onDone, onClose }: { customerId: number; onDone: () => void; onClose: () => void }) {
  const [data, setData] = useState<CustomerData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<IsoMonth> | null>(null)
  const [amount, setAmount] = useState<string | null>(null)
  const [date, setDate] = useState<IsoDate | null>(todayIso())
  const [note, setNote] = useState('')
  const [manual, setManual] = useState<Record<IsoMonth, string> | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const changed = useRef(false)
  const { guard } = useGuard()

  const reload = () =>
    loadCustomer(customerId)
      .then((d) => (d ? setData(d) : setError(tr('Customer not found.'))))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  useEffect(() => {
    void reload()
  }, [customerId])

  const finish = () => (changed.current ? onDone() : onClose())

  if (!data) {
    return <Sheet onClose={onClose}>{error ? <ErrorNote>{error}</ErrorNote> : <Loading />}</Sheet>
  }

  const { ledger, customer, setup } = data
  const business = setup.settings.businessName
  const runningMonth = monthOf(todayIso())
  const months = payableMonths(ledger)
  const owing = months.filter((m) => m.month !== runningMonth)
  // Until ticked by hand: the months owing, or the running month when nothing is owing.
  const ticked = picked ?? new Set((owing.length ? owing : months).map((m) => m.month))
  const selected = months.filter((m) => ticked.has(m.month))
  const amountText = amount ?? (suggestedPaise(selected) ? rupeeText(suggestedPaise(selected)) : '')
  const paise = paiseFromText(amountText)
  const plan = planPayment(paise, selected, manual)
  const offer = creditOffer(ledger)

  const toggle = (month: IsoMonth) => {
    const next = new Set(ticked)
    if (next.has(month)) next.delete(month)
    else next.add(month)
    setPicked(next)
    setManual(null)
  }

  const editSplit = (on: boolean) => {
    if (!on) return setManual(null)
    const auto = planPayment(paise, selected, null).allocations
    setManual(Object.fromEntries(selected.map((m) => [m.month, rupeeText(auto.find((a) => a.month === m.month)?.amountPaise ?? 0)])))
  }

  const save = () => guard(async () => {
    if (!paise) return setError(tr('Enter the amount paid, like 2000.'))
    if (!date) return setError(tr('Pick the date it was paid.'))
    if (plan.error) return setError(plan.error)
    setSaving(true)
    setError(null)
    try {
      const id = await addPayment(customerId, date, paise, note, plan.allocations)
      changed.current = true
      await reload()
      setSavedId(id)
      notify(tr('Payment of {amount} saved', { amount: inr(paise) }))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      notify(message, 'error')
    } finally {
      setSaving(false)
    }
  })

  const useCredit = () => guard(async () => {
    if (!offer) return
    setSaving(true)
    setError(null)
    try {
      await applyCredit(customerId, offer.month, offer.amountPaise)
      changed.current = true
      await reload()
      notify(tr('{amount} put on {month}', { amount: inr(offer.amountPaise), month: monthLabel(offer.month) }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  })

  const saved: Payment | undefined = savedId === null ? undefined : data.payments.find((p) => p.id === savedId)
  if (saved) {
    const lang = setup.settings.language
    const whatsApp = () =>
      sendWhatsApp(
        customer.phone,
        inLanguage(lang, () => receiptMessage(saved.amountPaise, saved.paidOn, saved.note, saved.allocations, runningMonth, customer.name, business)),
      ).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    const pdf = async () => {
      setBusy(true)
      setError(null)
      try {
        const header = {
          customerId: customer.id,
          businessName: business,
          businessPhone: setup.settings.businessPhone,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerAddress: customer.address,
          lang,
        }
        await sharePdf(receiptHtml(saved, ledger, data.bills, setup.types, header, {}, null), tr('Payment receipt'))
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setBusy(false)
      }
    }
    return (
      <Sheet onClose={finish}>
        <Text style={{ fontFamily: font.display, fontSize: 20, color: C.navy, marginBottom: space(1) }}>{tr('Payment saved')}</Text>
        <Muted style={{ marginBottom: space(4) }}>{tr('{amount} from {name}. Send a receipt?', { amount: inr(saved.amountPaise), name: customer.name })}</Muted>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <Button icon="chat" style={{ marginBottom: space(2.5) }} onPress={whatsApp}>
          {tr('WhatsApp receipt')}
        </Button>
        <Button icon="share" variant="ghost" style={{ marginBottom: space(2.5) }} disabled={busy} onPress={pdf}>
          {busy ? tr('Making PDF…') : tr('Receipt PDF')}
        </Button>
        <Button variant="quiet" onPress={finish}>
          {tr('Done')}
        </Button>
      </Sheet>
    )
  }

  return (
    <Sheet onClose={finish}>
      <Text style={{ fontFamily: font.display, fontSize: 20, color: C.navy }}>{tr('Record payment')}</Text>
      <Muted style={{ marginBottom: space(4) }}>
        {customer.name}
        {ledger.duePaise > 0 ? ` · ${tr('Previous months due {amount}', { amount: inr(ledger.duePaise) })}` : ''}
      </Muted>

      {offer ? (
        <Card style={{ borderColor: C.blue }}>
          <Text style={{ fontFamily: font.display, fontSize: 16, color: C.navy, marginBottom: space(1) }}>{tr('{amount} credit available', { amount: inr(ledger.creditPaise) })}</Text>
          <Muted style={{ marginBottom: space(3) }}>{tr('Paid beyond earlier bills. Put it on {month} so far.', { month: monthLabel(offer.month) })}</Muted>
          <Button icon="wallet" variant="ghost" disabled={saving} onPress={useCredit}>
            {tr('Use {amount} on {month}', { amount: inr(offer.amountPaise), month: monthLabel(offer.month) })}
          </Button>
        </Card>
      ) : null}

      <Label>{tr('Paying for')}</Label>
      <Muted style={{ marginTop: space(1) }}>{tr('Tick no month to keep it as credit.')}</Muted>
      <View style={{ marginTop: space(1), marginBottom: space(3) }}>
        {months.length === 0 ? <Muted>{tr('No bills yet.')}</Muted> : null}
        {months.map((m) => (
          <MonthTick key={m.month} month={m} on={ticked.has(m.month)} advance={m.month === runningMonth} onPress={() => toggle(m.month)} />
        ))}
      </View>

      <Field
        label={tr('Amount paid (₹)')}
        value={amountText}
        onChangeText={(t) => {
          setAmount(t)
          setManual(null)
        }}
        keyboardType="decimal-pad"
        placeholder={tr('e.g. 2000')}
      />

      {selected.length > 0 && paise ? (
        <View style={{ marginTop: -space(1), marginBottom: space(3) }}>
          {manual ? (
            selected.map((m) => (
              <View key={m.month} style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), marginBottom: space(2) }}>
                <Text style={{ flex: 1, fontFamily: font.body, fontSize: 14, color: C.ink }}>{monthLabel(m.month)}</Text>
                <TextInput
                  value={manual[m.month] ?? ''}
                  onChangeText={(t) => setManual({ ...manual, [m.month]: t })}
                  keyboardType="decimal-pad"
                  accessibilityLabel={monthLabel(m.month)}
                  style={[styles.input, { width: 110, textAlign: 'right' }]}
                />
              </View>
            ))
          ) : (
            <Muted>{plan.allocations.map((a) => `${monthLabel(a.month)} ${inr(a.amountPaise)}`).join(' · ')}</Muted>
          )}
          <Pressable onPress={() => editSplit(!manual)} hitSlop={8} style={{ marginTop: space(1.5) }}>
            <Text style={{ fontFamily: font.body, fontSize: 13, fontWeight: '600', color: C.blueText }}>{manual ? tr('Split automatically') : tr('Edit split by month')}</Text>
          </Pressable>
        </View>
      ) : null}
      {paise && !plan.error && plan.creditPaise > 0 ? <Muted style={{ marginBottom: space(3) }}>{tr('{amount} will be kept as credit.', { amount: inr(plan.creditPaise) })}</Muted> : null}

      <Label>{tr('Paid on')}</Label>
      <DateChoice value={date} onChange={setDate} initial="today" choices={['today', 'yesterday', 'other']} />

      <Label>{tr('How (optional)')}</Label>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={tr('UPI, cash, bank transfer…')}
        placeholderTextColor={faint}
        maxLength={100}
        accessibilityLabel={tr('How it was paid')}
        style={[styles.input, { marginBottom: space(4) }]}
      />

      {error ? <ErrorNote>{error}</ErrorNote> : paise && plan.error ? <ErrorNote>{plan.error}</ErrorNote> : null}
      <View style={{ flexDirection: 'row', gap: space(2.5), marginTop: space(2) }}>
        <Button variant="quiet" style={{ flex: 1 }} onPress={finish}>
          {tr('Cancel')}
        </Button>
        <Button style={{ flex: 1 }} disabled={saving || !paise || plan.error !== null} onPress={save}>
          {saving ? tr('Saving…') : tr('Save payment')}
        </Button>
      </View>
    </Sheet>
  )
}

function MonthTick({ month, on, advance, onPress }: { month: LedgerMonth; on: boolean; advance: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2.5), borderBottomWidth: 1, borderBottomColor: C.line }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: on ? C.blue : faint, backgroundColor: on ? C.blue : C.white, alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Icon name="check" size={16} color={C.white} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: font.body, fontSize: 14, color: C.ink }}>{advance ? tr('{month} · advance', { month: monthLabel(month.month) }) : monthLabel(month.month)}</Text>
        <Muted>
          {advance
            ? month.paidPaise
              ? tr('So far {bill}, already paid {paid}', { bill: inr(month.payablePaise), paid: inr(month.paidPaise) })
              : tr('So far {bill}', { bill: inr(month.payablePaise) })
            : month.paidPaise
              ? tr('Bill {bill}, paid {paid}', { bill: inr(month.payablePaise), paid: inr(month.paidPaise) })
              : tr('Bill {bill}', { bill: inr(month.payablePaise) })}
        </Muted>
      </View>
      <Text style={{ fontFamily: font.body, fontSize: 14, fontWeight: '700', color: C.ink }}>{inr(Math.max(0, month.duePaise))}</Text>
    </Pressable>
  )
}
