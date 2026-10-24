import { useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import { dateLabel, todayIso, tr } from '../../lib'
import type { IsoDate, Pause } from '../../lib'
import { addPause, deletePause, resumePause } from '../../db'
import { C, font, space } from '../../ui/theme'
import { Button, Card, DateChoice, ErrorNote, Label, Muted, Row, notify } from '../../ui/ui'

/**
 * Holidays: delivery stops from a day until the day it comes again (or until
 * resumed). Overlaps are refused by the db layer and the reason shown here.
 */
export function PauseSection({ customerId, pauses, onChanged }: { customerId: number; pauses: Pause[]; onChanged: () => void }) {
  const [mode, setMode] = useState<'none' | 'add' | { resume: Pause }>('none')
  const [from, setFrom] = useState<IsoDate | null>(todayIso())
  const [until, setUntil] = useState<IsoDate | null>(null)
  const [openEnded, setOpenEnded] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>, done: string) => {
    setError(null)
    try {
      await action()
      notify(done)
      setMode('none')
      onChanged()
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e)
      setError(text)
      notify(text, 'error')
    }
  }

  const open = (next: typeof mode, resumeDefault: IsoDate | null) => {
    setError(null)
    setUntil(resumeDefault)
    setMode(next)
  }

  const confirmDelete = (p: Pause) =>
    Alert.alert(tr('Delete this pause?'), tr('Those days will bill at the normal plan again.'), [
      { text: tr('Cancel'), style: 'cancel' },
      { text: tr('Delete'), style: 'destructive', onPress: () => void run(() => deletePause(p.id), tr('Pause deleted')) },
    ])

  const range = (p: Pause) =>
    p.resumeOn
      ? tr('{from} until {to}', { from: dateLabel(p.from), to: dateLabel(p.resumeOn) })
      : tr('From {from}, until resumed', { from: dateLabel(p.from) })

  return (
    <Card>
      <Label>{tr('Pauses')}</Label>
      {pauses.length === 0 ? <Muted>{tr('No pauses.')}</Muted> : null}
      {pauses.map((p, i) => (
        <Row key={p.id} label={<Text style={{ fontFamily: font.body, fontSize: 14, color: C.ink, flexShrink: 1 }}>{range(p)}</Text>} last={i === pauses.length - 1}>
          <View style={{ flexDirection: 'row', gap: space(4) }}>
            <Pressable onPress={() => open({ resume: p }, null)} hitSlop={8}>
              <Text style={{ fontFamily: font.body, fontSize: 13, color: C.blueText }}>{tr('Resume')}</Text>
            </Pressable>
            <Pressable onPress={() => confirmDelete(p)} hitSlop={8}>
              <Text style={{ fontFamily: font.body, fontSize: 13, color: C.danger }}>{tr('Delete')}</Text>
            </Pressable>
          </View>
        </Row>
      ))}

      {mode === 'none' ? (
        <Button variant="ghost" onPress={() => open('add', null)} style={{ marginTop: space(3) }}>{tr('Pause delivery')}</Button>
      ) : mode === 'add' ? (
        <View style={{ marginTop: space(3) }}>
          <Label>{tr('First day without milk')}</Label>
          <DateChoice value={from} onChange={setFrom} initial="today" choices={['today', 'tomorrow', 'other']} />
          <Label>{tr('Milk comes again on')}</Label>
          <View style={{ flexDirection: 'row', gap: space(2), marginTop: space(1.5) }}>
            <Button variant={openEnded ? 'primary' : 'quiet'} onPress={() => setOpenEnded(true)} style={{ flex: 1 }}>{tr('Until I resume')}</Button>
            <Button variant={openEnded ? 'quiet' : 'primary'} onPress={() => setOpenEnded(false)} style={{ flex: 1 }}>{tr('A set day')}</Button>
          </View>
          {openEnded ? null : <DateChoice value={until} onChange={setUntil} initial="other" choices={['tomorrow', 'other']} />}
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <View style={{ flexDirection: 'row', gap: space(3), marginTop: space(3) }}>
            <Button variant="quiet" onPress={() => setMode('none')} style={{ flex: 1 }}>{tr('Cancel')}</Button>
            <Button
              style={{ flex: 1 }}
              onPress={() => {
                if (!from) return setError(tr('Pick a valid date.'))
                if (!openEnded && !until) return setError(tr('Pick a valid date.'))
                void run(() => addPause(customerId, from, openEnded ? null : until), tr('Pause added'))
              }}
            >
              {tr('Save')}
            </Button>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: space(3) }}>
          <Label>{tr('Milk comes again on')}</Label>
          <DateChoice value={until} onChange={setUntil} initial="other" choices={['today', 'tomorrow', 'other']} />
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <View style={{ flexDirection: 'row', gap: space(3), marginTop: space(3) }}>
            <Button variant="quiet" onPress={() => setMode('none')} style={{ flex: 1 }}>{tr('Cancel')}</Button>
            <Button
              style={{ flex: 1 }}
              onPress={() => {
                if (!until) return setError(tr('Pick a valid date.'))
                const pause = mode.resume
                void run(() => resumePause(customerId, pause, until), tr('Delivery resumes'))
              }}
            >
              {tr('Save')}
            </Button>
          </View>
        </View>
      )}
    </Card>
  )
}
