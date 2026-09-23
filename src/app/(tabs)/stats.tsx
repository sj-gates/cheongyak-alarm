import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, EmptyState, SectionTitle } from '@/components/ui';
import { CATEGORY_ORDER, typeLabel } from '@/lib/categories';
import { addDays, dateTimeLabel, todayStr } from '@/lib/dates';
import { noticeStatus } from '@/lib/filters';
import { clearAlertLog, loadAlertLog } from '@/lib/storage';
import { useApp } from '@/lib/store';
import type { AlertLogEntry } from '@/lib/types';
import { CATEGORY_COLOR, useColors } from '@/theme';

function Bars({ rows, color }: { rows: { label: string; value: number; color?: string }[]; color: string }) {
  const c = useColors();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: 10 }}>
      {rows.map((r) => (
        <View key={r.label} style={styles.barRow}>
          <Text style={[styles.barLabel, { color: c.text }]} numberOfLines={1}>
            {r.label}
          </Text>
          <View style={[styles.barTrack, { backgroundColor: c.cardAlt }]}>
            <View
              style={[
                styles.barFill,
                { width: `${(r.value / max) * 100}%`, backgroundColor: r.color ?? color },
              ]}
            />
          </View>
          <Text style={[styles.barValue, { color: c.sub }]}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

export default function StatsScreen() {
  const c = useColors();
  const app = useApp();
  const today = todayStr();
  const [log, setLog] = useState<AlertLogEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadAlertLog().then(setLog);
    }, [])
  );

  const pool = useMemo(
    () => app.notices.filter((n) => app.demo || app.settings.kinds.includes(n.kind)),
    [app.notices, app.demo, app.settings.kinds]
  );

  const summary = useMemo(() => {
    const weekEnd = addDays(today, 7);
    let open = 0;
    let thisWeek = 0;
    for (const n of pool) {
      if (noticeStatus(n, today) === 'open') open++;
      if (n.receiptStart && n.receiptStart >= today && n.receiptStart <= weekEnd) thisWeek++;
    }
    return { total: pool.length, open, thisWeek };
  }, [pool, today]);

  const regionCounts = new Map<string, number>();
  for (const n of pool) regionCounts.set(n.region, (regionCounts.get(n.region) ?? 0) + 1);
  const byRegion = [...regionCounts.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([label, value]) => ({
      label,
      value,
      color: app.settings.regions.includes(label) ? c.primary : c.faint,
    }));

  const byType = useMemo(() => {
    const rows: { label: string; value: number; color: string }[] = [];
    for (const cat of CATEGORY_ORDER) {
      const list = pool.filter((n) => n.category === cat);
      if (list.length === 0) continue;
      const sub = new Map<string, number>();
      for (const n of list) {
        const label = typeLabel(n, ' ');
        sub.set(label, (sub.get(label) ?? 0) + 1);
      }
      for (const [label, value] of [...sub.entries()].sort((a, b) => b[1] - a[1])) {
        rows.push({ label, value, color: CATEGORY_COLOR[cat] });
      }
    }
    return rows;
  }, [pool]);

  const clearLog = () => {
    const run = async () => {
      await clearAlertLog();
      setLog([]);
    };
    if (Platform.OS === 'web') run();
    else
      Alert.alert('알림내역 지우기', '지금까지 받은 알림내역을 모두 지울까요?', [
        { text: '취소', style: 'cancel' },
        { text: '지우기', style: 'destructive', onPress: run },
      ]);
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.container}>
      <View style={styles.tiles}>
        {[
          { label: '전체 공고', value: summary.total },
          { label: '접수중', value: summary.open },
          { label: '7일 내 접수', value: summary.thisWeek },
          { label: '찜', value: Object.keys(app.favorites).length },
        ].map((t) => (
          <View key={t.label} style={[styles.tile, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.tileValue, { color: c.text }]}>{t.value}</Text>
            <Text style={[styles.tileLabel, { color: c.sub }]}>{t.label}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.caption, { color: c.faint }]}>
        최근 {app.settings.lookbackDays}일 모집공고 기준 · 전국
      </Text>

      <SectionTitle title="지역별 공고 수" />
      <Card>
        {byRegion.length > 0 ? (
          <Bars rows={byRegion} color={c.primary} />
        ) : (
          <Text style={{ color: c.sub }}>공고를 불러오면 보여 드려요.</Text>
        )}
      </Card>

      <SectionTitle title="유형별 공고 수" />
      <Card>
        {byType.length > 0 ? (
          <Bars rows={byType} color={c.primary} />
        ) : (
          <Text style={{ color: c.sub }}>공고를 불러오면 보여 드려요.</Text>
        )}
      </Card>

      <SectionTitle
        title="알림내역"
        right={
          log.length > 0 ? (
            <Text style={{ color: c.primary, fontSize: 13, fontWeight: '700' }} onPress={clearLog}>
              지우기
            </Text>
          ) : null
        }
      />
      {log.length === 0 ? (
        <Card>
          <EmptyState icon="notifications-off-outline" title="받은 알림이 없어요" body="새 공고 알림과 테스트 알림이 여기에 쌓여요." />
        </Card>
      ) : (
        <Card style={{ paddingVertical: 4 }}>
          {log.map((e, i) => (
            <Pressable
              key={e.id}
              disabled={!e.noticeKey}
              onPress={() => e.noticeKey && router.push(`/notice/${e.noticeKey}`)}
              style={({ pressed }) => [
                styles.logRow,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
                { opacity: pressed ? 0.6 : 1 },
              ]}>
              <Text style={[styles.logTime, { color: c.faint }]}>{dateTimeLabel(e.at)}</Text>
              <Text style={[styles.logTitle, { color: c.text }]}>{e.title}</Text>
              <Text style={[styles.logBody, { color: c.sub }]}>{e.body}</Text>
            </Pressable>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 8, paddingBottom: 32 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  tileValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  tileLabel: { fontSize: 13, marginTop: 2, fontWeight: '600' },
  caption: { fontSize: 12, marginTop: 8, paddingHorizontal: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  barLabel: { width: 118, fontSize: 13, fontWeight: '600' },
  barTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 5 },
  barValue: { width: 28, textAlign: 'right', fontSize: 13, fontWeight: '700' },
  logRow: { paddingVertical: 11 },
  logTime: { fontSize: 11, fontWeight: '700' },
  logTitle: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  logBody: { fontSize: 13, marginTop: 2, lineHeight: 18 },
});
