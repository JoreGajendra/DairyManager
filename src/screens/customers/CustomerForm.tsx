import { useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { todayIso, tr } from '../../lib'
import type { IsoDate } from '../../lib'
import { addCustomer, editCustomer } from '../../db'
import type { Customer, MilkTypeRow } from '../../dataHelpers'
import { C, font, radius, space } from '../../ui/theme'
import { Button, Card, DateChoice, ErrorNote, Field, Header, Label, Muted, notify, useBack } from '../../ui/ui'
import { emptyDrafts, milksFromDrafts } from './customerView'
import type { MilkDraft } from './customerView'

/**
 * Add a customer (details, milks with litres and rate, start date) or edit the
 * details of one. Editing leaves milks alone: quantity and rate changes are new
 * dated rows, made from the customer's page.
 */
export function CustomerForm({
  customer,
  types,
  onDone,
  onCancel,
}: {
  customer?: Customer
  types: MilkTypeRow[]
  onDone: (id: number) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(customer?.name ?? '')
  const [phone, setPhone] = useState(customer?.phone ?? '')
  const [address, setAddress] = useState(customer?.address ?? '')
  const [drafts, setDrafts] = useState<MilkDraft[]>(() => emptyDrafts(types))
  const [startDate, setStartDate] = useState<IsoDate | null>(todayIso())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useBack(() => {
    onCancel()
    return true
  }, [onCancel])

  const patch = (id: number, change: Partial<MilkDraft>) =>
    setDrafts((all) => all.map((d) => (d.milkTypeId === id ? { ...d, ...change } : d)))

  const save = async () => {
    setError(null)
    if (!name.trim()) return setError(tr('Enter the customer name.'))
    setBusy(true)
    try {
      if (customer) {
        await editCustomer(customer.id, { name, phone, address })
        notify(tr('Details saved'))
        onDone(customer.id)
        return
      }
      if (!startDate) return setError(tr('Pick a valid start date.'))
      const parsed = milksFromDrafts(drafts)
      if ('error' in parsed) return setError(parsed.error)
      if (!parsed.milks.length) return setError(tr('Choose at least one milk.'))
      const id = await addCustomer({ name, phone, address, startDate, milks: parsed.milks })
      notify(tr('Customer added'))
      onDone(id)
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e)
      setError(text)
      notify(text, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: space(5), paddingTop: space(2) }} keyboardShouldPersistTaps="handled">
      <Header title={customer ? tr('Edit customer') : tr('New customer')} onBack={onCancel} />
      <Card>
        <Field label={tr('Name')} value={name} onChangeText={setName} />
        <Field label={tr('Phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={15} />
        <Field label={tr('Address')} value={address} onChangeText={setAddress} />
      </Card>

      {customer ? null : (
        <>
          <View style={{ height: space(4) }} />
          <Card>
            <Label>{tr('Milk')}</Label>
            {drafts.length === 0 ? <Muted>{tr('Add a milk in Setup first.')}</Muted> : null}
            {drafts.map((d) => (
              <View key={d.milkTypeId} style={{ marginTop: space(2) }}>
                <Pressable
                  onPress={() => patch(d.milkTypeId, { on: !d.on })}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: d.on }}
                  style={{
                    paddingVertical: space(2),
                    paddingHorizontal: space(3),
                    borderRadius: radius.control,
                    borderWidth: 1,
                    borderColor: d.on ? C.blue : C.line,
                    backgroundColor: d.on ? C.sky : C.white,
                  }}
                >
                  <Text style={{ fontFamily: font.body, fontSize: 15, fontWeight: d.on ? '700' : '400', color: d.on ? C.blueText : C.ink }}>{d.name}</Text>
                </Pressable>
                {d.on ? (
                  <View style={{ flexDirection: 'row', gap: space(3), marginTop: space(2) }}>
                    <View style={{ flex: 1 }}>
                      <Field label={tr('Litres per day')} value={d.qty} onChangeText={(qty) => patch(d.milkTypeId, { qty })} keyboardType="decimal-pad" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field label={tr('Rate per litre (rupees)')} value={d.rate} onChangeText={(rate) => patch(d.milkTypeId, { rate })} keyboardType="decimal-pad" />
                    </View>
                  </View>
                ) : null}
              </View>
            ))}
          </Card>

          <View style={{ height: space(4) }} />
          <Card>
            <Label>{tr('Delivery starts')}</Label>
            <DateChoice value={startDate} onChange={setStartDate} initial="today" choices={['today', 'tomorrow', 'month', 'other']} />
          </Card>
        </>
      )}

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <View style={{ flexDirection: 'row', gap: space(3), marginTop: space(4) }}>
        <Button variant="quiet" onPress={onCancel} style={{ flex: 1 }}>{tr('Cancel')}</Button>
        <Button onPress={save} disabled={busy} style={{ flex: 1 }}>{tr('Save')}</Button>
      </View>
    </ScrollView>
  )
}
