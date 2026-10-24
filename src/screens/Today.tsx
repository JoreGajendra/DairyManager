import { View } from 'react-native'
import { tr } from '../lib'
import { Body, Title } from '../ui/ui'
import { space } from '../ui/theme'

export function Today() {
  return (
    <View style={{ flex: 1, padding: space(5) }}>
      <Title>{tr('Today')}</Title>
      <Body>{tr('Coming soon')}</Body>
    </View>
  )
}
