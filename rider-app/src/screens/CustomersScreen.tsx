/** The rider's own customer list: search, then open one to act on it. */
import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { fetchCustomers } from '../api/endpoints';
import { STORAGE_KEYS } from '../config';
import { readCache, writeCache } from '../lib/cache';
import { Banner, Button, EmptyState, Pill } from '../components/ui';
import { colors, radius, spacing } from '../theme';
import type { Customer } from '../api/types';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Customers'>;

export function CustomersScreen({ navigation }: Props): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [cached, setCached] = useState<Customer[] | null>(null);

  const query = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const result = await fetchCustomers();
      await writeCache(STORAGE_KEYS.customersCache, result.customers);
      return result;
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (query.data || cached) return;
    void readCache<Customer[]>(STORAGE_KEYS.customersCache).then(hit => setCached(hit?.data ?? null));
  }, [query.data, cached]);

  const all = query.data?.customers ?? cached ?? [];
  const needle = search.trim().toLowerCase();
  const customers = needle
    ? all.filter(
        c => c.name.toLowerCase().includes(needle) || c.mobile.includes(needle.replace(/\D/g, '')),
      )
    : all;

  return (
    <View style={styles.flex}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder="Search name or mobile"
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
        />
      </View>

      <FlatList
        data={customers}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            {!query.data && cached ? (
              <Banner tone="info" text="Showing the customer list saved on this phone." />
            ) : null}
            <Button label="+ Add customer" onPress={() => navigation.navigate('AddCustomer')} />
            <Text style={styles.count}>
              {customers.length} customer{customers.length === 1 ? '' : 's'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('CustomerDetail', { customerId: item.id })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}>
            <View style={styles.rowMain}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>
                {item.mobile} · {item.bottlesPerDay} bottle{item.bottlesPerDay === 1 ? '' : 's'}/day
                {item.area ? ` · ${item.area}` : ''}
              </Text>
              <View style={styles.pills}>
                {item.subscription ? (
                  <Pill
                    label={
                      item.subscription.status === 'paused'
                        ? 'Paused'
                        : `${item.subscription.planName}${
                            item.subscription.daysLeft !== null
                              ? ` · ${item.subscription.daysLeft}d left`
                              : ''
                          }`
                    }
                    color={item.subscription.status === 'paused' ? colors.warning : colors.primary}
                    filled={false}
                  />
                ) : (
                  <Pill label="No plan" color={colors.textMuted} filled={false} />
                )}
                {item.status === 'inactive' ? <Pill label="Inactive" color={colors.danger} /> : null}
                {item.renewalDue ? <Pill label="Renewal due" color={colors.warning} /> : null}
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          query.isLoading ? (
            <EmptyState title="Loading customers…" />
          ) : (
            <EmptyState
              title={needle ? 'No match' : 'No customers yet'}
              body={needle ? 'Try a different name or number.' : 'Add your first customer at their door.'}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  searchBar: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  search: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    minHeight: 46,
    fontSize: 16,
    color: colors.text,
  },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, marginBottom: spacing.md },
  count: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  pressed: { opacity: 0.9 },
  rowMain: { gap: 2 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted },
  pills: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
});
