import { useCallback, useEffect, useRef, useState } from 'react'
import type { DependencyList, ReactNode } from 'react'
import { ActivityIndicator, Animated, BackHandler, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg'
import { addMonths, dateLabel, getLang, isIsoDate, monthLabel, monthOf, todayIso, tomorrowIso, tr } from '../lib'
import type { IsoDate, IsoMonth } from '../lib'
import { C, faint, font, muted, radius, space } from './theme'

/** The pieces every screen is built from, drawn to `design/mockups.html`. */

export type IconName =
  | 'calendar'
  | 'bill'
  | 'gear'
  | 'left'
  | 'right'
  | 'back'
  | 'share'
  | 'image'
  | 'plus'
  | 'minus'
  | 'download'
  | 'wallet'
  | 'check'
  | 'chat'

/** 24px grid, 1.75 stroke, no emoji anywhere in the product. */
const PATHS: Record<IconName, string[]> = {
  calendar: ['M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM4 10h16M8 4v4M16 4v4'],
  bill: ['M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3'],
  gear: [
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
    'M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.4A7.5 7.5 0 0 0 7 6.4l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.5 7.5 0 0 0 2.6 1.5l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.6-1.5l2.4.9 2-3.4z',
  ],
  left: ['m15 6-6 6 6 6'],
  right: ['m9 6 6 6-6 6'],
  back: ['M19 12H5m0 0 5-5m-5 5 5 5'],
  share: ['M12 4v12m0-12 4 4m-4-4-4 4', 'M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14'],
  image: ['M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z', 'm4 16 5-5 4 4 2-2 5 5M15 8.5h.01'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  download: ['M12 4v11m0 0 4-4m-4 4-4-4M5 19h14'],
  check: ['m5 12.5 4.5 4.5L19 7.5'],
  chat: ['M20 12a7.5 7.5 0 0 1-10.9 6.7L4 20l1.4-4.2A7.5 7.5 0 1 1 20 12z'],
  wallet: ['M4 7.5A1.5 1.5 0 0 1 5.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z', 'M16 12.5h2.5'],
}

export function Icon({ name, size = 22, color = C.ink }: { name: IconName; size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {PATHS[name].map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ))}
    </Svg>
  )
}

/**
 * The app icon: a capped milk bottle with a drop on its label and a butter
 * "delivered" tick, on a blue-to-navy tile; `word` adds the two-tone wordmark.
 * `assets/` holds the same drawing (generated from these shapes at 1024 px).
 */
export function Logo({ size = 30, word = false }: { size?: number; word?: boolean }) {
  const mark = (
    <Svg width={size} height={size} viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id="logoTile" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={C.blue} />
          <Stop offset="1" stopColor={C.navy} />
        </LinearGradient>
      </Defs>
      <Rect width={1024} height={1024} rx={300} fill="url(#logoTile)" />
      <G transform="matrix(1.15 0 0 1.15 -178 -114.75)">
        <Path d="M452,285 H572 V345 L652,445 V770 a40,40 0 0 1 -40,40 H412 a40,40 0 0 1 -40,-40 V445 L452,345 Z" fill={C.white} />
        <Rect x={436} y={232} width={152} height={62} rx={16} fill={C.butter} />
        <Rect x={372} y={540} width={280} height={96} fill={C.navy} />
        <Path d="M512,560 c0,0 -26,30 -26,46 a26,26 0 0 0 52,0 c0,-16 -26,-46 -26,-46z" fill={C.white} />
        <Circle cx={690} cy={720} r={138} fill="#123459" />
        <Circle cx={690} cy={720} r={115} fill={C.butter} />
        <Path d="M638,722 l38,38 l76,-82" fill="none" stroke={C.navy} strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" />
      </G>
    </Svg>
  )
  if (!word) return mark
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.26 }}>
      {mark}
      <Text style={{ fontFamily: font.display, fontSize: size * 0.66, color: C.navy }}>
        Dairy<Text style={{ color: C.blueText }}>Manager</Text>
      </Text>
    </View>
  )
}

