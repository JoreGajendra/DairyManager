import { View } from 'react-native'
import { tr } from '../lib'
import { Body, Title } from '../ui/ui'
import { space } from '../ui/theme'

export function Customers() {
  return (
    <View style={{ flex: 1, padding: space(5) }}>
      <Title>{tr('Customers')}</Title>
      <Body>{tr('Coming soon')}</Body>
    </View>
  )
}
