import { useState } from 'react'
import { View } from 'react-native'
import { litreDigits, mlFromText, paiseFromText, todayIso, tr } from '../../lib'
import type { IsoDate } from '../../lib'
import { setPlan, setRate } from '../../db'
import { space } from '../../ui/theme'
import { Button, Card, DateChoice, ErrorNote, Field, Label, Muted, notify, useGuard } from '../../ui/ui'

/**
 * Changes one milk of a customer from a date: a new quantity and/or a new rate.
 * Nothing is edited in place; each change adds a dated row, so earlier days and
 * bills keep what they were. Also used to start a milk the customer did not take.
 */
export function MilkEditor({
  customerId,
  milkTypeId,
  name,
  qtyMl,
  paisePerLitre,
  isNew,
  onDone,
  onCancel,
}: {
  customerId: number
  milkTypeId: number
  name: string
  qtyMl: number
  /** The rate now (or the milk's default for a new milk); null when none is set. */
  paisePerLitre: number | null
  isNew: boolean
  onDone: () => void
  onCancel: () => void
}) {
  const [qty, setQty] = useState(litreDigits(qtyMl).replace(/,/g, ''))
  const [rate, setRateText] = useState(paisePerLitre === null ? '' : String(paisePerLitre / 100))
  const [from, setFrom] = useState<IsoDate | null>(todayIso())
  const [error, setError] = useState<string | null>(null)
  const { busy, guard } = useGuard()

  const run = (write: (from: IsoDate) => Promise<void>) => guard(async () => {
    setError(null)
    if (!from) return setError(tr('Pick a valid date.'))
    try {
      await write(from)
      notify(tr('Saved'))
      onDone()
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e)
      setError(text)
      notify(text, 'error')
    }
  })

  const save = () => {
    const newQty = mlFromText(qty)
    const newRate = paiseFromText(rate)
    if (newQty === null) return setError(tr('Enter litres for {name}.', { name }))
    if (newRate === null) return setError(tr('Enter a rate for {name}.', { name }))
    return run(async (date) => {
      if (isNew || newQty !== qtyMl) await setPlan(customerId, milkTypeId, date, newQty)
      if (isNew || newRate !== paisePerLitre) await setRate(customerId, milkTypeId, date, newRate)
    })
  }

  // Stopping a milk is a plan of 0 L from the date; the rate and history stay.
  const stop = () => run((date) => setPlan(customerId, milkTypeId, date, 0))

  return (
    <Card style={{ marginTop: space(3) }}>
      <Label>{isNew ? tr('Add {name}', { name }) : tr('Change {name}', { name })}</Label>
      <View style={{ flexDirection: 'row', gap: space(3), marginTop: space(2) }}>
        <View style={{ flex: 1 }}>
          <Field label={tr('Litres per day')} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label={tr('Rate per litre (rupees)')} value={rate} onChangeText={setRateText} keyboardType="decimal-pad" />
        </View>
      </View>
      <Label>{tr('From')}</Label>
      <DateChoice value={from} onChange={setFrom} initial="today" choices={['today', 'tomorrow', 'month', 'nextMonth', 'other']} />
      <Muted>{tr('Days before this date keep their old quantity and rate.')}</Muted>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <View style={{ flexDirection: 'row', gap: space(3), marginTop: space(3) }}>
        <Button variant="quiet" onPress={onCancel} style={{ flex: 1 }}>{tr('Cancel')}</Button>
        <Button onPress={save} disabled={busy} style={{ flex: 1 }}>{tr('Save')}</Button>
      </View>
      {isNew || qtyMl === 0 ? null : (
        <Button variant="quiet" onPress={stop} disabled={busy} style={{ marginTop: space(2) }}>{tr('Stop this milk')}</Button>
      )}
    </Card>
  )
}
