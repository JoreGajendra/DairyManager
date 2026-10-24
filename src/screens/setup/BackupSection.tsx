import { useState } from 'react'
import { Alert } from 'react-native'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'
import { todayIso, tr } from '../../lib'
import { exportBackupJson, importBackupJson } from '../../db'
import { space } from '../../ui/theme'
import { Button, Card, ErrorNote, Label, Muted, notify } from '../../ui/ui'

/**
 * Everything lives only on this phone, so Setup offers a JSON copy: export hands
 * the file to the share sheet; import checks the file, asks, then replaces all data.
 */
export function BackupSection({ onRestored }: { onRestored: () => void }) {
  const [error, setError] = useState<string | null>(null)

  const fail = (e: unknown) => {
    const text = e instanceof Error ? e.message : String(e)
    setError(text)
    notify(text, 'error')
  }

  const exportFile = async () => {
    setError(null)
    try {
      const file = new File(Paths.cache, `dairymanager-backup-${todayIso()}.json`)
      file.create({ overwrite: true })
      file.write(await exportBackupJson())
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: tr('DairyManager backup') })
      notify(tr('Backup file created'))
    } catch (e) {
      fail(new Error(tr('Backup failed: {error}', { error: e instanceof Error ? e.message : String(e) })))
    }
  }

  const importFile = async () => {
    setError(null)
    try {
      const picked = await File.pickFileAsync({ mimeTypes: ['*/*'] })
      if (picked.canceled) return
      const text = await picked.result.text()
      Alert.alert(tr('Replace all data?'), tr('Every customer, bill and payment on this phone is replaced by the backup. This cannot be undone.'), [
        { text: tr('Cancel'), style: 'cancel' },
        {
          text: tr('Replace'),
          style: 'destructive',
          onPress: () =>
            void (async () => {
              try {
                await importBackupJson(text)
                notify(tr('Backup restored'))
                onRestored()
              } catch (e) {
                fail(e)
              }
            })(),
        },
      ])
    } catch (e) {
      fail(e)
    }
  }

  return (
    <Card>
      <Label>{tr('Backup')}</Label>
      <Muted>{tr('Your data lives only on this phone. Keep a copy.')}</Muted>
      <Button variant="ghost" icon="download" onPress={exportFile} style={{ marginTop: space(3) }}>{tr('Export backup')}</Button>
      <Button variant="quiet" icon="share" onPress={importFile} style={{ marginTop: space(2) }}>{tr('Restore from backup file')}</Button>
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </Card>
  )
}