export function Card({ children, style, tone = 'white' }: { children: ReactNode; style?: object; tone?: 'white' | 'navy' }) {
  return (
    <View style={[styles.card, tone === 'navy' && { backgroundColor: C.navy, borderColor: C.navy }, style]}>{children}</View>
  )
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>
}

export function Label({ children, style }: { children: ReactNode; style?: object }) {
  // Letter spacing splits Devanagari conjuncts, so Marathi labels are set solid.
  return <Text style={[styles.label, getLang() === 'mr' && { letterSpacing: 0 }, style]}>{children}</Text>
}

export function Body({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.body, style]}>{children}</Text>
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>
}

export function Button({
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  icon,
  style,
}: {
  children: ReactNode
  onPress?: () => void
  variant?: 'primary' | 'ghost' | 'quiet'
  disabled?: boolean
  icon?: IconName
  style?: object
}) {
  const tone =
    variant === 'primary'
      ? { backgroundColor: C.blue, borderColor: C.blue }
      : variant === 'ghost'
        ? { backgroundColor: 'transparent', borderColor: C.blue }
        : { backgroundColor: C.white, borderColor: C.line }
  const text = variant === 'primary' ? C.white : variant === 'ghost' ? C.blueText : C.ink
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [styles.button, tone, (pressed || disabled) && { opacity: disabled ? 0.5 : 0.8 }, style]}
    >
      {icon ? <Icon name={icon} size={20} color={text} /> : null}
      <Text style={[styles.buttonText, { color: text }]}>{children}</Text>
    </Pressable>
  )
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  keyboardType,
  maxLength,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  hint?: string
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad' | 'phone-pad'
  maxLength?: number
}) {
  return (
    <View style={{ marginBottom: space(3) }}>
      <Label>{label}</Label>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={faint}
        keyboardType={keyboardType}
        maxLength={maxLength}
        accessibilityLabel={label}
        style={styles.input}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  )
}

/** A quantity with - and + either side; the number itself is typed into when tapped. */
export function Stepper({
  value,
  onMinus,
  onPlus,
  onChangeText,
  label,
}: {
  value: string
  onMinus: () => void
  onPlus: () => void
  onChangeText: (text: string) => void
  label: string
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
      <Pressable onPress={onMinus} style={styles.step} accessibilityLabel={tr('Less {name}', { name: label })} hitSlop={4}>
        <Icon name="minus" size={20} color={C.blueText} />
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', minWidth: 64, justifyContent: 'center' }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          selectTextOnFocus
          accessibilityLabel={tr('{name} litres', { name: label })}
          style={styles.stepValue}
        />
        <Text style={[styles.stepValue, { marginLeft: 3 }]}>{tr('L')}</Text>
      </View>
      <Pressable onPress={onPlus} style={styles.step} accessibilityLabel={tr('More {name}', { name: label })} hitSlop={4}>
        <Icon name="plus" size={20} color={C.blueText} />
      </Pressable>
    </View>
  )
}

/** Previous month, the month, next month. */
export function MonthBar({ month, onChange }: { month: IsoMonth; onChange: (month: IsoMonth) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space(2.5) }}>
      <Pressable onPress={() => onChange(addMonths(month, -1))} style={styles.arrow} accessibilityLabel={tr('Previous month')}>
        <Icon name="left" size={20} />
      </Pressable>
      <Text style={{ fontFamily: font.display, fontSize: 17, color: C.navy }}>{monthLabel(month)}</Text>
      <Pressable onPress={() => onChange(addMonths(month, 1))} style={styles.arrow} accessibilityLabel={tr('Next month')}>
        <Icon name="right" size={20} />
      </Pressable>
    </View>
  )
}

