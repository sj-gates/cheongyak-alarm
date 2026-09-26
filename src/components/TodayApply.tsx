import { router } from 'expo-router';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { APPLY_HOURS, activeReceipt, applyUrl } from '@/lib/applyhome';
import { shortDate } from '@/lib/dates';
import type { Notice } from '@/lib/types';
import { tint, useColors } from '@/theme';

/** 찜한 공고 중 오늘 청약 접수하는 것 → 청약홈으로 바로 가는 카드. 없으면 아무것도 안 그린다. */
export function TodayApply({ favorites }: { favorites: Notice[] }) {
  const c = useColors();
  const list = favorites
    .map((n) => ({ n, ev: activeReceipt(n) }))
    .filter((x): x is { n: Notice; ev: NonNullable<ReturnType<typeof activeReceipt>> } => !!x.ev);
  if (list.length === 0) return null;

  return (
    <View style={[styles.card, { backgroundColor: tint(c.accent, 0.1), borderColor: tint(c.accent, 0.35) }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: c.accent }]}>오늘 청약 접수 {list.length}건</Text>
        <Text style={[styles.hours, { color: c.sub }]}>청약홈 {APPLY_HOURS}</Text>
      </View>
      {list.map(({ n, ev }) => (
        <View key={n.key} style={styles.row}>
          <Pressable style={{ flex: 1 }} onPress={() => router.push(`/notice/${n.key}`)}>
            <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
              {n.name}
            </Text>
            <Text style={[styles.what, { color: c.sub }]}>
              {ev.label} 접수{ev.end ? ` · ${shortDate(ev.end)}까지` : ''}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => Linking.openURL(applyUrl(n.category, ev.kind))}
            accessibilityRole="link"
            style={({ pressed }) => [styles.btn, { backgroundColor: c.accent, opacity: pressed ? 0.8 : 1 }]}>
            <Text style={styles.btnText}>청약하러 가기</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 12 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontSize: 14, fontWeight: '800' },
  hours: { fontSize: 12, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10 },
  name: { fontSize: 15, fontWeight: '800' },
  what: { fontSize: 12, marginTop: 1 },
  btn: { paddingHorizontal: 12, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
});
