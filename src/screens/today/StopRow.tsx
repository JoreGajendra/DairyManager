import { Pressable, Text, View } from 'react-native'
import { litres, tr } from '../../lib'
import type { MilkTypeRow, RouteStop } from '../../dataHelpers'
import { C, font, muted, radius, space } from '../../ui/theme'
import { Icon } from '../../ui/ui'
import { stopState } from './todayHelpers'

/** One customer on the round: tap the row to tick delivered, tap the pill to change the quantity. */
export function StopRow({
  stop,
  types,
  onTick,
  onEdit,
}: {
  stop: RouteStop
  types: MilkTypeRow[]
  onTick: () => void
  onEdit: () => void
}) {
  const state = stopState(stop.items)
  const name = (id: number) => types.find((t) => t.id === id)?.name ?? ''
  const qty = stop.items
    .filter((i) => i.qtyMl > 0)
    .map((i) => `${name(i.milkTypeId)} ${litres(i.qtyMl)}`)
    .join(' · ')
  const tone = state === 'changed' ? { bg: C.amber, fg: C.amberText } : state === 'none' ? { bg: C.none, fg: muted } : { bg: C.sky, fg: C.blueText }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: stop.ticked ? C.sky : C.white,
        borderColor: C.line,
        borderWidth: 1,
        borderRadius: radius.card,
        marginBottom: space(2),
      }}
    >
      <Pressable
        onPress={onTick}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: stop.ticked }}
        accessibilityLabel={tr('Delivered to {name}', { name: stop.customer.name })}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(3) }}
      >
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            borderWidth: 2,
            borderColor: stop.ticked ? C.blue : C.line,
            backgroundColor: stop.ticked ? C.blue : C.white,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {stop.ticked ? <Icon name="check" size={18} color={C.white} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: font.display, fontSize: 16, color: C.navy }} numberOfLines={1}>{stop.customer.name}</Text>
          <Text style={{ fontFamily: font.body, fontSize: 13, color: muted }} numberOfLines={1}>
            {state === 'none' ? tr('Not delivered') : qty}
          </Text>
        </View>
      </Pressable>
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={tr('Change quantity for {name}', { name: stop.customer.name })}
        style={{ backgroundColor: tone.bg, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(2), marginRight: space(3) }}
      >
        <Text style={{ fontFamily: font.body, fontSize: 13, fontWeight: '700', color: tone.fg }}>
          {state === 'changed' ? tr('Changed') : tr('Edit')}
        </Text>
      </Pressable>
    </View>
  )
}
