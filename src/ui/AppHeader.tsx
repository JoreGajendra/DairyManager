import { Text, View } from 'react-native'
import { tr } from '../lib'
import { C, font, space } from './theme'
import { Logo } from './ui'

/**
 * The provider's own name across the top of every screen: navy band, the milk
 * bottle mark, the name large, and the phone (or a tagline) beneath. Falls back
 * to the app name until a business name is set in Setup.
 */
export function AppHeader({ name, phone, top }: { name: string; phone: string; top: number }) {
  const shown = name.trim()
  return (
    <View style={{ backgroundColor: C.navy, borderBottomWidth: 3, borderBottomColor: C.butter, paddingTop: top + space(3), paddingBottom: space(3), paddingHorizontal: space(5), flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
      <Logo size={36} />
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ fontFamily: font.display, fontSize: 21, color: C.white }}>
          {shown || 'MilkDiary'}
        </Text>
        <Text numberOfLines={1} style={{ fontFamily: font.body, fontSize: 12, color: C.butter, letterSpacing: 0.3 }}>
          {phone.trim() || tr('Milk delivery')}
        </Text>
      </View>
    </View>
  )
}
