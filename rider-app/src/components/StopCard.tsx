/** One stop in the route list. Tap to open, long-press to move to the front. */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, productColor, productLabel, radius, spacing } from '../theme';
import { formatDistance } from '../lib/geo';
import type { RouteStopView } from '../hooks/useRoute';
import { Pill } from './ui';

const statusLabel: Record<RouteStopView['status'], string> = {
  pending: 'Pending',
  delivered: 'Delivered',
  skipped: 'Skipped',
  not_home: 'Not home',
};

const statusColor: Record<RouteStopView['status'], string> = {
  pending: colors.pending,
  delivered: colors.success,
  skipped: colors.warning,
  not_home: colors.warning,
};

export function StopCard({
  stop,
  index,
  onPress,
  onLongPress,
}: {
  stop: RouteStopView;
  index?: number;
  onPress: () => void;
  onLongPress?: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${stop.name}, ${formatDistance(stop.distanceMeters)} away, ${stop.qty} ${productLabel(stop.product)}`}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}>
      <View style={[styles.productStripe, { backgroundColor: productColor(stop.product) }]} />

      <View style={styles.main}>
        <View style={styles.titleRow}>
          <Text style={styles.name} numberOfLines={1}>
            {index !== undefined ? `${index + 1}. ` : ''}
            {stop.name}
          </Text>
          <Text style={styles.distance}>{formatDistance(stop.distanceMeters)}</Text>
        </View>

        <Text style={styles.meta} numberOfLines={1}>
          {[stop.area, stop.landmark ?? stop.address].filter(Boolean).join(' · ') || 'No address on file'}
        </Text>

        <View style={styles.pills}>
          <Pill
            label={`${stop.qty} × ${productLabel(stop.product)}`}
            color={productColor(stop.product)}
          />
          <Pill label={statusLabel[stop.status]} color={statusColor[stop.status]} filled={false} />
          {stop.pinnedFirst ? <Pill label="Next" color={colors.primaryDark} /> : null}
          {stop.renewalDue ? (
            <Pill
              label={stop.daysLeft === 0 ? 'Plan ends today' : `${stop.daysLeft}d left`}
              color={colors.warning}
            />
          ) : null}
          {stop.unsynced ? <Pill label="Not synced" color={colors.textMuted} filled={false} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  pressed: { opacity: 0.9 },
  productStripe: { width: 6 },
  main: { flex: 1, padding: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text },
  distance: { fontSize: 14, fontWeight: '700', color: colors.primaryDark, marginLeft: spacing.sm },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
});
