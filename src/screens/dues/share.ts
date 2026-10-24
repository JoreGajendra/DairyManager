/** Opening WhatsApp and sharing a PDF: the only device-facing bits of the Dues screens. */
import { Linking } from 'react-native'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { tr, whatsappUrl } from '../../lib'

/** Opens a WhatsApp chat with `phone` (the chat picker when the number is not usable) with `text` typed in. */
export async function sendWhatsApp(phone: string, text: string): Promise<void> {
  await Linking.openURL(whatsappUrl(phone, text))
}

/** Turns `html` into a PDF and opens the share sheet. */
export async function sharePdf(html: string, title: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html })
  if (!(await Sharing.isAvailableAsync())) throw new Error(tr('Sharing is not available on this device.'))
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title })
}
