import { useCallback, useEffect, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { tr } from '../lib'
import { loadSetup } from '../db'
import type { Setup } from '../db'
import { C, faint, font, muted, radius, space } from '../ui/theme'
import { Body, Button, Card, ErrorNote, Loading, Muted, Title, styles } from '../ui/ui'
import { CustomerDetail } from './customers/CustomerDetail'
import { CustomerForm } from './customers/CustomerForm'
import { filterCustomers } from './customers/customerView'

type View_ = { page: 'list' } | { page: 'add' } | { page: 'detail'; id: number }

/**
 * Customers tab: the list with search, a form to add one, and each customer's
 * page. Which page shows is state, not a navigation library.
 */
export function CustomersScreen() {
  const [view, setView] = useState<View_>({ page: 'list' })
  const [setup, setSetup] = useState<Setup | null>(null)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      setSetup(await loadSetup())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    if (view.page === 'list') void reload()
  }, [view.page, reload])

  if (view.page === 'add') {
    if (!setup) return <Loading />
    return <CustomerForm types={setup.types} onCancel={() => setView({ page: 'list' })} onDone={(id) => setView({ page: 'detail', id })} />
  }
  if (view.page === 'detail') return <CustomerDetail customerId={view.id} onBack={() => setView({ page: 'list' })} />

  if (!setup) return error ? <ErrorNote>{error}</ErrorNote> : <Loading />

  const shown = filterCustomers(setup.customers, query)
  const active = shown.filter((c) => c.active)
  const stopped = shown.filter((c) => !c.active)

  const row = (c: (typeof shown)[number], n?: number) => (
    <Pressable
      key={c.id}
      onPress={() => setView({ page: 'detail', id: c.id })}
      accessibilityRole="button"
      style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(3), borderBottomWidth: 1, borderBottomColor: C.line }}
    >
      {n === undefined ? null : (
        <Text style={{ width: 26, fontFamily: font.display, fontSize: 14, color: muted, textAlign: 'right' }}>{n}</Text>
      )}
      <View style={{ flex: 1 }}>
        <Body style={c.active ? undefined : { color: muted }}>{c.name}</Body>
        {c.phone || c.address ? <Muted>{[c.phone, c.address].filter(Boolean).join(' - ')}</Muted> : null}
      </View>
    </Pressable>
  )

  return (
    <ScrollView contentContainerStyle={{ padding: space(5), paddingTop: space(2) }} keyboardShouldPersistTaps="handled">
      <View style={{ paddingTop: space(1.5), paddingBottom: space(3), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Title>{tr('Customers')}</Title>
        <Button icon="plus" onPress={() => setView({ page: 'add' })}>{tr('Add')}</Button>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={tr('Search name, phone or address')}
        placeholderTextColor={faint}
        accessibilityLabel={tr('Search customers')}
        style={[styles.input, { borderRadius: radius.control, marginBottom: space(3) }]}
      />
      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {setup.customers.length === 0 ? (
        <Card>
          <Muted>{tr('No customers yet. Add the first one.')}</Muted>
        </Card>
      ) : shown.length === 0 ? (
        <Muted>{tr('No customer matches.')}</Muted>
      ) : (
        <>
          {active.length ? <Card>{active.map((c, i) => row(c, query ? undefined : i + 1))}</Card> : null}
          {stopped.length ? (
            <View style={{ marginTop: space(4) }}>
              <Muted style={{ marginBottom: space(2) }}>{tr('Stopped')}</Muted>
              <Card>{stopped.map((c) => row(c))}</Card>
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  )
}
