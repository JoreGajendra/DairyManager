import { Pressable, Text, View } from 'react-native'
import { dateLabel, litreDigits, tr, weekdayLabel } from '../../lib'
import type { BillDay, DayStatus, IsoMonth } from '../../lib'
import { C, font, muted, radius, space } from '../../ui/theme'
import { calendarCells } from './customerView'

const FILL: Record<DayStatus, { bg: string; fg: string }> = {
  plan: { bg: C.sky, fg: C.blueText },
  changed: { bg: C.amber, fg: C.amberText },
  none: { bg: C.none, fg: muted },
  off: { bg: C.none, fg: muted },
  paused: { bg: C.paused, fg: C.pausedText },
  future: { bg: C.white, fg: muted },
}

// 2026-10-04 is a Sunday: seven consecutive days give the week-head labels.
const HEAD_DATES = ['04', '05', '06', '07', '08', '09', '10'].map((d) => `2026-10-${d}`)

/** A day can be edited when some milk is planned or was entered for it. */
export const dayEditable = (day: BillDay): boolean => day.items.some((i) => i.plannedMl > 0 || i.qtyMl > 0)

/** The month as a grid: each day's litres, coloured by what happened (plan, changed, none, paused, to come). Tap an editable day to change it. */
export function MonthCalendar({ month, days, onPickDay }: { month: IsoMonth; days: BillDay[]; onPickDay: (day: BillDay) => void }) {
  const byDate = new Map(days.map((d) => [d.date, d]))
  const cells = calendarCells(month)
  const weeks: (typeof cells)[] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return (
    <View accessibilityLabel={tr('Month calendar')}>
      <View style={{ flexDirection: 'row' }}>
        {HEAD_DATES.map((d) => (
          <Text key={d} style={{ flex: 1, textAlign: 'center', fontFamily: font.body, fontSize: 11, color: muted, marginBottom: space(1) }}>
            {weekdayLabel(d)}
          </Text>
        ))}
      </View>
      {weeks.map((week, w) => (
        <View key={w} style={{ flexDirection: 'row' }}>
          {week.map((date, i) => {
            const day = date ? byDate.get(date) : undefined
            if (!date || !day) return <View key={i} style={{ flex: 1, margin: 2, height: 44 }} />
            const f = FILL[day.status]
            const dash = day.status === 'paused' || day.status === 'none' || day.status === 'off'
            return (
              <Pressable
                key={i}
                disabled={!dayEditable(day)}
                onPress={() => onPickDay(day)}
                accessibilityRole="button"
                accessibilityLabel={dateLabel(date)}
                style={{
                  flex: 1,
                  margin: 2,
                  height: 44,
                  borderRadius: radius.cell,
                  backgroundColor: f.bg,
                  borderWidth: day.status === 'future' ? 1 : 0,
                  borderColor: C.line,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontFamily: font.body, fontSize: 10, color: f.fg }}>{Number(date.slice(8))}</Text>
                <Text style={{ fontFamily: font.body, fontSize: 12, fontWeight: '700', color: f.fg }}>{dash ? '-' : litreDigits(day.totalMl)}</Text>
              </Pressable>
            )
          })}
        </View>
      ))}
    </View>
  )
}
