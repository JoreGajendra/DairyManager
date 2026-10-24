import { Alert, Linking } from 'react-native'
import * as Sharing from 'expo-sharing'
import { tr } from '../../lib'

/** Opens a wa.me link; says so plainly when WhatsApp cannot be opened. Returns whether it opened. */
export async function openWhatsApp(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url)
    return true
  } catch {
    Alert.alert(tr('Could not open WhatsApp'), tr('Check WhatsApp is installed on this phone.'))
    return false
  }
}

/** The share sheet for a file: pick WhatsApp, then the customer. */
export async function shareFile(uri: string, mimeType: 'application/pdf' | 'image/png', title: string): Promise<void> {
  const UTI = mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.png'
  await Sharing.shareAsync(uri, { mimeType, UTI, dialogTitle: title })
}
