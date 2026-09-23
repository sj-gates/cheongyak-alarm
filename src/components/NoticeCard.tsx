import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from './ui';
import { typeLabel } from '@/lib/categories';
import { dDayLabel, diffDays, rangeLabel, todayStr } from '@/lib/dates';
import { STATUS_LABEL, nextEvent, noticeStatus } from '@/lib/filters';
import { formatUnits } from '@/lib/format';
import type { Notice } from '@/lib/types';
import { CATEGORY_COLOR, STATUS_COLOR, tint, useColors } from '@/theme';

export function NoticeCard({
  notice,
  favorite,
  isNew,
  onToggleFavorite,
}: {
  notice: Notice;
  favorite: boolean;
  isNew?: boolean;
  onToggleFavorite: () => void;
}) {
  const c = useColors();
  const today = todayStr();
  const status = noticeStatus(notice, today);
  const next = nextEvent(notice, today);
  const days = next ? diffDays(next.start, today) : null;
  const ongoing = next && next.start <= today;
  const urgent = days !== null && days <= 1;

  return (
    <Pressable
      onPress={() => router.push(`/notice/${notice.key}`)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      <View style={styles.topRow}>
        <View style={styles.badges}>
          <Badge label={typeLabel(notice)} color={CATEGORY_COLOR[notice.category]} />
          <Badge label={notice.region} color={c.sub} />
          {isNew ? <Badge label="NEW" color={c.accent} solid /> : null}
        </View>
        <Pressable
          onPress={onToggleFavorite}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={favorite ? '찜 해제' : '찜하기'}>
          <Ionicons name={favorite ? 'star' : 'star-outline'} size={22} color={favorite ? '#FFB020' : c.faint} />
        </Pressable>
      </View>

      <Text style={[styles.name, { color: c.text }]} numberOfLines={2}>
        {notice.name}
      </Text>
      <Text style={[styles.meta, { color: c.sub }]} numberOfLines={1}>
        {notice.address || notice.area}
        {notice.totalUnits ? ` · ${formatUnits(notice.totalUnits)}` : ''}
      </Text>

      <View style={[styles.bottom, { borderTopColor: c.border }]}>
        <Badge label={STATUS_LABEL[status]} color={STATUS_COLOR[status]} />
        <Text style={[styles.nextText, { color: c.text }]} numberOfLines={1}>
          {next
            ? `${next.label} ${rangeLabel(next.start, next.end)}`
            : `접수 ${rangeLabel(notice.receiptStart, notice.receiptEnd)}`}
        </Text>
        {next ? (
          <View
            style={[
              styles.dday,
              { backgroundColor: urgent ? c.accent : tint(c.primary, 0.12) },
            ]}>
            <Text style={[styles.ddayText, { color: urgent ? '#FFFFFF' : c.primary }]}>
              {ongoing ? '진행중' : dDayLabel(next.start, today)}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    marginBottom: 10,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badges: { flexDirection: 'row', gap: 6, flexShrink: 1, flexWrap: 'wrap' },
  name: { fontSize: 17, fontWeight: '800', marginTop: 10, letterSpacing: -0.3 },
  meta: { fontSize: 13, marginTop: 4 },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  nextText: { flex: 1, fontSize: 13, fontWeight: '600' },
  dday: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  ddayText: { fontSize: 12, fontWeight: '800' },
});
