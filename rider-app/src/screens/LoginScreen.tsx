import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuthStore } from '../store/auth';
import { Banner, Button, Card, Field, styles as ui } from '../components/ui';
import { colors, spacing } from '../theme';

export function LoginScreen(): React.JSX.Element {
  const { login, loading, error, apiBaseUrl, setApiBaseUrl } = useAuthStore();
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [showServer, setShowServer] = useState(false);
  const [serverDraft, setServerDraft] = useState(apiBaseUrl);

  const submit = async (): Promise<void> => {
    try {
      await login(mobile, password);
    } catch {
      // The store holds the message; nothing to do here.
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Durgesh Amla Juice</Text>
        <Text style={styles.subtitle}>Rider app</Text>

        <Card style={styles.card}>
          {error ? <Banner tone="danger" text={error} /> : null}

          <Field label="Mobile number" required>
            <TextInput
              style={ui.input}
              value={mobile}
              onChangeText={setMobile}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
              placeholder="10-digit mobile"
              placeholderTextColor={colors.textMuted}
              maxLength={20}
            />
          </Field>

          <Field label="Password" required>
            <TextInput
              style={ui.input}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              placeholder="Your password"
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={() => void submit()}
              returnKeyType="go"
            />
          </Field>

          <Button
            label="Log in"
            onPress={() => void submit()}
            loading={loading}
            disabled={mobile.trim().length < 6 || password.length === 0}
          />
        </Card>

        {/* Field devices sometimes need pointing at a different host; keeping it
            here means no rebuild when the API moves. */}
        {showServer ? (
          <Card style={styles.card}>
            <Field label="API address" hint="Example: https://api.durgeshamlajuice.in">
              <TextInput
                style={ui.input}
                value={serverDraft}
                onChangeText={setServerDraft}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </Field>
            <Button
              label="Save address"
              variant="secondary"
              onPress={() => {
                void setApiBaseUrl(serverDraft);
                setShowServer(false);
              }}
            />
          </Card>
        ) : (
          <View style={styles.serverRow}>
            <Text style={styles.serverText} onPress={() => setShowServer(true)}>
              Server: {apiBaseUrl}
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { padding: spacing.lg, paddingTop: spacing.xxl * 2 },
  brand: { fontSize: 26, fontWeight: '800', color: colors.primaryDark, textAlign: 'center' },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  card: { marginBottom: spacing.lg, gap: 0 },
  serverRow: { alignItems: 'center', marginTop: spacing.sm },
  serverText: { fontSize: 12, color: colors.textMuted, textDecorationLine: 'underline' },
});
