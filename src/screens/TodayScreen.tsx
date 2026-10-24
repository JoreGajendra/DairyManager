import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { dateLabel, nextDay, previousDay, setLang, todayIso, tr, weekdayLabel } from '../lib'
import type { IsoDate } from '../lib'
import type { RouteStop } from '../dataHelpers'
import { loadRoute, setTick } from '../db'
import type { Setup } from '../db'
import { C, font, muted, space } from '../ui/theme'
import { Body, Card, Icon, LoadFailed, Loading, Muted, Title, notify, styles } from '../ui/ui'
import { EditSheet } from './today/EditSheet'
import { StopRow } from './today/StopRow'
import { progressOf } from './today/todayHelpers'

/** The day's round: customers in route order, tick as delivered, change a quantity. */
export function TodayScreen() {
  const [date, setDate] = useState<IsoDate>(todayIso())
  const [route, setRoute] = useState<{ setup: Setup; stops: RouteStop[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<RouteStop | null>(null)
  const latest = useRef(0)

  const load = useCallback(async (d: IsoDate) => {
    const ticket = ++latest.current
    try {
      const r = await loadRoute(d)
      if (ticket !== latest.current) return
      setLang(r.setup.settings.language)
      setRoute(r)
      setError(null)
    } catch (e) {
      if (ticket === latest.current) setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    setRoute(null)
    void load(date)
  }, [date, load])

  const toggle = async (stop: RouteStop) => {
    const ticked = !stop.ticked
    setRoute((r) => r && { ...r, stops: r.stops.map((s) => (s.customer.id === stop.customer.id ? { ...s, ticked } : s)) })
    try {
      await setTick(stop.customer.id, date, ticked)
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
      void load(date)
    }
  }

  const stops = route?.stops ?? []
  const { done, total } = progressOf(stops)
  const isToday = date === todayIso()

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space(5), paddingTop: space(3) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => setDate(previousDay(date))} style={styles.arrow} accessibilityLabel={tr('Previous day')}>
            <Icon name="left" size={20} />
          </Pressable>
          <Pressable onPress={() => setDate(todayIso())} disabled={isToday} accessibilityLabel={tr('Go to today')} style={{ alignItems: 'center' }}>
            <Text style={{ fontFamily: font.display, fontSize: 18, color: C.navy }}>{isToday ? tr('Today') : weekdayLabel(date)}</Text>
            <Text style={{ fontFamily: font.body, fontSize: 13, color: muted }}>{dateLabel(date)}</Text>
          </Pressable>
          <Pressable onPress={() => setDate(nextDay(date))} style={styles.arrow} accessibilityLabel={tr('Next day')}>
            <Icon name="right" size={20} />
          </Pressable>
        </View>
        {total > 0 ? (
          <Card tone="navy" style={{ marginTop: space(3), marginBottom: space(3), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontFamily: font.display, fontSize: 20, color: C.white }}>{tr('{done}/{total} done', { done, total })}</Text>
            <View style={{ flex: 1, height: 8, marginLeft: space(4), borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)' }}>
              <View style={{ width: `${Math.round((done / total) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: C.butter }} />
            </View>
          </Card>
        ) : null}
      </View>

      {error ? (
        <LoadFailed error={error} onRetry={() => { setError(null); void load(date) }} />
      ) : !route ? (
        <Loading />
      ) : total === 0 ? (
        <View style={{ padding: space(5) }}>
          <Title>{tr('No deliveries')}</Title>
          <Body>{tr('Add customers in the Customers tab to build your route.')}</Body>
          <Muted style={{ marginTop: space(2) }}>{tr('Paused and stopped customers do not appear here.')}</Muted>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: space(5), paddingBottom: space(6) }}>
          {stops.map((s) => (
            <StopRow key={s.customer.id} stop={s} types={route.setup.types} onTick={() => void toggle(s)} onEdit={() => setEditing(s)} />
          ))}
        </ScrollView>
      )}

      {editing && route ? (
        <EditSheet
          stop={editing}
          types={route.setup.types}
          date={date}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void load(date)
          }}
        />
      ) : null}
    </View>
  )
}
