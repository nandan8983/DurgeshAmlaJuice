/**
 * Today's Route — the screen a rider lives on.
 *
 * Next stop on top, bottle counter under it, and the rest of the round sorted
 * by distance from the live GPS fix.
 */
import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLocation } from '../lib/location';
import { useTodayRoute, type RouteStopView } from '../hooks/useRoute';
import { SyncStatus } from '../components/SyncStatus';
import { StopCard } from '../components/StopCard';
import { Banner, Button, Card, EmptyState, Pill } from '../components/ui';
import { colors, productColor, productLabel, spacing } from '../theme';
import { formatDistance } from '../lib/geo';
import { navigateTo } from '../lib/intents';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Route'>;

export function RouteScreen({ navigation }: Props): React.JSX.Element {
  const { coords, permission, error: locationError, request } = useLocation(true);
  const { route, isLoading, isRefetching, error, refetch, pinToFront } = useTodayRoute(coords);

  const next = route.nextStop;

  return (
    <View style={styles.flex}>
      <FlatList
        data={route.pending.slice(1)}
        keyExtractor={item => item.deliveryId}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <SyncStatus />

            {permission !== 'granted' ? (
              <Banner
                tone="warning"
                text={locationError ?? 'Allow location so stops can be sorted by distance.'}
                action={{ label: 'Allow', onPress: () => void request() }}
              />
            ) : null}

            {route.fromCache ? (
              <Banner
                tone="info"
                text={`Showing the route saved on this phone${
                  route.cachedAt ? ` at ${new Date(route.cachedAt).toLocaleTimeString()}` : ''
                }.`}
              />
            ) : null}

            {error && !route.fromCache ? <Banner tone="danger" text={error.message} /> : null}

            <BottleCounter route={route} />

            {next ? (
              <NextStopCard
                stop={next}
                onOpen={() => navigation.navigate('NextStop', { deliveryId: next.deliveryId })}
              />
            ) : null}

            {route.pending.length > 1 ? <Text style={styles.sectionTitle}>Remaining stops</Text> : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <StopCard
            stop={item}
            index={index + 1}
            onPress={() => navigation.navigate('NextStop', { deliveryId: item.deliveryId })}
            onLongPress={() => pinToFront(item.deliveryId)}
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <EmptyState title="Loading your route…" />
          ) : route.counters.stops === 0 ? (
            <EmptyState
              title="No deliveries today"
              body="Nothing has been generated for today yet. Pull down to refresh, or add a customer to start a new subscription."
            />
          ) : route.pending.length === 0 ? (
            <EmptyState
              title="Round complete 🎉"
              body={`${route.counters.delivered} stops, ${route.counters.bottlesDelivered} bottles delivered.`}
            />
          ) : (
            <EmptyState title="That was the last stop" />
          )
        }
        ListFooterComponent={
          route.done.length > 0 ? (
            <View style={styles.doneSection}>
              <Text style={styles.sectionTitle}>Done ({route.done.length})</Text>
              {route.done.map(stop => (
                <StopCard
                  key={stop.deliveryId}
                  stop={stop}
                  onPress={() => navigation.navigate('NextStop', { deliveryId: stop.deliveryId })}
                />
              ))}
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

function BottleCounter({ route }: { route: ReturnType<typeof useTodayRoute>['route'] }): React.JSX.Element {
  const { bottlesRemaining, bottlesTotal, remainingByProduct, delivered, stops } = route.counters;
  const bothProducts = remainingByProduct.amla > 0 && remainingByProduct.beetroot > 0;

  return (
    <Card style={styles.counterCard}>
      <View style={styles.counterTop}>
        <View>
          <Text style={styles.counterLabel}>Bottles left</Text>
          <Text style={styles.counterValue}>
            {bottlesRemaining} <Text style={styles.counterTotal}>/ {bottlesTotal}</Text>
          </Text>
        </View>
        <View style={styles.counterRight}>
          <Text style={styles.counterLabel}>Stops done</Text>
          <Text style={styles.counterValueSmall}>
            {delivered} / {stops}
          </Text>
        </View>
      </View>

      {bothProducts || bottlesRemaining > 0 ? (
        <View style={styles.counterPills}>
          {(['amla', 'beetroot'] as const)
            .filter(product => remainingByProduct[product] > 0)
            .map(product => (
              <Pill
                key={product}
                label={`${productLabel(product)}: ${remainingByProduct[product]}`}
                color={productColor(product)}
              />
            ))}
        </View>
      ) : null}
    </Card>
  );
}

function NextStopCard({
  stop,
  onOpen,
}: {
  stop: RouteStopView;
  onOpen: () => void;
}): React.JSX.Element {
  return (
    <Card style={styles.nextCard}>
      <Text style={styles.nextLabel}>Next stop</Text>
      <Text style={styles.nextName}>{stop.name}</Text>
      <Text style={styles.nextMeta}>
        {formatDistance(stop.distanceMeters)} · {stop.qty} × {productLabel(stop.product)}
        {stop.area ? ` · ${stop.area}` : ''}
      </Text>
      {stop.landmark ? <Text style={styles.nextLandmark}>{stop.landmark}</Text> : null}

      <View style={styles.nextActions}>
        <Button
          label="Navigate"
          variant="secondary"
          style={styles.half}
          onPress={() => void navigateTo(stop.latitude, stop.longitude, stop.name)}
        />
        <Button label="Open stop" style={styles.half} onPress={onOpen} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { gap: spacing.md, marginBottom: spacing.md },
  counterCard: { paddingVertical: spacing.md },
  counterTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  counterRight: { alignItems: 'flex-end' },
  counterLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  counterValue: { fontSize: 34, fontWeight: '800', color: colors.primaryDark },
  counterValueSmall: { fontSize: 20, fontWeight: '800', color: colors.text },
  counterTotal: { fontSize: 18, fontWeight: '600', color: colors.textMuted },
  counterPills: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  nextCard: { borderColor: colors.primary, borderWidth: 2 },
  nextLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  nextName: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: 2 },
  nextMeta: { fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  nextLandmark: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  nextActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  half: { flex: 1 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  doneSection: { marginTop: spacing.lg },
});
