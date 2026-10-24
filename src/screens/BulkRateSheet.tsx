/**
 * BulkRateSheet: change one milk's rate from a date for many customers at once.
 *
 * Props
 *   onDone   called after the rates were written (the sheet is finished: reload and close it).
 *   onClose  called when the sheet is dismissed without changing anything.
 * Render it only while open: `{open && <BulkRateSheet onDone={...} onClose={...} />}`.
 *
 * Choose the milk, the new rate in rupees per litre, the date it starts, and either
 * every active customer or a picked few. "Review" counts the customers that really
 * buy that milk (they get a new rate row; the rest are skipped), and the change is
 * made only after confirming. Optionally the milk type's default rate (the seed for
 * new customers) is changed too. Old rate rows are never edited.
 */
import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { dateLabel, inr, paiseFromText, rupeeText, todayIso, tr } from '../lib'
import type { IsoDate } from '../lib'
import { bulkRateChange, loadCustomer, loadSetup } from '../db'
import type { Setup } from '../db'
import { C, faint, font, space } from '../ui/theme'
import { Button, DateChoice, ErrorNote, Field, Icon, Label, Loading, Muted, notify, useGuard } from '../ui/ui'
import { bulkPreviewCount } from './dues/duesLogic'
import { Sheet } from './dues/Sheet'

