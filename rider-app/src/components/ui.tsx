/** Small shared pieces: buttons, cards, pills, banners. Built for thumbs. */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radius, spacing } from '../theme';

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        pressed && !isDisabled ? styles.buttonPressed : null,
        isDisabled ? styles.buttonDisabled : null,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' || variant === 'ghost' ? colors.primary : '#fff'} />
      ) : (
        <Text style={[styles.buttonText, styles[`buttonText_${variant}`]]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Pill({
  label,
  color = colors.primary,
  filled = true,
}: {
  label: string;
  color?: string;
  filled?: boolean;
}): React.JSX.Element {
  return (
    <View
      style={[
        styles.pill,
        filled ? { backgroundColor: color } : { borderColor: color, borderWidth: 1 },
      ]}>
      <Text style={[styles.pillText, { color: filled ? '#fff' : color }]}>{label}</Text>
    </View>
  );
}

export function Banner({
  text,
  tone = 'info',
  action,
}: {
  text: string;
  tone?: 'info' | 'warning' | 'danger' | 'success';
  action?: { label: string; onPress: () => void };
}): React.JSX.Element {
  const tones = {
    info: { bg: '#E8F0E4', fg: colors.primaryDark },
    warning: { bg: '#FBEFD9', fg: colors.warning },
    danger: { bg: '#FAE3E1', fg: colors.danger },
    success: { bg: '#E2F2E4', fg: colors.primaryDark },
  } as const;
  const palette = tones[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]}>
      <Text style={[styles.bannerText, { color: palette.fg }]}>{text}</Text>
      {action ? (
        <Pressable onPress={action.onPress} accessibilityRole="button">
          <Text style={[styles.bannerAction, { color: palette.fg }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Field({
  label,
  required = false,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }): React.JSX.Element {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
    </View>
  );
}

export const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  button_primary: { backgroundColor: colors.primary },
  button_secondary: { backgroundColor: '#EDF2EA', borderWidth: 1, borderColor: colors.primary },
  button_danger: { backgroundColor: colors.danger },
  button_ghost: { backgroundColor: 'transparent' },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { backgroundColor: colors.disabled, borderColor: colors.disabled },
  buttonText: { fontSize: 16, fontWeight: '700' },
  buttonText_primary: { color: '#fff' },
  buttonText_secondary: { color: colors.primaryDark },
  buttonText_danger: { color: '#fff' },
  buttonText_ghost: { color: colors.primaryDark },
  pill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 12, fontWeight: '700' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    gap: spacing.md,
  },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  bannerAction: { fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  field: { marginBottom: spacing.lg },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  required: { color: colors.danger },
  fieldHint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.xs },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 50,
    fontSize: 16,
    color: colors.text,
  },
  empty: { padding: spacing.xxl, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyBody: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
  },
});
