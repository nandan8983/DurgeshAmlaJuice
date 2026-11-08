/**
 * One customer: edit the basics, pause or resume the plan, record a payment.
 *
 * Payments are queued when offline — the rider has the cash in hand either way,
 * so refusing the entry would be worse than syncing it late.
 */
import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  createSubscription,
  fetchCustomer,
  fetchPlans,
  pauseSubscription,
  recordPayment,
  resumeSubscription,
  updateCustomer,
} from '../api/endpoints';
import { ApiError } from '../api/client';
import { useQueueStore } from '../store/queue';
import { useLocation } from '../lib/location';
import { callCustomer, navigateTo } from '../lib/intents';
import { LocationMapPicker } from '../components/LocationMapPicker';
import { Banner, Button, Card, EmptyState, Field, Pill, styles as ui } from '../components/ui';
import { colors, spacing } from '../theme';
import type { PaymentMode } from '../api/types';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerDetail'>;

const SHIRPUR = {
  latitude: 21.3486,
  longitude: 74.8805,
};

export function CustomerDetailScreen({ route }: Props): React.JSX.Element {
  const { customerId } = route.params;
  const queryClient = useQueryClient();
  const enqueue = useQueueStore(state => state.enqueue);
  const { coords, request: requestLocation } = useLocation(false);

  const query = useQuery({
    queryKey: ['customer', customerId],
    queryFn: () => fetchCustomer(customerId),
  });

  const plans = useQuery({ queryKey: ['plans'], queryFn: fetchPlans, staleTime: 60 * 60 * 1000 });

  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<PaymentMode>('cash');
  const [bottles, setBottles] = useState<string | null>(null);
  const [pinDraft, setPinDraft] = useState<{ latitude: number; longitude: number } | null>(null);
  const [mapInteracting, setMapInteracting] = useState(false);

  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
    void queryClient.invalidateQueries({ queryKey: ['customers'] });
    void queryClient.invalidateQueries({ queryKey: ['route', 'today'] });
  };

  const pause = useMutation({
    mutationFn: (subscriptionId: string) => pauseSubscription(subscriptionId, 'Paused by rider'),
    onSuccess: () => {
      invalidate();
      Alert.alert('Paused', 'The customer is off your route until you resume them.');
    },
    onError: err => Alert.alert('Could not pause', (err as Error).message),
  });

  const resume = useMutation({
    mutationFn: (subscriptionId: string) => resumeSubscription(subscriptionId),
    onSuccess: () => {
      invalidate();
      Alert.alert('Resumed', 'The paused days have been added to the end of their plan.');
    },
    onError: err => Alert.alert('Could not resume', (err as Error).message),
  });

  const pay = useMutation({
    mutationFn: async () => {
      const value = Number.parseFloat(amount);
      if (!Number.isFinite(value) || value <= 0) throw new Error('Enter the amount collected.');
      const payload = {
        customerId,
        subscriptionId: query.data?.customer.subscription?.id,
        amount: value,
        mode,
        paidAt: new Date().toISOString(),
      };
      try {
        await recordPayment({ ...payload, status: 'paid' });
        return { queued: false as const };
      } catch (err) {
        if (err instanceof ApiError && err.offline) {
          await enqueue({ kind: 'payment', payload });
          return { queued: true as const };
        }
        throw err;
      }
    },
    onSuccess: result => {
      setAmount('');
      invalidate();
      Alert.alert(
        result.queued ? 'Saved on this phone' : 'Payment recorded',
        result.queued ? 'It will sync when you are back online.' : 'Thank you.',
      );
    },
    onError: err => Alert.alert('Could not record payment', (err as Error).message),
  });

  const saveBottles = useMutation({
    mutationFn: (value: number) => updateCustomer(customerId, { bottlesPerDay: value }),
    onSuccess: () => {
      setBottles(null);
      invalidate();
    },
    onError: err => Alert.alert('Could not save', (err as Error).message),
  });

  const savePin = useMutation({
    mutationFn: (nextPin: { latitude: number; longitude: number }) =>
      updateCustomer(customerId, {
        latitude: nextPin.latitude,
        longitude: nextPin.longitude,
      }),
    onSuccess: () => {
      setPinDraft(null);
      invalidate();
      Alert.alert('Location saved', 'The customer home pin has been updated.');
    },
    onError: err => Alert.alert('Could not save location', (err as Error).message),
  });

  const startPlan = useMutation({
    mutationFn: (planId: string) => createSubscription({ customerId, planId }),
    onSuccess: () => {
      invalidate();
      Alert.alert('Plan started', 'Payment is pending until you collect it.');
    },
    onError: err => Alert.alert('Could not start the plan', (err as Error).message),
  });

  if (query.isLoading) return <EmptyState title="Loading…" />;
  if (query.isError || !query.data) {
    return <EmptyState title="Could not load this customer" body={(query.error as Error)?.message} />;
  }

  const { customer, pendingAmount } = query.data;
  const subscription = customer.subscription;
  const existingPin =
    customer.latitude !== null && customer.longitude !== null
      ? { latitude: customer.latitude, longitude: customer.longitude }
      : null;
  const activePin = pinDraft ?? existingPin;

  return (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.container}
        scrollEnabled={!mapInteracting}
        keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.name}>{customer.name}</Text>
          <Text style={styles.phone} onPress={() => void callCustomer(customer.mobile)}>
            {customer.mobile} · Tap to call
          </Text>
          <Text style={styles.meta}>
            {[customer.area, customer.address, customer.landmark].filter(Boolean).join(' · ') ||
              'No address on file'}
          </Text>

          <View style={styles.pills}>
            <Pill label={`${customer.bottlesPerDay} bottle(s)/day`} color={colors.primary} />
            {customer.status === 'inactive' ? <Pill label="Inactive" color={colors.danger} /> : null}
            {pendingAmount > 0 ? <Pill label={`₹${pendingAmount} pending`} color={colors.warning} /> : null}
          </View>

          <Button
            label="Navigate"
            variant="secondary"
            style={styles.spaced}
            onPress={() => void navigateTo(customer.latitude, customer.longitude, customer.name)}
          />
        </Card>

        <Card style={styles.spaced}>
          <Text style={styles.sectionTitle}>Plan</Text>
          {subscription ? (
            <>
              <Text style={styles.planLine}>
                {subscription.planName} · {subscription.product}
              </Text>
              <Text style={styles.meta}>
                {subscription.startDate} → {subscription.endDate ?? '—'}
                {subscription.daysLeft !== null ? ` · ${subscription.daysLeft} day(s) left` : ''}
              </Text>
              {subscription.status === 'paused' ? (
                <Banner tone="warning" text="Paused — not on the daily route." />
              ) : null}
              {customer.renewalDue ? (
                <Banner tone="warning" text="Renewal due — ask the customer and collect payment." />
              ) : null}

              <View style={styles.actionRow}>
                {subscription.status === 'paused' ? (
                  <Button
                    label="Resume"
                    style={styles.flexButton}
                    loading={resume.isPending}
                    onPress={() => resume.mutate(subscription.id)}
                  />
                ) : (
                  <Button
                    label="Pause"
                    variant="secondary"
                    style={styles.flexButton}
                    loading={pause.isPending}
                    onPress={() =>
                      Alert.alert('Pause this subscription?', 'The days paused are added to the end of the plan.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Pause', onPress: () => pause.mutate(subscription.id) },
                      ])
                    }
                  />
                )}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.meta}>No active plan. Start one:</Text>
              <View style={styles.planList}>
                {(plans.data?.plans ?? []).map(plan => (
                  <Button
                    key={plan.id}
                    label={`${plan.name} · ₹${plan.price * customer.bottlesPerDay}`}
                    variant="secondary"
                    loading={startPlan.isPending}
                    onPress={() => startPlan.mutate(plan.id)}
                  />
                ))}
              </View>
            </>
          )}
        </Card>

        <Card style={styles.spaced}>
          <Text style={styles.sectionTitle}>Record a payment</Text>
          <Field label="Amount collected (₹)">
            <TextInput
              style={ui.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder={subscription?.amount ? String(subscription.amount) : '0'}
              placeholderTextColor={colors.textMuted}
            />
          </Field>
          <View style={styles.modeRow}>
            {(['cash', 'upi', 'other'] as const).map(option => (
              <Button
                key={option}
                label={option === 'upi' ? 'UPI' : option[0]!.toUpperCase() + option.slice(1)}
                variant={mode === option ? 'primary' : 'secondary'}
                style={styles.flexButton}
                onPress={() => setMode(option)}
              />
            ))}
          </View>
          <Button
            label="Save payment"
            style={styles.spaced}
            loading={pay.isPending}
            onPress={() => pay.mutate()}
          />
        </Card>

        <Card style={styles.spaced}>
          <Text style={styles.sectionTitle}>Home location</Text>
          <View style={styles.mapWrapper}>
            <LocationMapPicker
              pin={activePin}
              defaultCenter={activePin ?? coords ?? SHIRPUR}
              onChange={setPinDraft}
              onInteractionChange={setMapInteracting}
            />
          </View>
          <View style={styles.actionRow}>
            <Button
              label="Use my location"
              variant="secondary"
              style={styles.flexButton}
              onPress={() => {
                if (coords) setPinDraft(coords);
                else void requestLocation();
              }}
            />
            <Button
              label="Save pin"
              style={styles.flexButton}
              disabled={!pinDraft}
              loading={savePin.isPending}
              onPress={() => {
                if (pinDraft) savePin.mutate(pinDraft);
              }}
            />
          </View>
        </Card>

        <Card style={styles.spaced}>
          <Text style={styles.sectionTitle}>Edit</Text>
          <Field label="Bottles per day">
            <TextInput
              style={ui.input}
              value={bottles ?? String(customer.bottlesPerDay)}
              onChangeText={setBottles}
              keyboardType="number-pad"
              maxLength={2}
            />
          </Field>
          <Button
            label="Save change"
            variant="secondary"
            disabled={bottles === null || Number.parseInt(bottles, 10) === customer.bottlesPerDay}
            loading={saveBottles.isPending}
            onPress={() => {
              const value = Math.max(1, Math.min(50, Number.parseInt(bottles ?? '1', 10) || 1));
              saveBottles.mutate(value);
            }}
          />
        </Card>
      </ScrollView>
      );
}

      const styles = StyleSheet.create({
        flex: {flex: 1, backgroundColor: colors.bg },
      container: {padding: spacing.lg, paddingBottom: spacing.xxl * 2 },
      name: {fontSize: 22, fontWeight: '800', color: colors.text },
      phone: {fontSize: 15, fontWeight: '700', color: colors.primaryDark, marginTop: spacing.xs },
      meta: {fontSize: 13, color: colors.textMuted, marginTop: spacing.xs, lineHeight: 19 },
      pills: {flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
      spaced: {marginTop: spacing.md },
      sectionTitle: {
        fontSize: 12,
      fontWeight: '800',
      color: colors.primaryDark,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginBottom: spacing.sm,
  },
      planLine: {fontSize: 16, fontWeight: '700', color: colors.text },
      actionRow: {flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
      flexButton: {flex: 1 },
      planList: {gap: spacing.sm, marginTop: spacing.md },
      modeRow: {flexDirection: 'row', gap: spacing.sm },
      mapWrapper: {height: 220, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.border },
});
