/**
 * Add Customer — filled in at the customer's door.
 *
 * The phone's current fix becomes the home pin, which the rider can drag on the
 * map before saving. Only four fields are required; the admin completes the rest
 * later. Saving works offline: the customer is queued and created on sync.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useLocation } from '../lib/location';
import { createCustomer, createSubscription, fetchPlans } from '../api/endpoints';
import { ApiError } from '../api/client';
import { useQueueStore } from '../store/queue';
import { Banner, Button, Card, Field, Pill, styles as ui } from '../components/ui';
import { colors, productColor, spacing } from '../theme';
import type { RootStackParamList } from '../navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'AddCustomer'>;

const SHIRPUR: Region = {
  latitude: 21.3486,
  longitude: 74.8805,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

export function AddCustomerScreen({ navigation }: Props): React.JSX.Element {
  const { coords, permission, request } = useLocation(false);
  const queryClient = useQueryClient();
  const enqueue = useQueueStore(state => state.enqueue);
  const online = useQueueStore(state => state.online);

  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [bottles, setBottles] = useState('1');
  const [active, setActive] = useState(true);
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [notes, setNotes] = useState('');
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);

  // Drop the pin where the rider is standing, once a fix arrives.
  useEffect(() => {
    if (coords && !pin) setPin(coords);
  }, [coords, pin]);

  const plans = useQuery({ queryKey: ['plans'], queryFn: fetchPlans, staleTime: 60 * 60 * 1000 });

  const bottlesPerDay = Math.max(1, Math.min(50, Number.parseInt(bottles, 10) || 1));
  const canSave = name.trim().length >= 2 && mobile.replace(/\D/g, '').length >= 10;

  const region: Region = useMemo(
    () => (pin ? { ...SHIRPUR, latitude: pin.latitude, longitude: pin.longitude } : SHIRPUR),
    [pin],
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: name.trim(),
        mobile: mobile.trim(),
        bottlesPerDay,
        status: active ? ('active' as const) : ('inactive' as const),
        area: area.trim() || undefined,
        address: address.trim() || undefined,
        landmark: landmark.trim() || undefined,
        notes: notes.trim() || undefined,
        latitude: pin?.latitude,
        longitude: pin?.longitude,
      };

      try {
        const { customer } = await createCustomer(payload);
        // A plan can only be started once the customer has a real id, so this
        // half is skipped when the save had to be queued.
        if (planId) {
          await createSubscription({
            customerId: customer.id,
            planId,
            bottlesPerDay,
            payment: { mode: 'cash', status: 'pending' },
          });
        }
        return { queued: false as const };
      } catch (err) {
        if (err instanceof ApiError && err.offline) {
          await enqueue({ kind: 'customer', payload });
          return { queued: true as const };
        }
        throw err;
      }
    },
    onSuccess: result => {
      void queryClient.invalidateQueries({ queryKey: ['customers'] });
      void queryClient.invalidateQueries({ queryKey: ['route', 'today'] });
      Alert.alert(
        result.queued ? 'Saved on this phone' : 'Customer added',
        result.queued
          ? 'No signal right now. The customer will be created automatically when you are back online. Start their plan then.'
          : planId
            ? 'Customer added and plan started. Payment is marked pending until you collect it.'
            : 'Customer added. Start their plan from the customer screen.',
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    },
    onError: err => {
      Alert.alert('Could not save', (err as Error).message);
    },
  });

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.container}>
      {permission !== 'granted' ? (
        <Banner
          tone="warning"
          text="Allow location to pin this customer's home."
          action={{ label: 'Allow', onPress: () => void request() }}
        />
      ) : null}
      {!online ? (
        <Banner tone="info" text="Offline — the customer will be saved on this phone and synced later." />
      ) : null}

      <Card>
        <Text style={styles.sectionTitle}>Required</Text>

        <Field label="Customer name" required>
          <TextInput
            style={ui.input}
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            placeholderTextColor={colors.textMuted}
            maxLength={120}
          />
        </Field>

        <Field label="Mobile number" required>
          <TextInput
            style={ui.input}
            value={mobile}
            onChangeText={setMobile}
            keyboardType="phone-pad"
            placeholder="10-digit mobile"
            placeholderTextColor={colors.textMuted}
            maxLength={20}
          />
        </Field>

        <Field label="Bottles per day" required>
          <TextInput
            style={ui.input}
            value={bottles}
            onChangeText={setBottles}
            keyboardType="number-pad"
            maxLength={2}
          />
        </Field>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Subscription active</Text>
          <Switch
            value={active}
            onValueChange={setActive}
            trackColor={{ true: colors.primary, false: colors.disabled }}
          />
        </View>
      </Card>

      <Card style={styles.spaced}>
        <Text style={styles.sectionTitle}>Home location</Text>
        <Text style={styles.hint}>
          Drag the pin to the exact door. This is what the Navigate button uses.
        </Text>

        <View style={styles.mapWrapper}>
          <MapView
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            region={region}
            onPress={event => setPin(event.nativeEvent.coordinate)}>
            {pin ? (
              <Marker
                coordinate={pin}
                draggable
                onDragEnd={event => setPin(event.nativeEvent.coordinate)}
                title={name || 'New customer'}
              />
            ) : null}
          </MapView>
        </View>

        <View style={styles.mapActions}>
          <Button
            label="Use my location"
            variant="secondary"
            style={styles.flexButton}
            onPress={() => {
              if (coords) setPin(coords);
              else void request();
            }}
          />
        </View>
        <Text style={styles.coordText}>
          {pin
            ? `Pinned at ${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}`
            : 'No pin yet — the admin can add it later.'}
        </Text>
      </Card>

      <Card style={styles.spaced}>
        <Text style={styles.sectionTitle}>Optional</Text>

        <Field label="Area">
          <TextInput style={ui.input} value={area} onChangeText={setArea} maxLength={120} />
        </Field>
        <Field label="Address">
          <TextInput
            style={[ui.input, styles.multiline]}
            value={address}
            onChangeText={setAddress}
            multiline
            maxLength={400}
          />
        </Field>
        <Field label="Landmark">
          <TextInput style={ui.input} value={landmark} onChangeText={setLandmark} maxLength={200} />
        </Field>
        <Field label="Notes">
          <TextInput
            style={[ui.input, styles.multiline]}
            value={notes}
            onChangeText={setNotes}
            multiline
            maxLength={1000}
          />
        </Field>
      </Card>

      <Card style={styles.spaced}>
        <Text style={styles.sectionTitle}>Start a plan (optional)</Text>
        <Text style={styles.hint}>
          Needs a connection. Skip it now and start the plan from the customer screen later.
        </Text>
        <View style={styles.planList}>
          {(plans.data?.plans ?? []).map(plan => {
            const selected = planId === plan.id;
            return (
              <View key={plan.id} style={styles.planRow}>
                <Button
                  label={`${plan.name} · ₹${plan.price * bottlesPerDay}`}
                  variant={selected ? 'primary' : 'secondary'}
                  style={styles.planButton}
                  onPress={() => setPlanId(selected ? null : plan.id)}
                />
                <Pill label={plan.product} color={productColor(plan.product === 'beetroot' ? 'beetroot' : 'amla')} />
              </View>
            );
          })}
          {plans.isError ? <Text style={styles.hint}>Plans unavailable offline.</Text> : null}
        </View>
      </Card>

      <Button
        label="Save customer"
        style={styles.spaced}
        disabled={!canSave}
        loading={save.isPending}
        onPress={() => save.mutate()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingBottom: spacing.xxl * 2, gap: spacing.md },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primaryDark,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.md,
  },
  hint: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 18 },
  spaced: { marginTop: spacing.md },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  mapWrapper: { height: 260, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.border },
  map: { flex: 1 },
  mapActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  flexButton: { flex: 1 },
  coordText: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
  multiline: { minHeight: 76, paddingTop: spacing.md, textAlignVertical: 'top' },
  planList: { gap: spacing.sm },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  planButton: { flex: 1 },
});