/** A label on the left and a value on the right, with a hairline under it. */
export function Row({ label, children, last = false }: { label: ReactNode; children: ReactNode; last?: boolean }) {
  return (
    <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
      {typeof label === 'string' ? <Body>{label}</Body> : label}
      <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>{children}</View>
    </View>
  )
}

export type DateChoiceKey = 'month' | 'nextMonth' | 'yesterday' | 'today' | 'tomorrow' | 'other'

const CHOICE_LABEL: Record<DateChoiceKey, string> = {
  month: '1st of this month',
  nextMonth: '1st of next month',
  yesterday: 'Yesterday',
  today: 'Today',
  tomorrow: 'Tomorrow',
  other: 'Other date',
}

function choiceDate(key: Exclude<DateChoiceKey, 'other'>): IsoDate {
  const today = todayIso()
  const now = new Date()
  switch (key) {
    case 'month': return `${monthOf(today)}-01`
    case 'nextMonth': return `${addMonths(monthOf(today), 1)}-01`
    case 'yesterday': return todayIso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
    case 'today': return today
    case 'tomorrow': return tomorrowIso()
  }
}

/**
 * A date without a date-picker library: the common answers as pills, and a
 * typed date for anything else. Reports null while the typed date is not valid.
 */
export function DateChoice({
  value,
  onChange,
  initial,
  choices,
}: {
  value: IsoDate | null
  onChange: (date: IsoDate | null) => void
  initial: DateChoiceKey
  choices: readonly DateChoiceKey[]
}) {
  const [choice, setChoice] = useState<DateChoiceKey>(initial)
  const [typed, setTyped] = useState(value ?? '')

  const pick = (next: DateChoiceKey) => {
    setChoice(next)
    onChange(next === 'other' ? (isIsoDate(typed) ? typed : null) : choiceDate(next))
  }

  return (
    <View style={{ marginTop: space(1.5), marginBottom: space(3) }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
        {choices.map((c) => {
          const active = c === choice
          return (
            <Pressable
              key={c}
              onPress={() => pick(c)}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              style={{
                paddingHorizontal: space(3),
                paddingVertical: space(1.5),
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: active ? C.blue : C.line,
                backgroundColor: active ? C.sky : C.white,
              }}
            >
              <Text style={{ fontFamily: font.body, fontSize: 13, fontWeight: active ? '700' : '400', color: active ? C.blueText : C.ink }}>
                {tr(CHOICE_LABEL[c])}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {choice === 'other' ? (
        <View style={{ marginTop: space(2) }}>
          <Field
            label={tr('Date (YYYY-MM-DD)')}
            value={typed}
            onChangeText={(text) => {
              setTyped(text)
              onChange(isIsoDate(text) ? text : null)
            }}
            placeholder={todayIso()}
            maxLength={10}
          />
        </View>
      ) : null}
      {value ? <Text style={{ fontFamily: font.body, fontSize: 12, color: muted }}>{dateLabel(value)}</Text> : null}
    </View>
  )
}

export function Loading() {
  return (
    <View style={styles.centre}>
      <ActivityIndicator color={C.blue} />
    </View>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <Text style={styles.error}>{children}</Text>
}

/** A screen that could not load: the reason and a retry button. */
export function LoadFailed({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <View style={{ padding: space(5) }}>
      <ErrorNote>{error}</ErrorNote>
      <Button variant="ghost" onPress={onRetry}>{tr('Try again')}</Button>
    </View>
  )
}

/**
 * Runs an async action at most once at a time. A second tap while the first is
 * still running is ignored at once (a ref, so it holds even before a re-render);
 * `busy` is for greying the button.
 */
export function useGuard() {
  const running = useRef(false)
  const [busy, setBusy] = useState(false)
  const guard = useCallback(async (action: () => Promise<void>) => {
    if (running.current) return
    running.current = true
    setBusy(true)
    try {
      await action()
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [])
  return { busy, guard }
}

type Note = { text: string; tone: 'done' | 'error'; key: number }

let showNote: ((note: Note) => void) | null = null
let noteKey = 0

/** Shows a short message at the bottom of the screen: what an action did, or why it failed. */
export function notify(text: string, tone: Note['tone'] = 'done') {
  showNote?.({ text, tone, key: ++noteKey })
}

/** Where `notify` messages appear. Mounted once, over every screen. */
export function Notifier() {
  const insets = useSafeAreaInsets()
  const [note, setNote] = useState<Note | null>(null)
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    showNote = setNote
    return () => {
      showNote = null
    }
  }, [])

  useEffect(() => {
    if (!note) return
    opacity.setValue(0)
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start()
    const timer = setTimeout(
      () => Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setNote(null)),
      note.tone === 'error' ? 4000 : 2400,
    )
    return () => clearTimeout(timer)
  }, [note])

  if (!note) return null
  const error = note.tone === 'error'
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.note, { bottom: insets.bottom + 84, opacity }, error && { backgroundColor: C.danger }]}
    >
      <Icon name={error ? 'minus' : 'check'} size={18} color={error ? C.white : C.butter} />
      <Text style={styles.noteText}>{note.text}</Text>
    </Animated.View>
  )
}

/**
 * Lets a screen take Android's back button. `handle` returns true when it used
 * the press. Registered again when `deps` change, so the newest listener,
 * which Android asks first, is always the current one.
 */
export function useBack(handle: () => boolean, deps: DependencyList) {
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', handle)
    return () => subscription.remove()
  }, deps)
}

