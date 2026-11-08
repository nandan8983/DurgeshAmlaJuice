/**
 * The stop card: who, where, what to hand over, and the three buttons that
 * close it out. Everything is queued locally, so each tap returns instantly.
 */
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLocation } from '../lib/location';
import { useTodayRoute } from '../hooks/useRoute';
import { callCustomer, navigateTo } from '../lib/intents';
import { formatDistance } from '../lib/geo';
import { Banner, Button, Card, EmptyState, Field, Pill, styles as ui } from '../components/ui';
import { colors, productColor, productLabel, spacing } from '../theme';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'NextStop'>;

export function NextStopScreen({ route: navRoute, navigation }: Props): React.JSX.Element {
  const { deliveryId } = navRoute.params;
  const { coords } = useLocation(true);
  const { route, mark } = useTodayRoute(coords);

  const stop = route.stops.find(s => s.deliveryId === deliveryId);
  const [qty, setQty] = useState<number | null>(null);
  const [remarks, setRemarks] = useState('');

  if (!stop) {
    return <EmptyState title="Stop not found" body="It may have been reassigned or already synced." />;
  }

  const effectiveQty = qty ?? stop.qty;

  const complete = (status: 'delivered' | 'skipped' | 'not_home'): void => {
    void mark
      .mutateAsync({
        deliveryId,
        status,
        qty: status === 'delivered' ? effectiveQty : undefined,
        remarks: remarks.trim() || undefined,
        at: coords,
      })
      .then(() => navigation.goBack());
  };

  const confirmSkip = (status: 'skipped' | 'not_home'): void => {
    Alert.alert(
      status === 'skipped' ? 'Skip this customer?' : 'Customer not home?',
      'They stay on your pending list and can be suggested again later today.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Confirm', onPress: () => complete(status) },
      ],
    );
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      {stop.status !== 'pending' ? (
        <Banner
          tone={stop.status === 'delivered' ? 'success' : 'warning'}
          text={
            stop.status === 'delivered'
              ? 'Already marked delivered. You can change it if you tapped the wrong row.'
              : `Marked ${stop.status === 'skipped' ? 'skipped' : 'not home'} — still on your list.`
          }
        />
      ) : null}

      {stop.renewalDue ? (
        <Banner
          tone="warning"
          text={
            stop.daysLeft === 0
              ? 'Plan ends today — ask about renewal and collect payment.'
              : `Plan ends in ${stop.daysLeft} day(s) — ask about renewal.`
          }
        />
      ) : null}

      <Card>
        <Text style={styles.name}>{stop.name}</Text>
        <Pressable onPress={() => void callCustomer(stop.mobile)} accessibilityRole="button">
          <Text style={styles.phone}>{stop.mobile} · Tap to call</Text>
        </Pressable>

        <View style={styles.pills}>
          <Pill
            label={`${effectiveQty} × ${productLabel(stop.product)}`}
            color={productColor(stop.product)}
          />
          <Pill label={formatDistance(stop.distanceMeters)} color={colors.primaryDark} filled={false} />
        </View>

        {stop.address ? <Text style={styles.detail}>{stop.address}</Text> : null}
        {stop.landmark ? <Text style={styles.detailMuted}>Landmark: {stop.landmark}</Text> : null}
        {stop.area ? <Text style={styles.detailMuted}>Area: {stop.area}</Text> : null}
        {stop.notes ? <Text style={styles.notes}>Note: {stop.notes}</Text> : null}

        <Button
          label="Navigate with Google Maps"
          variant="secondary"
          style={styles.spaced}
          onPress={() => void navigateTo(stop.latitude, stop.longitude, stop.name)}
        />
      </Card>

      <Card style={styles.spaced}>
        <Field label="Bottles today" hint="Change it only if the customer asked for a different number.">
          <View style={styles.qtyRow}>
            <Button
              label="−"
              variant="secondary"
              style={styles.qtyButton}
              onPress={() => setQty(Math.max(1, effectiveQty - 1))}
            />
            <Text style={styles.qtyValue}>{effectiveQty}</Text>
            <Button
              label="+"
              variant="secondary"
              style={styles.qtyButton}
              onPress={() => setQty(Math.min(50, effectiveQty + 1))}
            />
          </View>
        </Field>

        <Field label="Remarks (optional)">
          <TextInput
            style={[ui.input, styles.remarks]}
            value={remarks}
            onChangeText={setRemarks}
            placeholder="e.g. left with neighbour"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={500}
          />
        </Field>
      </Card>

      <View style={styles.actions}>
        <Button label="Delivered" onPress={() => complete('delivered')} loading={mark.isPending} />
        <View style={styles.actionRow}>
          <Button
            label="Not home"
            variant="secondary"
            style={styles.half}
            onPress={() => confirmSkip('not_home')}
          />
          <Button
            label="Skip"
            variant="secondary"
            style={styles.half}
            onPress={() => confirmSkip('skipped')}
          />
        </View>
        <Button
          label="Open customer"
          variant="ghost"
          onPress={() => navigation.navigate('CustomerDetail', { customerId: stop.customerId })}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  name: { fontSize: 24, fontWeight: '800', color: colors.text },
  phone: { fontSize: 15, color: colors.primaryDark, fontWeight: '700', marginTop: spacing.xs },
  pills: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
  detail: { fontSize: 15, color: colors.text, marginTop: spacing.md, lineHeight: 21 },
  detailMuted: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  notes: { fontSize: 14, color: colors.warning, marginTop: spacing.sm, fontWeight: '600' },
  spaced: { marginTop: spacing.md },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  qtyButton: { width: 64 },
  qtyValue: { fontSize: 24, fontWeight: '800', color: colors.text, minWidth: 40, textAlign: 'center' },
  remarks: { minHeight: 76, paddingTop: spacing.md, textAlignVertical: 'top' },
  actions: { gap: spacing.md, marginTop: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
});
