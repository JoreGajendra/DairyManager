import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { inr, litres, monthLabel, monthOf, todayIso, tr } from '../lib'
import type { IsoMonth } from '../lib'
import { loadCustomer, loadSetup } from '../db'
import type { Setup } from '../db'
import { C, font, muted, radius, space } from '../ui/theme'
import { Button, Card, ErrorNote, Label, Loading, MonthBar, Muted, Title } from '../ui/ui'
import { BillDetail } from './bills/BillDetail'
import type { BillItem } from './bills/BillDetail'
import { SendAll } from './bills/SendAll'
import { billRow, billTotals, sendAllQueue } from './bills/billsModel'
import type { BillStatus } from './bills/billsModel'

interface MonthList {
  setup: Setup
  items: BillItem[]
}

/** Each customer's bill for the month, in route order. One engine run per customer. */
async function loadList(month: IsoMonth): Promise<MonthList> {
  const setup = await loadSetup()
  const items: BillItem[] = []
  for (const customer of setup.customers) {
    const data = await loadCustomer(customer.id)
    const bill = data?.bills[month]
    if (!data || !bill) continue
    const paid = data.ledger.months.find((m) => m.month === month)
    const row = billRow(customer, bill, paid)
    if (row.status !== 'none') items.push({ customer, bill, paid, row })
  }
  return { setup, items }
}

const STATUS_TEXT: Record<BillStatus, () => string> = {
  none: () => '',
  unpaid: () => tr('Unpaid'),
  part: () => tr('Part paid'),
  paid: () => tr('Paid'),
  advance: () => tr('Advance paid'),
}
const STATUS_COLOR: Record<BillStatus, string> = { none: muted, unpaid: C.blueText, part: C.blueText, paid: C.ink, advance: C.ink }

export function BillsScreen() {
  const [month, setMonth] = useState<IsoMonth>(() => monthOf(todayIso()))
  const [list, setList] = useState<MonthList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const [sending, setSending] = useState(false)

  const load = useCallback(() => {
    let cancelled = false
    setError(null)
    loadList(month)
      .then((l) => !cancelled && setList(l))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
  }, [month])
  useEffect(() => {
    setList(null)
    return load()
  }, [load])

  const back = useCallback(() => {
    setOpen(null)
    setSending(false)
    load()
  }, [load])

  if (error) {
    return (
      <View style={{ padding: space(5) }}>
        <ErrorNote>{error}</ErrorNote>
        <Button variant="ghost" onPress={load}>{tr('Try again')}</Button>
      </View>
    )
  }
  if (!list) return <Loading />

  const { setup, items } = list
  const detail = open === null ? undefined : items.find((i) => i.customer.id === open)
  if (detail) return <BillDetail month={month} item={detail} types={setup.types} settings={setup.settings} onBack={back} />
  if (sending) {
    const queue = sendAllQueue(items.map((i) => i.row)).map((r) => items.find((i) => i.customer.id === r.customerId)!)
    return <SendAll month={month} queue={queue} business={setup.settings.businessName} onBack={back} />
  }

  const totals = billTotals(items.map((i) => i.row))
  const queueSize = sendAllQueue(items.map((i) => i.row)).length

  return (
    <ScrollView contentContainerStyle={{ padding: space(5), paddingTop: space(2) }}>
      <View style={{ paddingTop: space(1.5), paddingBottom: space(3.5) }}>
        <Title>{tr('Bills')}</Title>
      </View>
      <MonthBar month={month} onChange={setMonth} />

      {items.length === 0 ? (
        <Card>
          <Muted>{tr('No bills for {month} yet.', { month: monthLabel(month) })}</Muted>
        </Card>
      ) : (
        <>
          <Card tone="navy" style={{ marginBottom: space(3) }}>
            <Text style={{ fontFamily: font.body, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
              {tr('{count} customers · {qty}', { count: totals.count, qty: litres(totals.litresMl) })}
            </Text>
            <Text style={{ fontFamily: font.display, fontSize: 28, color: C.white }}>{inr(totals.payablePaise)}</Text>
            <Text style={{ fontFamily: font.body, fontSize: 13, color: C.butter }}>
              {tr('Paid {paid} · Due {due}', { paid: inr(totals.paidPaise), due: inr(totals.duePaise) })}
            </Text>
          </Card>

          <Button icon="chat" disabled={queueSize === 0} onPress={() => setSending(true)} style={{ marginBottom: space(3) }}>
            {tr('Send all on WhatsApp ({count})', { count: queueSize })}
          </Button>

          <Card style={{ padding: 0 }}>
            {items.map((item, i) => (
              <Pressable
                key={item.customer.id}
                onPress={() => setOpen(item.customer.id)}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: space(3),
                  padding: space(4),
                  borderBottomWidth: i === items.length - 1 ? 0 : 1,
                  borderBottomColor: C.line,
                  borderRadius: radius.card,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: font.body, fontWeight: '700', fontSize: 15, color: C.ink }}>{item.customer.name}</Text>
                  <Muted>
                    {litres(item.row.litresMl)}
                    {item.row.hasPhone ? '' : ` · ${tr('No phone')}`}
                  </Muted>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: font.display, fontSize: 16, color: C.navy }}>{inr(item.row.payablePaise)}</Text>
                  <Label style={{ color: STATUS_COLOR[item.row.status] }}>
                    {item.row.status === 'part' ? tr('Due {amount}', { amount: inr(item.row.duePaise) }) : STATUS_TEXT[item.row.status]()}
                  </Label>
                </View>
              </Pressable>
            ))}
          </Card>
        </>
      )}
    </ScrollView>
  )
}
