/** Phone and map handoffs to the OS. */
import { Alert, Linking, Platform } from 'react-native';

/** Tap-to-call. ACTION_DIAL, so the rider still presses the call button. */
export async function callCustomer(mobile: string): Promise<void> {
  const number = mobile.replace(/[^\d+]/g, '');
  const url = `tel:${number}`;
  if (await Linking.canOpenURL(url)) {
    await Linking.openURL(url);
  } else {
    Alert.alert('Cannot place call', 'No dialler is available on this device.');
  }
}

/**
 * Phase 1 navigation: hand the coordinates to Google Maps turn-by-turn.
 * `google.navigation:` starts guidance directly; the geo: URL is the fallback
 * when Google Maps is not installed.
 */
export async function navigateTo(
  latitude: number | null,
  longitude: number | null,
  label?: string,
): Promise<void> {
  if (latitude === null || longitude === null) {
    Alert.alert(
      'No location pinned',
      'This customer has no GPS pin yet. Open the customer and set the pin while you are at their door.',
    );
    return;
  }

  const navigationUrl = `google.navigation:q=${latitude},${longitude}`;
  const fallbackUrl =
    Platform.OS === 'android'
      ? `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(label ?? 'Customer')})`
      : `http://maps.apple.com/?daddr=${latitude},${longitude}`;

  try {
    if (await Linking.canOpenURL(navigationUrl)) {
      await Linking.openURL(navigationUrl);
      return;
    }
  } catch {
    // fall through to the generic map URL
  }
  await Linking.openURL(fallbackUrl);
}
