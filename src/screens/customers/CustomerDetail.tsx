import { useCallback, useEffect, useState } from 'react'
import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { inr, litres, monthLabel, monthOf, perLitre, todayIso, tr } from '../../lib'
import type { IsoDate, IsoMonth } from '../../lib'
import { deactivateCustomer, loadCustomer, loadMonth, reactivateCustomer, setRouteOrder } from '../../db'
import type { CustomerData, MonthData } from '../../db'
import { C, font, space } from '../../ui/theme'
import { Body, Button, Card, DateChoice, ErrorNote, Header, Label, Loading, Muted, MonthBar, Row, notify, useBack } from '../../ui/ui'
import { CustomerForm } from './CustomerForm'
import { MilkEditor } from './MilkEditor'
import { MonthCalendar } from './MonthCalendar'
import { PauseSection } from './PauseSection'
import { addableMilks, milkLines, moveId } from './customerView'

type Editing = { milkTypeId: number; isNew: boolean } | null

/** One customer: this month's bill and calendar, milks and rates, route position, pauses, stop/restart. */
export function CustomerDetail({ customerId, onBack }: { customerId: number; onBack: () => void }) {
  const [month, setMonth] = useState<IsoMonth>(monthOf(todayIso()))
  const [data, setData] = useState<CustomerData | null>(null)
  const [monthData, setMonthData] = useState<MonthData | null>(null)
  const [missing, setMissing] = useState(false)
  const [editing, setEditing] = useState<Editing>(null)
  const [form, setForm] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [stopFrom, setStopFrom] = useState<IsoDate | null>(todayIso())
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const [d, m] = await Promise.all([loadCustomer(customerId), loadMonth(customerId, month)])
      if (!d || !m) return setMissing(true)
      setData(d)
      setMonthData(m)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [customerId, month])

  useEffect(() => {
    void reload()
  }, [reload])

  useBack(() => {
    if (form) setForm(false)
    else onBack()
    return true
  }, [form, onBack])

  if (missing) {
    return (
      <View style={{ padding: space(5) }}>
        <Header title={tr('Customer not found')} onBack={onBack} />
      </View>
    )
  }
  if (!data || !monthData) {
    return (
      <View style={{ flex: 1 }}>
        {error ? <ErrorNote>{error}</ErrorNote> : <Loading />}
      </View>
    )
  }

  const { customer, setup } = data
  if (form) {
    return (
      <CustomerForm
        customer={customer}
        types={setup.types}
        onCancel={() => setForm(false)}
        onDone={() => {
          setForm(false)
          void reload()
        }}
      />
    )
  }

  const today = todayIso()
  const lines = milkLines(data.plans, data.rates, setup.types, today)
  const addable = addableMilks(data.plans, setup.types)
  const order = setup.customers.map((c) => c.id)
  const position = order.indexOf(customer.id)
  const bill = monthData.bill

  const act = async (action: () => Promise<void>, done: string) => {
    setError(null)
    try {
      await action()
      notify(done)
      await reload()
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e)
      setError(text)
      notify(text, 'error')
    }
  }

  const move = (delta: -1 | 1) => act(() => setRouteOrder(moveId(order, customer.id, delta)), tr('Route order saved'))

  const confirmStop = () => {
    if (!stopFrom) return setError(tr('Pick a valid date.'))
    Alert.alert(tr('Stop {name}?', { name: customer.name }), tr('No milk is billed from {date}. Earlier bills stay.', { date: stopFrom }), [
      { text: tr('Cancel'), style: 'cancel' },
      {
        text: tr('Stop'),
        style: 'destructive',
        onPress: () =>
          void act(async () => {
            await deactivateCustomer(customer.id, stopFrom)
            setStopping(false)
          }, tr('Customer stopped')),
      },
    ])
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space(5), paddingTop: space(2), paddingBottom: space(10) }} keyboardShouldPersistTaps="handled">
      <Header
        title={customer.name}
        subtitle={[customer.phone, customer.address].filter(Boolean).join(' - ') || undefined}
        onBack={onBack}
      />
      {customer.active ? null : <Muted style={{ marginBottom: space(3) }}>{tr('Stopped. Not on the route.')}</Muted>}
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Card>
        <MonthBar month={month} onChange={setMonth} />
        <MonthCalendar month={month} days={bill.days} />
        <Legend />
      </Card>

      <View style={{ height: space(4) }} />
      <Card>
        <Label>{tr('Bill for {month}', { month: monthLabel(month) })}</Label>
        {bill.types.length === 0 ? <Muted>{tr('No milk this month.')}</Muted> : null}
        {bill.types.map((t) => (
          <Row key={t.milkTypeId} label={`${t.name}  ${litres(t.totalMl)}`}>
            <Body>{inr(t.amountPaise)}</Body>
          </Row>
        ))}
        {bill.missingRate.length ? <ErrorNote>{tr('Some milk has no rate set for its date.')}</ErrorNote> : null}
        {bill.roundOffPaise !== 0 ? (
          <Row label={tr('Round off')}>
            <Body>{inr(bill.roundOffPaise)}</Body>
          </Row>
        ) : null}
        <Row label={<Text style={{ fontFamily: font.display, fontSize: 15, color: C.navy }}>{bill.complete ? tr('Total') : tr('So far')}</Text>} last={bill.complete}>
          <Text style={{ fontFamily: font.display, fontSize: 18, color: C.navy }}>{inr(bill.payablePaise)}</Text>
        </Row>
        {bill.complete ? null : (
          <Row label={tr('Whole month at plan')} last>
            <Body>{inr(bill.projectedPaise)}</Body>
          </Row>
        )}
        <Row label={tr('Owed in all')} last>
          <Body>{inr(data.outstanding.netPaise)}</Body>
        </Row>
      </Card>

      <View style={{ height: space(4) }} />
      {/* TODO(phase 6): payments section here (balance, payment list, "Record payment" opens RecordPaymentSheet). */}

      <Card>
        <Label>{tr('Milk and rates')}</Label>
        {lines.length === 0 ? <Muted>{tr('No milk set.')}</Muted> : null}
        {lines.map((l, i) => (
          <Row
            key={l.milkTypeId}
            label={
              <View style={{ flexShrink: 1 }}>
                <Body>{l.name}</Body>
                <Muted>{`${litres(l.qtyMl)} ${tr('per day')}, ${l.paisePerLitre === null ? tr('no rate') : perLitre(l.paisePerLitre)}`}</Muted>
              </View>
            }
            last={i === lines.length - 1 && addable.length === 0}
          >
            <Pressable onPress={() => setEditing({ milkTypeId: l.milkTypeId, isNew: false })} hitSlop={8}>
              <Text style={{ fontFamily: font.body, fontSize: 13, color: C.blueText }}>{tr('Change')}</Text>
            </Pressable>
          </Row>
        ))}
        {addable.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(3) }}>
            {addable.map((t) => (
              <Button key={t.id} variant="ghost" icon="plus" onPress={() => setEditing({ milkTypeId: t.id, isNew: true })}>
                {t.name}
              </Button>
            ))}
          </View>
        ) : null}
        {editing ? (() => {
          const type = setup.types.find((t) => t.id === editing.milkTypeId)!
          const line = lines.find((l) => l.milkTypeId === editing.milkTypeId)
          return (
            <MilkEditor
              key={`${editing.milkTypeId}-${editing.isNew}`}
              customerId={customer.id}
              milkTypeId={type.id}
              name={type.name}
              qtyMl={line?.qtyMl ?? 1000}
              paisePerLitre={line ? line.paisePerLitre : type.defaultPaisePerLitre}
              isNew={editing.isNew}
              onCancel={() => setEditing(null)}
              onDone={() => {
                setEditing(null)
                void reload()
              }}
            />
          )
        })() : null}
      </Card>

      <View style={{ height: space(4) }} />
      <PauseSection customerId={customer.id} pauses={data.pauses} onChanged={() => void reload()} />

      <View style={{ height: space(4) }} />
      <Card>
        <Label>{tr('Route')}</Label>
        <Row label={tr('Stop {n} of {total}', { n: position + 1, total: order.length })} last>
          <View style={{ flexDirection: 'row', gap: space(2) }}>
            <Button variant="quiet" onPress={() => move(-1)} disabled={position <= 0}>{tr('Up')}</Button>
            <Button variant="quiet" onPress={() => move(1)} disabled={position < 0 || position >= order.length - 1}>{tr('Down')}</Button>
          </View>
        </Row>
      </Card>

      <View style={{ height: space(4) }} />
      <View style={{ gap: space(3) }}>
        <Button variant="ghost" onPress={() => setForm(true)}>{tr('Edit details')}</Button>
        {customer.active ? (
          stopping ? (
            <Card>
              <Label>{tr('First day without milk')}</Label>
              <DateChoice value={stopFrom} onChange={setStopFrom} initial="today" choices={['today', 'tomorrow', 'month', 'nextMonth', 'other']} />
              <View style={{ flexDirection: 'row', gap: space(3) }}>
                <Button variant="quiet" onPress={() => setStopping(false)} style={{ flex: 1 }}>{tr('Cancel')}</Button>
                <Button onPress={confirmStop} style={{ flex: 1 }}>{tr('Stop')}</Button>
              </View>
            </Card>
          ) : (
            <Button variant="quiet" onPress={() => setStopping(true)}>{tr('Stop this customer')}</Button>
          )
        ) : (
          <>
            <Button onPress={() => act(() => reactivateCustomer(customer.id), tr('Customer is back on the route'))}>{tr('Back on the route')}</Button>
            <Muted>{tr('Set the milk quantity again above; it stays at 0 until you do.')}</Muted>
          </>
        )}
      </View>
    </ScrollView>
  )
}

function Legend() {
  const items: { color: string; label: string }[] = [
    { color: C.sky, label: tr('As planned') },
    { color: C.amber, label: tr('Changed') },
    { color: C.none, label: tr('No milk') },
    { color: C.paused, label: tr('Paused') },
  ]
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3), marginTop: space(3) }}>
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5) }}>
          <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: i.color }} />
          <Muted>{i.label}</Muted>
        </View>
      ))}
    </View>
  )
}
