import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color, radius, space } from '@/theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      {scroll ? <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={s.content}>{children}</View>}
    </SafeAreaView>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={s.h1}>{children}</Text>;
}
export function Muted({ children }: { children: ReactNode }) {
  return <Text style={s.muted}>{children}</Text>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

export function Button({ label, onPress, busy, disabled, variant = 'primary', testID }: {
  label: string; onPress: () => void; busy?: boolean; disabled?: boolean; variant?: 'primary' | 'secondary' | 'danger'; testID?: string;
}) {
  const off = disabled || busy;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!off, busy: !!busy }}
      onPress={onPress} disabled={off}
      style={({ pressed }) => [s.button, variant === 'secondary' && s.buttonSecondary, variant === 'danger' && s.buttonDanger, (pressed || off) && { opacity: 0.7 }]}>
      {busy ? <ActivityIndicator color={variant === 'secondary' ? color.ink : '#fff'} /> : (
        <Text style={[s.buttonText, variant === 'secondary' && { color: color.ink }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string | null }) {
  return (
    <View style={{ gap: space(1.5) }}>
      <Text style={s.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={color.muted} {...input}
        style={[s.input, !!error && { borderColor: color.danger }, input.multiline && { minHeight: 120, textAlignVertical: 'top' }]} />
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  const bg = { info: color['primary-soft'], success: color['success-soft'], warning: color['warning-soft'], danger: color['danger-soft'] }[tone];
  const fg = { info: color.ink, success: color.success, warning: color.warning, danger: color.danger }[tone];
  return <View style={[s.notice, { backgroundColor: bg }]}><Text style={{ color: fg, fontSize: 14 }}>{children}</Text></View>;
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={s.checkRow}>
      <View style={[s.box, checked && { backgroundColor: color.primary, borderColor: color.primary }]}>{checked && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}</View>
      <View style={{ flex: 1 }}>{typeof label === 'string' ? <Text style={{ color: color.ink, fontSize: 14 }}>{label}</Text> : label}</View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: { padding: space(5), gap: space(4), flexGrow: 1 },
  h1: { fontSize: 24, fontWeight: '600', color: color.ink },
  muted: { fontSize: 14, color: color.muted, lineHeight: 20 },
  card: { backgroundColor: color.surface, borderColor: color.line, borderWidth: 1, borderRadius: radius.lg, padding: space(5), gap: space(3) },
  button: { height: 48, borderRadius: radius.md, backgroundColor: color.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(5) },
  buttonSecondary: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line },
  buttonDanger: { backgroundColor: color.danger },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  label: { fontSize: 14, fontWeight: '500', color: color.ink },
  input: { borderWidth: 1, borderColor: color.line, borderRadius: radius.md, backgroundColor: color.surface, paddingHorizontal: space(3), paddingVertical: space(3), fontSize: 16, color: color.ink },
  error: { color: color.danger, fontSize: 12, fontWeight: '500' },
  hint: { color: color.muted, fontSize: 12 },
  notice: { borderRadius: radius.md, padding: space(3) },
  checkRow: { flexDirection: 'row', gap: space(2), alignItems: 'flex-start' },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: color.line, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
});
