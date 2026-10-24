/** The transaction screenshot of a payment: picked from the gallery, kept in the app's documents folder, referred to by file name. */
import * as ImagePicker from 'expo-image-picker'
import { File, Paths } from 'expo-file-system'

export const shotFile = (name: string): File => new File(Paths.document, name)

/** Lets the person choose a picture and keeps a copy; returns its file name, or null when they cancel. */
export async function pickScreenshot(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 })
  const asset = result.canceled ? undefined : result.assets[0]
  if (!asset) return null
  const name = `payment-${Date.now()}.jpg`
  new File(asset.uri).copy(shotFile(name))
  return name
}

/** Forgets a screenshot copy; harmless when it is already gone. */
export function dropScreenshot(name: string | null | undefined): void {
  if (!name) return
  try {
    const file = shotFile(name)
    if (file.exists) file.delete()
  } catch {
    // Nothing to clean up.
  }
}

/** The picture as base64 for the receipt PDF, or null when the file is missing. */
export async function screenshotForPdf(name: string | null | undefined): Promise<{ base64: string; mime: string } | null> {
  if (!name) return null
  try {
    const file = shotFile(name)
    return file.exists ? { base64: await file.base64(), mime: 'image/jpeg' } : null
  } catch {
    return null
  }
}
