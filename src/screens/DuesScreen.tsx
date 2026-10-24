import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { inr, tr } from '../lib'
import { loadAllDues } from '../db'
import type { Setup } from '../db'
import type { AllDues } from '../dataHelpers'
import { C, faint, font, space } from '../ui/theme'
import { Card, ErrorNote, Icon, Label, Loading, Muted, Title, styles } from '../ui/ui'
import { CustomerLedger } from './dues/CustomerLedger'
import { sortedDues } from './dues/duesLogic'

/**
 * Dues tab: what the provider is owed in total, every customer's outstanding
 * balance (largest first, searchable), and a customer's ledger one tap away
 * with payments, a WhatsApp reminder and Record payment.
 */
export function DuesScreen() {
  const [data, setData] = useState<(AllDues & { setup: Setup }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<number | null>(null)

  const reload = useCallback(
    () =>
      loadAllDues()
        .then(setData)
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))),
    [],
  )
  useEffect(() => {
    void reload()
  }, [reload])

  if (open !== null) {
    return (
      <CustomerLedger
        customerId={open}
        onBack={() => {
          setOpen(null)
          void reload()
        }}
        onChanged={() => void reload()}
      />
    )
  }
  if (!data) return error ? <View style={{ padding: space(5) }}><ErrorNote>{error}</ErrorNote></View> : <Loading />

  const rows = sortedDues(data.rows, query)
  return (
    <ScrollView contentContainerStyle={{ padding: space(5), paddingBottom: space(10) }} keyboardShouldPersistTaps="handled">
      <View style={{ paddingTop: space(1.5), paddingBottom: space(3.5) }}>
        <Title>{tr('Dues')}</Title>
      </View>
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Card tone="navy">
        <Label style={{ color: 'rgba(255,255,255,0.7)' }}>{tr('Total owed to you')}</Label>
        <Text style={{ fontFamily: font.display, fontSize: 32, color: C.white }}>{inr(data.owedPaise)}</Text>
        {data.aheadPaise > 0 ? <Text style={{ fontFamily: font.body, fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: space(1) }}>{tr('Customers have paid {amount} ahead', { amount: inr(data.aheadPaise) })}</Text> : null}
      </Card>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={tr('Search customers')}
        placeholderTextColor={faint}
        accessibilityLabel={tr('Search customers')}
        style={[styles.input, { marginBottom: space(3) }]}
      />

      {rows.length === 0 ? <Muted>{data.rows.length === 0 ? tr('No customers yet.') : tr('No customer matches.')}</Muted> : null}
      {rows.map((r) => {
        const net = r.outstanding.netPaise
        return (
          <Pressable
            key={r.customer.id}
            onPress={() => setOpen(r.customer.id)}
            accessibilityRole="button"
            accessibilityLabel={r.customer.name}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), backgroundColor: C.white, borderColor: C.line, borderWidth: 1, borderRadius: 14, padding: space(3.5), marginBottom: space(2) }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: font.body, fontSize: 15, fontWeight: '700', color: C.ink }}>{r.customer.name}</Text>
              <Muted>
                {r.outstanding.previousPaise > 0
                  ? tr('Previous months {amount}', { amount: inr(r.outstanding.previousPaise) })
                  : net === 0
                    ? tr('Settled')
                    : net < 0
                      ? tr('Paid ahead')
                      : tr('This month so far')}
              </Muted>
            </View>
            <Text style={{ fontFamily: font.display, fontSize: 17, color: net > 0 ? C.amberText : net < 0 ? C.blueText : C.ink }}>
              {net < 0 ? `+${inr(-net)}` : inr(net)}
            </Text>
            <Icon name="right" size={18} color={faint} />
          </Pressable>
        )
      })}
    </ScrollView>
  )
}
