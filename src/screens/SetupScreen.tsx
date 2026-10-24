import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { LANGUAGES, getLang, setLang, tr } from '../lib'
import type { Lang } from '../lib'
import { loadSetup, saveLanguage, saveSettings } from '../db'
import type { Setup } from '../db'
import { C, font, radius, space } from '../ui/theme'
import { Button, Card, ErrorNote, Field, Label, Loading, Title, notify } from '../ui/ui'
import { BulkRateSheet } from './BulkRateSheet'
import { BackupSection } from './setup/BackupSection'
import { MilkTypesSection } from './setup/MilkTypesSection'

/** Setup tab: business details, language, milk types, rate changes and backup. */
export function SetupScreen({ onLanguageChange }: { onLanguageChange?: (lang: Lang) => void }) {
  const [bulkOpen, setBulkOpen] = useState(false)
  const [setup, setSetup] = useState<Setup | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [lang, setLangState] = useState<Lang>(getLang())
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const s = await loadSetup()
      setSetup(s)
      setName(s.settings.businessName)
      setPhone(s.settings.businessPhone)
      setLang(s.settings.language)
      setLangState(s.settings.language)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const saveBusiness = async () => {
    try {
      await saveSettings({ businessName: name, businessPhone: phone })
      setError(null)
      notify(tr('Details saved'))
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e)
      setError(text)
      notify(text, 'error')
    }
  }

  const pickLanguage = async (next: Lang) => {
    try {
      await saveLanguage(next)
      setLang(next)
      setLangState(next)
      onLanguageChange?.(next)
      notify(tr('Language saved'))
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  if (!setup) return error ? <ErrorNote>{error}</ErrorNote> : <Loading />

  return (
    <ScrollView contentContainerStyle={{ padding: space(5), paddingTop: space(2), paddingBottom: space(10) }} keyboardShouldPersistTaps="handled">
      <View style={{ paddingTop: space(1.5), paddingBottom: space(3.5) }}>
        <Title>{tr('Setup')}</Title>
      </View>
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Card>
        <Label>{tr('Your business')}</Label>
        <Field label={tr('Business name')} value={name} onChangeText={setName} hint={tr('Shown on bills and messages.')} />
        <Field label={tr('Phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={15} />
        <Button onPress={saveBusiness}>{tr('Save')}</Button>
      </Card>

      <View style={{ height: space(4) }} />
      <Card>
        <Label>{tr('Language')}</Label>
        <View style={{ flexDirection: 'row', gap: space(2), marginTop: space(2) }}>
          {LANGUAGES.map((l) => {
            const active = l.code === lang
            return (
              <Pressable
                key={l.code}
                onPress={() => void pickLanguage(l.code)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: space(2.5),
                  borderRadius: radius.control,
                  borderWidth: 1,
                  borderColor: active ? C.blue : C.line,
                  backgroundColor: active ? C.sky : C.white,
                }}
              >
                <Text style={{ fontFamily: font.body, fontSize: 15, fontWeight: active ? '700' : '400', color: active ? C.blueText : C.ink }}>{l.label}</Text>
              </Pressable>
            )
          })}
        </View>
      </Card>

      <View style={{ height: space(4) }} />
      <MilkTypesSection types={setup.types} onChanged={() => void reload()} />

      <View style={{ height: space(4) }} />
      <Card>
        <Label>{tr('Change rate from a date')}</Label>
        <Button variant="ghost" onPress={() => setBulkOpen(true)}>{tr('Change rate')}</Button>
      </Card>
      {bulkOpen ? (
        <BulkRateSheet
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false)
            void reload()
          }}
        />
      ) : null}

      <View style={{ height: space(4) }} />

      <BackupSection onRestored={() => void reload()} />
    </ScrollView>
  )
}
