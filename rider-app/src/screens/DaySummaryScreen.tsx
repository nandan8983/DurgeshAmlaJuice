/** End of the round: what went out, what is left, what was collected. */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from '../lib/location';
import { useTodayRoute } from '../hooks/useRoute';
import { request } from '../api/client';
import { useAuthStore } from '../store/auth';
import { useQueueStore } from '../store/queue';
import { SyncStatus } from '../components/SyncStatus';
import { Banner, Button, Card, Pill } from '../components/ui';
import { colors, productColor, productLabel, spacing } from '../theme';

interface PaymentsToday {
  payments: Array<{ id: string; amount: number; mode: string; customerName: string | null }>;
  totals: Record<string, number>;
}

export function DaySummaryScreen(): React.JSX.Element {
  const { coords } = useLocation(false);
  const { route } = useTodayRoute(coords);
  const logout = useAuthStore(state => state.logout);
  const user = useAuthStore(state => state.user);
  const queued = useQueueStore(state => state.items.length);

  const today = new Date().toISOString().slice(0, 10);

  const payments = useQuery({
    queryKey: ['payments', 'today', user?.id],
    queryFn: () =>
      request<PaymentsToday>('/payments', {
        query: { collectedById: user?.id, status: 'paid', from: today, to: today, limit: 200 },
      }),
    enabled: Boolean(user?.id),
    staleTime: 60_000,
  });

  const collected = payments.data?.totals.paid ?? 0;
  const { counters } = route;

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      <SyncStatus />

      <Card>
        <Text style={styles.sectionTitle}>Deliveries</Text>
        <View style={styles.statRow}>
          <Stat label="Delivered" value={counters.delivered} />
          <Stat label="Remaining" value={counters.remainingStops} />
          <Stat label="Stops" value={counters.stops} />
        </View>
        <View style={styles.statRow}>
          <Stat label="Bottles out" value={counters.bottlesDelivered} />
          <Stat label="Bottles left" value={counters.bottlesRemaining} />
        </View>
        {counters.bottlesRemaining > 0 ? (
          <View style={styles.pills}>
            {(['amla', 'beetroot'] as const)
              .filter(product => counters.remainingByProduct[product] > 0)
              .map(product => (
                <Pill
                  key={product}
                  label={`${productLabel(product)}: ${counters.remainingByProduct[product]}`}
                  color={productColor(product)}
                />
              ))}
          </View>
        ) : null}
      </Card>

      <Card style={styles.spaced}>
        <Text style={styles.sectionTitle}>Collected today</Text>
        <Text style={styles.money}>₹{collected.toLocaleString('en-IN')}</Text>
        <Text style={styles.meta}>
          {payments.data?.payments.length ?? 0} payment(s)
          {queued > 0 ? ` · ${queued} not synced yet` : ''}
        </Text>
        {payments.isError ? (
          <Banner tone="info" text="Collection total needs a connection to refresh." />
        ) : null}
      </Card>

      <Card style={styles.spaced}>
        <Text style={styles.sectionTitle}>Missed stops</Text>
        {route.pending.filter(s => s.status !== 'pending').length === 0 ? (
          <Text style={styles.meta}>Nothing skipped. Good round.</Text>
        ) : (
          route.pending
            .filter(s => s.status !== 'pending')
            .map(stop => (
              <Text key={stop.deliveryId} style={styles.missed}>
                • {stop.name} — {stop.status === 'skipped' ? 'skipped' : 'not home'}
              </Text>
            ))
        )}
      </Card>

      <Button
        label="Log out"
        variant="secondary"
        style={styles.logout}
        onPress={() => void logout()}
      />
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }): React.JSX.Element {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  statRow: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.sm },
  stat: { flex: 1 },
  statValue: { fontSize: 26, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  money: { fontSize: 32, fontWeight: '800', color: colors.primaryDark },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: spacing.xs },
  missed: { fontSize: 14, color: colors.text, marginTop: 4 },
  pills: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' },
  spaced: { marginTop: spacing.md },
  logout: { marginTop: spacing.xl },
});
