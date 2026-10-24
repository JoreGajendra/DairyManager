import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native'
import { tr } from '../../lib'
import { C, space } from '../../ui/theme'

/** A bottom sheet over the screen: tap outside or press back to close. */
export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          onPress={onClose}
          accessibilityLabel={tr('Close')}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 42, 74, 0.45)' }}
        />
        <View style={{ maxHeight: '92%', backgroundColor: C.milk, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.line, marginTop: space(2) }} />
          <ScrollView contentContainerStyle={{ padding: space(5), paddingBottom: space(8) }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}
