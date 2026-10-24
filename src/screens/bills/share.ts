import { Alert, Linking } from 'react-native'
import { File, Paths } from 'expo-file-system'
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

/** The share sheet for a file, named `fileName` plus extension: pick WhatsApp, then the customer. */
export async function shareFile(uri: string, mimeType: 'application/pdf' | 'image/png', title: string, fileName: string): Promise<void> {
  const UTI = mimeType === 'application/pdf' ? 'com.adobe.pdf' : 'public.png'
  // Print and capture give random names; WhatsApp shows the file's own name, so copy it to a proper one.
  const named = new File(Paths.cache, `${fileName}.${mimeType === 'application/pdf' ? 'pdf' : 'png'}`)
  new File(uri).copy(named, { overwrite: true })
  await Sharing.shareAsync(named.uri, { mimeType, UTI, dialogTitle: title })
}