/** A back arrow and a title: the top of every screen pushed over the tabs. */
export function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingTop: space(1.5), paddingBottom: space(4) }}>
      <Pressable onPress={onBack} hitSlop={10} accessibilityLabel={tr('Back')}>
        <Icon name="back" size={22} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Title>{title}</Title>
        {subtitle ? <Muted>{subtitle}</Muted> : null}
      </View>
    </View>
  )
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: C.white,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: space(4),
    marginBottom: space(3.5),
    elevation: 1,
    shadowColor: C.navy,
  },
  title: { fontFamily: font.display, fontSize: 22, color: C.navy },
  label: { fontFamily: font.body, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: muted },
  body: { fontFamily: font.body, fontSize: 14, color: C.ink },
  muted: { fontFamily: font.body, fontSize: 12, color: muted },
  hint: { fontFamily: font.body, fontSize: 11, color: faint, marginTop: 3 },
  input: {
    fontFamily: font.body,
    fontSize: 15,
    color: C.ink,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: radius.control,
    backgroundColor: C.white,
    paddingHorizontal: space(3),
    paddingVertical: space(2.5),
    marginTop: 4,
  },
  button: {
    flexDirection: 'row',
    gap: space(2),
    borderWidth: 1,
    borderRadius: radius.control,
    paddingVertical: space(3),
    paddingHorizontal: space(4),
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontFamily: font.body, fontSize: 15, fontWeight: '600' },
  step: {
    width: 40,
    height: 40,
    borderRadius: radius.cell,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { fontFamily: font.display, fontSize: 18, color: C.navy, padding: 0, textAlign: 'center' },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: radius.cell,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space(3),
    paddingVertical: space(2.5),
    borderBottomWidth: 1,
    borderBottomColor: C.line,
  },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: {
    fontFamily: font.body,
    fontSize: 13,
    color: C.danger,
    backgroundColor: '#FFF1F2',
    padding: space(2.5),
    borderRadius: radius.control,
    marginBottom: space(3),
  },
  note: {
    position: 'absolute',
    left: space(5),
    right: space(5),
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(2.5),
    backgroundColor: C.navy,
    borderRadius: radius.control,
    paddingVertical: space(3),
    paddingHorizontal: space(4),
    elevation: 6,
    shadowColor: C.navy,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  noteText: { flex: 1, fontFamily: font.body, fontSize: 14, color: C.white },
})
