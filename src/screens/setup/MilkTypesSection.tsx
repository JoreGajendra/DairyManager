import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { inr, paiseFromText, rupeeText, tr } from '../../lib'
import { addMilkType, renameMilkType, setMilkTypeActive, setMilkTypeDefaultRate } from '../../db'
import type { MilkTypeRow } from '../../dataHelpers'
import { C, font, muted, space } from '../../ui/theme'
import { Body, Button, Card, ErrorNote, Field, Label, Muted, Row, notify } from '../../ui/ui'

/**
 * The milks sold. The default rate only seeds a new customer; changing it
 * touches nobody's existing rate (use "Change rate from date" for that).
 */
export function MilkTypesSection({ types, onChanged }: { types: MilkTypeRow[]; onChanged: () => void }) {
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [name, setName] = useState('')
  const [rate, setRate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const open = (id: number | 'new', t?: MilkTypeRow) => {
    setError(null)
    setName(t?.name ?? '')
    setRate(t ? rupeeText(t.defaultPaisePerLitre) : '')
    setEditing(id)
  }

  const run = async (action: () => Promise<void>, done: string) => {
    setError(null)
    try {
      await action()
      notify(done)
      setEditing(null)
      onChanged()
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e)
      setError(text)
      notify(text, 'error')
    }
  }

  const save = () => {
    const paise = paiseFromText(rate)
    if (!name.trim()) return setError(tr('Enter the milk name.'))
    if (paise === null) return setError(tr('Enter a rate in rupees.'))
    const id = editing
    if (id === 'new') return void run(async () => void (await addMilkType(name, paise)), tr('Milk added'))
    if (id === null) return
    void run(async () => {
      await renameMilkType(id, name)
      await setMilkTypeDefaultRate(id, paise)
    }, tr('Milk saved'))
  }

  const form = (
    <View style={{ marginTop: space(3) }}>
      <Field label={tr('Milk name')} value={name} onChangeText={setName} />
      <Field label={tr('Default rate per litre (rupees)')} value={rate} onChangeText={setRate} keyboardType="decimal-pad" hint={tr('Used only for new customers.')} />
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <View style={{ flexDirection: 'row', gap: space(3) }}>
        <Button variant="quiet" onPress={() => setEditing(null)} style={{ flex: 1 }}>{tr('Cancel')}</Button>
        <Button onPress={save} style={{ flex: 1 }}>{tr('Save')}</Button>
      </View>
    </View>
  )

  return (
    <Card>
      <Label>{tr('Milk types')}</Label>
      {types.length === 0 ? <Muted>{tr('No milk yet. Add one to start adding customers.')}</Muted> : null}
      {types.map((t, i) =>
        editing === t.id ? (
          <View key={t.id}>{form}</View>
        ) : (
          <Row
            key={t.id}
            last={i === types.length - 1 && editing !== null}
            label={
              <View style={{ flexShrink: 1 }}>
                <Body style={t.active ? undefined : { color: muted }}>{t.name}</Body>
                <Muted>{`${tr('Default')} ${inr(t.defaultPaisePerLitre)} / ${tr('L')}${t.active ? '' : `, ${tr('hidden')}`}`}</Muted>
              </View>
            }
          >
            <View style={{ flexDirection: 'row', gap: space(4) }}>
              <Pressable onPress={() => open(t.id, t)} hitSlop={8}>
                <Text style={{ fontFamily: font.body, fontSize: 13, color: C.blueText }}>{tr('Edit')}</Text>
              </Pressable>
              <Pressable onPress={() => void run(() => setMilkTypeActive(t.id, !t.active), t.active ? tr('Milk hidden') : tr('Milk shown'))} hitSlop={8}>
                <Text style={{ fontFamily: font.body, fontSize: 13, color: C.blueText }}>{t.active ? tr('Hide') : tr('Show')}</Text>
              </Pressable>
            </View>
          </Row>
        ),
      )}
      {editing === 'new' ? form : editing === null ? <Button variant="ghost" icon="plus" onPress={() => open('new')} style={{ marginTop: space(3) }}>{tr('Add milk')}</Button> : null}
    </Card>
  )
}
