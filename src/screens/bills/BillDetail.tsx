import { useRef, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import * as Print from 'expo-print'
import { captureRef } from 'react-native-view-shot'
import { dayMonthLabel, monthLabel, tr } from '../../lib'
import type { IsoMonth, LedgerMonth, MonthBill } from '../../lib'
import { billHtml } from '../../billHtml'
import type { MilkTypeRow } from '../../dataHelpers'
import type { Customer } from '../../dataHelpers'
import type { Settings } from '../../db'
import { C, space } from '../../ui/theme'
import { Button, ErrorNote, Header, notify, useBack } from '../../ui/ui'
import { BillSheet } from './BillSheet'
import { billFileName, billHeader, billWhatsApp } from './billsModel'
import type { BillRow } from './billsModel'
import { openWhatsApp, shareFile } from './share'

export interface BillItem {
  customer: Customer
  bill: MonthBill
  paid: LedgerMonth | undefined
  row: BillRow
}

/** One customer's bill for a month, with the three ways to send it. */
export function BillDetail({
  month,
  item,
  types,
  settings,
  onBack,
}: {
  month: IsoMonth
  item: BillItem
  types: MilkTypeRow[]
  settings: Settings
  onBack: () => void
}) {
  useBack(() => {
    onBack()
    return true
  }, [onBack])
  const card = useRef<View>(null)
  const [busy, setBusy] = useState<'pdf' | 'image' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const { customer, bill, paid, row } = item
  const title = tr('Milk bill {month}', { month: monthLabel(month) })
  const fileName = billFileName(month, customer.name)

  const share = async (kind: 'pdf' | 'image') => {
    setBusy(kind)
    setProblem(null)
    try {
      if (kind === 'pdf') {
        const html = billHtml(bill, types, billHeader(settings, customer), {}, paid)
        const { uri } = await Print.printToFileAsync({ html })
        await shareFile(uri, 'application/pdf', title, fileName)
        notify(tr('Bill PDF created'))
      } else {
        const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' })
        await shareFile(uri, 'image/png', title, fileName)
        notify(tr('Bill image created'))
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setProblem(message)
      notify(tr('Could not share: {error}', { error: message }), 'error')
    } finally {
      setBusy(null)
    }
  }

  const whatsapp = billWhatsApp(month, row, customer, settings.businessName)
  const sendText = async () => {
    if (!whatsapp.url) {
      setProblem(tr('{name} has no phone number. Add one in Customers to send on WhatsApp.', { name: customer.name }))
      return
    }
    setProblem(null)
    await openWhatsApp(whatsapp.url)
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space(5), paddingTop: space(2) }}>
      <Header title={customer.name} subtitle={monthLabel(month)} onBack={onBack} />
      {bill.missingRate.length ? (
        <ErrorNote>
          {tr('{count} day(s) have milk but no rate, from {date}. Those litres are billed at ₹0 until you set a rate in Setup.', {
            count: bill.missingRate.length,
            date: dayMonthLabel(bill.missingRate[0]!),
          })}
        </ErrorNote>
      ) : null}

      {/* collapsable=false keeps this a real native view on Android, which captureRef needs. */}
      <View ref={card} collapsable={false} style={{ backgroundColor: C.white, borderRadius: 14, overflow: 'hidden' }}>
        <BillSheet month={month} bill={bill} paid={paid} types={types} customer={customer} settings={settings} />
      </View>

      {problem ? <View style={{ marginTop: space(3) }}><ErrorNote>{problem}</ErrorNote></View> : null}

      <View style={{ gap: space(2.5), marginTop: space(4) }}>
        <Button icon="chat" onPress={() => void sendText()}>
          {tr('Send on WhatsApp')}
        </Button>
        <Button variant="ghost" icon="download" disabled={busy !== null} onPress={() => void share('pdf')}>
          {busy === 'pdf' ? tr('Making PDF…') : tr('Share as PDF')}
        </Button>
        <Button variant="ghost" icon="image" disabled={busy !== null} onPress={() => void share('image')}>
          {busy === 'image' ? tr('Making image…') : tr('Share as image')}
        </Button>
      </View>
    </ScrollView>
  )
}
