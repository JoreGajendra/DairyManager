import { useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { inr, monthLabel, tr } from '../../lib'
import type { IsoMonth } from '../../lib'
import { C, font, space } from '../../ui/theme'
import { Button, Card, ErrorNote, Header, Muted, useBack } from '../../ui/ui'
import { billWhatsApp } from './billsModel'
import type { BillItem } from './BillDetail'
import { openWhatsApp } from './share'

/**
 * "Send all": walks through the customers one at a time. Each step opens
 * WhatsApp with that customer's bill typed in; Next or Skip moves on. Nothing
 * is sent without the provider pressing send in WhatsApp.
 */
export function SendAll({ month, queue, business, onBack }: { month: IsoMonth; queue: BillItem[]; business: string; onBack: () => void }) {
  const [at, setAt] = useState(0)
  const [opened, setOpened] = useState<Set<number>>(new Set())
  useBack(() => {
    onBack()
    return true
  }, [onBack])

  const done = at >= queue.length
  const current = done ? null : queue[at]!
  const message = current ? billWhatsApp(month, current.row, current.customer, business) : null

  const open = async () => {
    if (!current || !message?.url) return
    if (await openWhatsApp(message.url)) setOpened((s) => new Set(s).add(current.customer.id))
  }
  const advance = () => setAt((n) => n + 1)

  return (
    <ScrollView contentContainerStyle={{ padding: space(5), paddingTop: space(2) }}>
      <Header title={tr('Send all bills')} subtitle={monthLabel(month)} onBack={onBack} />
      <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line, overflow: 'hidden', marginBottom: space(1.5) }}>
        <View style={{ height: 6, width: `${queue.length ? (Math.min(at, queue.length) / queue.length) * 100 : 100}%`, backgroundColor: C.blue }} />
      </View>
      <Muted style={{ marginBottom: space(4) }}>{tr('{done} of {total} done', { done: Math.min(at, queue.length), total: queue.length })}</Muted>

      {current && message ? (
        <>
          <Card>
            <Text style={{ fontFamily: font.display, fontSize: 20, color: C.navy }}>{current.customer.name}</Text>
            <Muted>{tr('Bill {amount}', { amount: inr(current.row.payablePaise) })}</Muted>
            <View style={{ marginTop: space(3) }}>
              <Text style={{ fontFamily: font.body, fontSize: 14, color: C.ink }}>{message.text}</Text>
            </View>
          </Card>
          {message.url ? null : (
            <View style={{ marginTop: space(3) }}>
              <ErrorNote>{tr('{name} has no phone number. Add one in Customers to send on WhatsApp.', { name: current.customer.name })}</ErrorNote>
            </View>
          )}
          <View style={{ gap: space(2.5), marginTop: space(4) }}>
            {message.url ? (
              <Button icon="chat" onPress={() => void open()}>
                {opened.has(current.customer.id) ? tr('Open WhatsApp again') : tr('Open WhatsApp')}
              </Button>
            ) : null}
            <Button variant={message.url && opened.has(current.customer.id) ? 'primary' : 'ghost'} onPress={advance}>
              {at + 1 < queue.length ? tr('Next customer') : tr('Finish')}
            </Button>
            <Button variant="quiet" onPress={advance}>
              {tr('Skip this customer')}
            </Button>
          </View>
        </>
      ) : (
        <Card>
          <Text style={{ fontFamily: font.display, fontSize: 20, color: C.navy }}>{tr('All done')}</Text>
          <Muted>{tr('{opened} opened in WhatsApp · {skipped} skipped', { opened: opened.size, skipped: queue.length - opened.size })}</Muted>
          <View style={{ marginTop: space(4) }}>
            <Button onPress={onBack}>{tr('Back to bills')}</Button>
          </View>
        </Card>
      )}
    </ScrollView>
  )
}
