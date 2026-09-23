import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { tint, useColors } from '@/theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>
      {children}
    </View>
  );
}

export function SectionTitle({ title, right }: { title: string; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.sectionTitle}>
      <Text style={[styles.sectionText, { color: c.sub }]}>{title}</Text>
      {right}
    </View>
  );
}

export function Badge({ label, color, solid }: { label: string; color: string; solid?: boolean }) {
  return (
    <View style={[styles.badge, { backgroundColor: solid ? color : tint(color, 0.13) }]}>
      <Text style={[styles.badgeText, { color: solid ? '#FFFFFF' : color }]}>{label}</Text>
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? c.primary : c.card,
          borderColor: selected ? c.primary : c.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      {icon ? (
        <Ionicons name={icon} size={14} color={selected ? c.onPrimary : c.sub} style={{ marginRight: 4 }} />
      ) : null}
      <Text style={[styles.chipText, { color: selected ? c.onPrimary : c.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const bg = variant === 'primary' ? c.primary : variant === 'secondary' ? c.primarySoft : 'transparent';
  const fg = variant === 'primary' ? c.onPrimary : c.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: c.border },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={17} color={fg} style={{ marginRight: 6 }} /> : null}
          <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function InfoRow({ label, value, onPress }: { label: string; value?: string; onPress?: () => void }) {
  const c = useColors();
  const content = (
    <View style={[styles.infoRow, { borderBottomColor: c.border }]}>
      <Text style={[styles.infoLabel, { color: c.sub }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: onPress ? c.primary : c.text }]} selectable>
        {value || '-'}
      </Text>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{content}</Pressable> : content;
}

export function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const c = useColors();
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={[styles.toggleLabel, { color: c.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: c.faint }]}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: c.primary, false: c.border }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  children,
}: {
  icon: IconName;
  title: string;
  body?: string;
  children?: ReactNode;
}) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: c.primarySoft }]}>
        <Ionicons name={icon} size={30} color={c.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: c.text }]}>{title}</Text>
      {body ? <Text style={[styles.emptyBody, { color: c.sub }]}>{body}</Text> : null}
      {children ? <View style={{ marginTop: 16, gap: 8, alignSelf: 'stretch' }}>{children}</View> : null}
    </View>
  );
}

export function Banner({ icon, text, color }: { icon: IconName; text: string; color: string }) {
  return (
    <View style={[styles.banner, { backgroundColor: tint(color, 0.12) }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.bannerText, { color }]}>{text}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.2 },
  badge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    minHeight: 46,
    borderRadius: 12,
  },
  buttonText: { fontSize: 15, fontWeight: '700' },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  infoLabel: { width: 86, fontSize: 14 },
  infoValue: { flex: 1, fontSize: 14, fontWeight: '500', textAlign: 'right' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  toggleLabel: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: 14, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
});