export function BulkRateSheet({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [setup, setSetup] = useState<Setup | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [typeId, setTypeId] = useState<number | null>(null)
  const [rate, setRate] = useState<string | null>(null)
  const [from, setFrom] = useState<IsoDate | null>(todayIso())
  const [pick, setPick] = useState(false)
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [alsoDefault, setAlsoDefault] = useState(false)
  const [busy, setBusy] = useState(false)
  const { guard } = useGuard()
  // Set once Review has counted the customers who buy the milk.
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    loadSetup()
      .then(setSetup)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (!setup) return <Sheet onClose={onClose}>{error ? <ErrorNote>{error}</ErrorNote> : <Loading />}</Sheet>

  const types = setup.types.filter((t) => t.active)
  const type = types.find((t) => t.id === (typeId ?? types[0]?.id))
  const active = setup.customers.filter((c) => c.active)
  const rateText = rate ?? (type ? rupeeText(type.defaultPaisePerLitre) : '')
  const paise = paiseFromText(rateText)
  const ids = pick ? [...chosen] : undefined
  const targets = pick ? active.filter((c) => chosen.has(c.id)) : active

  const reset = () => setCount(null)

  const review = async () => {
    if (!type) return setError(tr('Add a milk type in Setup first.'))
    if (paise === null) return setError(tr('Enter the new rate per litre, like 64.'))
    if (!from) return setError(tr('Pick the date the new rate starts.'))
    if (targets.length === 0) return setError(tr('Pick at least one customer.'))
    setBusy(true)
    setError(null)
    try {
      const books = (await Promise.all(targets.map((c) => loadCustomer(c.id)))).filter((d) => d !== null)
      setCount(
        bulkPreviewCount(
          type.id,
          targets,
          ids,
          books.flatMap((d) => d.rates),
          books.flatMap((d) => d.plans),
        ),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const confirm = () => guard(async () => {
    if (!type || paise === null || !from) return
    setBusy(true)
    setError(null)
    try {
      const written = await bulkRateChange({ milkTypeId: type.id, from, paisePerLitre: paise, customerIds: ids, alsoSetDefault: alsoDefault })
      notify(tr('Rate changed for {count} customers', { count: written }))
      onDone()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setError(message)
      notify(message, 'error')
      setBusy(false)
    }
  })

  if (count !== null && type && paise !== null && from) {
    return (
      <Sheet onClose={onClose}>
        <Text style={{ fontFamily: font.display, fontSize: 20, color: C.navy, marginBottom: space(2) }}>{tr('Confirm rate change')}</Text>
        <Text style={{ fontFamily: font.body, fontSize: 15, color: C.ink, marginBottom: space(2) }}>
          {tr('{milk} at {rate} per litre from {date}.', { milk: type.name, rate: inr(paise), date: dateLabel(from) })}
        </Text>
        <Text style={{ fontFamily: font.display, fontSize: 18, color: C.navy, marginBottom: space(1) }}>{tr('{count} customers will get the new rate', { count })}</Text>
        <Muted style={{ marginBottom: space(4) }}>
          {tr('Customers who do not buy {milk} are skipped. Bills from that date use the new rate.', { milk: type.name })}
          {alsoDefault ? ` ${tr('The default rate for new customers changes too.')}` : ''}
        </Muted>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <View style={{ flexDirection: 'row', gap: space(2.5) }}>
          <Button variant="quiet" style={{ flex: 1 }} disabled={busy} onPress={reset}>
            {tr('Back')}
          </Button>
          <Button style={{ flex: 1 }} disabled={busy || count === 0} onPress={confirm}>
            {busy ? tr('Saving…') : tr('Change rate')}
          </Button>
        </View>
      </Sheet>
    )
  }

  return (
    <Sheet onClose={onClose}>
      <Text style={{ fontFamily: font.display, fontSize: 20, color: C.navy, marginBottom: space(4) }}>{tr('Change rate from a date')}</Text>

      <Label>{tr('Milk')}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginTop: space(1.5), marginBottom: space(3) }}>
        {types.length === 0 ? <Muted>{tr('Add a milk type in Setup first.')}</Muted> : null}
        {types.map((t) => (
          <Chip
            key={t.id}
            text={t.name}
            on={t.id === type?.id}
            onPress={() => {
              setTypeId(t.id)
              setRate(null)
            }}
          />
        ))}
      </View>

      <Field label={tr('New rate per litre (₹)')} value={rateText} onChangeText={setRate} keyboardType="decimal-pad" placeholder={tr('e.g. 64')} />

      <Label>{tr('Starts on')}</Label>
      <DateChoice value={from} onChange={setFrom} initial="today" choices={['today', 'month', 'nextMonth', 'other']} />

      <Label>{tr('For')}</Label>
      <View style={{ flexDirection: 'row', gap: space(2), marginTop: space(1.5), marginBottom: space(3) }}>
        <Chip text={tr('All active customers')} on={!pick} onPress={() => setPick(false)} />
        <Chip text={tr('Pick customers')} on={pick} onPress={() => setPick(true)} />
      </View>
      {pick ? (
        <View style={{ marginBottom: space(3) }}>
          {active.map((c) => (
            <Tick
              key={c.id}
              text={c.name}
              on={chosen.has(c.id)}
              onPress={() => {
                const next = new Set(chosen)
                if (next.has(c.id)) next.delete(c.id)
                else next.add(c.id)
                setChosen(next)
              }}
            />
          ))}
        </View>
      ) : null}

      <Tick text={tr('Also make this the default rate for new customers')} on={alsoDefault} onPress={() => setAlsoDefault(!alsoDefault)} />

      {error ? <View style={{ marginTop: space(3) }}><ErrorNote>{error}</ErrorNote></View> : null}
      <View style={{ flexDirection: 'row', gap: space(2.5), marginTop: space(4) }}>
        <Button variant="quiet" style={{ flex: 1 }} onPress={onClose}>
          {tr('Cancel')}
        </Button>
        <Button style={{ flex: 1 }} disabled={busy || !type || paise === null || !from} onPress={review}>
          {busy ? tr('Checking…') : tr('Review')}
        </Button>
      </View>
    </Sheet>
  )
}

function Chip({ text, on, onPress }: { text: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      style={{ paddingHorizontal: space(3), paddingVertical: space(1.5), borderRadius: 999, borderWidth: 1, borderColor: on ? C.blue : C.line, backgroundColor: on ? C.sky : C.white }}
    >
      <Text style={{ fontFamily: font.body, fontSize: 13, fontWeight: on ? '700' : '400', color: on ? C.blueText : C.ink }}>{text}</Text>
    </Pressable>
  )
}

function Tick({ text, on, onPress }: { text: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(2), borderBottomWidth: 1, borderBottomColor: C.line }}
    >
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: on ? C.blue : faint, backgroundColor: on ? C.blue : C.white, alignItems: 'center', justifyContent: 'center' }}>
        {on ? <Icon name="check" size={16} color={C.white} /> : null}
      </View>
      <Text style={{ flex: 1, fontFamily: font.body, fontSize: 14, color: C.ink }}>{text}</Text>
    </Pressable>
  )
}
