import { useEffect, useState } from 'react'
import { BackHandler, Pressable, Text, View } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFonts } from 'expo-font'
import { StatusBar } from 'expo-status-bar'
import { getLang, setLang, tr } from './src/lib'
import type { Lang } from './src/lib'
import { loadLanguage } from './src/db'
import { Bills } from './src/screens/Bills'
import { Customers } from './src/screens/Customers'
import { Dues } from './src/screens/Dues'
import { Setup } from './src/screens/Setup'
import { Today } from './src/screens/Today'
import { C, FONT_FILES, font, muted, space } from './src/ui/theme'
import { Icon, Loading, Notifier } from './src/ui/ui'
import type { IconName } from './src/ui/ui'

/**
 * MilkDiary Provider. Five tabs; navigation is a piece of state rather than a
 * library. Every screen is inset by hand because Android draws edge to edge.
 */
type Tab = 'today' | 'customers' | 'bills' | 'dues' | 'setup'

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'today', label: 'Today', icon: 'calendar' },
  { key: 'customers', label: 'Customers', icon: 'chat' },
  { key: 'bills', label: 'Bills', icon: 'bill' },
  { key: 'dues', label: 'Dues', icon: 'wallet' },
  { key: 'setup', label: 'Setup', icon: 'gear' },
]

export default function App() {
  return (
    <SafeAreaProvider>
      <AppShell />
      <Notifier />
    </SafeAreaProvider>
  )
}

function AppShell() {
  const insets = useSafeAreaInsets()
  const [fontsLoaded] = useFonts(FONT_FILES)
  const [tab, setTab] = useState<Tab>('today')
  const [lang, setLangState] = useState<Lang | null>(null)

  useEffect(() => {
    loadLanguage()
      .then((l) => {
        setLang(l)
        setLangState(l)
      })
      .catch(() => setLangState(getLang()))
  }, [])

  const changeLanguage = (l: Lang) => {
    setLang(l)
    setLangState(l)
  }

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab === 'today') return false
      setTab('today')
      return true
    })
    return () => subscription.remove()
  }, [tab])

  const screen = { flex: 1, backgroundColor: C.milk, paddingTop: insets.top } as const

  if (!fontsLoaded || !lang) {
    return (
      <View style={screen}>
        <Loading />
      </View>
    )
  }

  return (
    <View key={lang} style={screen}>
      <StatusBar style="dark" />
      <View style={{ flex: 1 }}>
        {tab === 'today' && <Today />}
        {tab === 'customers' && <Customers />}
        {tab === 'bills' && <Bills />}
        {tab === 'dues' && <Dues />}
        {tab === 'setup' && <Setup onLanguageChange={changeLanguage} />}
      </View>

      <View
        style={{
          flexDirection: 'row',
          borderTopWidth: 1,
          borderTopColor: C.line,
          backgroundColor: C.white,
          paddingTop: space(2),
          paddingBottom: Math.max(insets.bottom, space(2)),
        }}
      >
        {TABS.map((t) => {
          const active = t.key === tab
          const color = active ? C.blueText : muted
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={{ flex: 1, alignItems: 'center', gap: 3, paddingVertical: space(1) }}
            >
              <Icon name={t.icon} size={22} color={color} />
              <Text style={{ fontFamily: font.body, fontSize: 11, color, fontWeight: active ? '700' : '400' }}>{tr(t.label)}</Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}
