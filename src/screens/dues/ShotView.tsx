import { useState } from 'react'
import { Image, Modal, Pressable, View } from 'react-native'
import { tr } from '../../lib'
import { C, radius } from '../../ui/theme'
import { shotFile } from './paymentShot'

/** A payment's screenshot as a small thumbnail; tap to see it full screen. Draws nothing when the file is gone. */
export function ShotThumb({ name, size = 44 }: { name: string; size?: number }) {
  const [open, setOpen] = useState(false)
  const [broken, setBroken] = useState(false)
  if (broken) return null
  const uri = shotFile(name).uri
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityLabel={tr('Transaction screenshot')}>
        <Image source={{ uri }} onError={() => setBroken(true)} style={{ width: size, height: size, borderRadius: radius.cell, borderWidth: 1, borderColor: C.line, backgroundColor: C.milk }} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Pressable onPress={() => setOpen(false)} accessibilityLabel={tr('Close')} style={{ flex: 1, backgroundColor: 'rgba(15,42,74,0.92)', justifyContent: 'center' }}>
          <View style={{ flex: 1, padding: 16 }}>
            <Image source={{ uri }} resizeMode="contain" style={{ flex: 1 }} />
          </View>
        </Pressable>
      </Modal>
    </>
  )
}
