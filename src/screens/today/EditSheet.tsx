import { useState } from 'react'
import { Modal, Pressable, ScrollView, View } from 'react-native'
import { dateLabel, litres, tr } from '../../lib'
import type { IsoDate } from '../../lib'
import type { MilkTypeRow, RouteStop } from '../../dataHelpers'
import { saveDay } from '../../db'
import { C, space } from '../../ui/theme'
import { Body, Button, ErrorNote, Label, Muted, Stepper, Title, notify } from '../../ui/ui'
import { STEP_ML, dayItems, notDeliveredItems, nudgeQty, qtyText } from './todayHelpers'

/**
 * One customer's delivery on one day: how much of each milk went out, or none.
 * Saving writes only the differences from the plan (`saveDay`); the tick is
 * separate and never touched here.
 */
export function EditSheet({
  stop,
  types,
  date,
  onClose,
  onSaved,
}: {
  stop: RouteStop
  types: MilkTypeRow[]
  date: IsoDate
  onClose: () => void
  onSaved: () => void
}) {
  const [lines, setLines] = useState(() =>
    stop.items.map((i) => ({
      milkTypeId: i.milkTypeId,
      name: types.find((t) => t.id === i.milkTypeId)?.name ?? '',
      plannedMl: i.plannedMl,
      text: qtyText(i.qtyMl),
    })),
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const setText = (id: number, text: string) => setLines(lines.map((l) => (l.milkTypeId === id ? { ...l, text } : l)))

  const write = async (items: { milkTypeId: number; qtyMl: number }[], done: string) => {
    setSaving(true)
    try {
      await saveDay(stop.customer.id, date, items)
      notify(done)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  const save = () => {
    const items = dayItems(lines)
    if (!items) return setError(tr('Enter each quantity in litres, like 1 or 1.5.'))
    void write(items, tr('Saved'))
  }

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(15,42,74,0.45)' }} onPress={onClose} accessibilityLabel={tr('Close')} />
      <View style={{ backgroundColor: C.milk, padding: space(5), borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '85%' }}>
        <Title>{stop.customer.name}</Title>
        <Muted style={{ marginBottom: space(4) }}>{dateLabel(date)}</Muted>
        <ScrollView keyboardShouldPersistTaps="handled">
          {lines.map((l) => (
            <View key={l.milkTypeId} style={{ marginBottom: space(4) }}>
              <Label>{l.name}</Label>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Stepper
                  label={l.name}
                  value={l.text}
                  onMinus={() => setText(l.milkTypeId, nudgeQty(l.text, -STEP_ML, l.plannedMl))}
                  onPlus={() => setText(l.milkTypeId, nudgeQty(l.text, STEP_ML, l.plannedMl))}
                  onChangeText={(t) => setText(l.milkTypeId, t)}
                />
                <Muted>{tr('Planned {qty}', { qty: litres(l.plannedMl) })}</Muted>
              </View>
            </View>
          ))}
          <Body style={{ marginBottom: space(3) }}>{tr('A changed quantity changes the month bill. Ticking does not.')}</Body>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </ScrollView>
        <View style={{ gap: space(2), marginTop: space(2) }}>
          <Button onPress={save} disabled={saving}>{tr('Save')}</Button>
          <Button variant="ghost" disabled={saving} onPress={() => void write(notDeliveredItems(stop.items), tr('Marked not delivered'))}>
            {tr('Not delivered')}
          </Button>
          <Button variant="quiet" onPress={onClose} disabled={saving}>{tr('Cancel')}</Button>
        </View>
      </View>
    </Modal>
  )
}
