import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { NoticeCard } from '@/components/NoticeCard';
import { Banner, Card, EmptyState, SectionTitle } from '@/components/ui';
import { dateTimeLabel, diffDays, longDate, rangeLabel, todayStr } from '@/lib/dates';
import { sortNotices } from '@/lib/filters';
import { MAX_SCHEDULED, planFavoriteAlerts } from '@/lib/alertPlan';
import { isNative } from '@/lib/notifications';
import { useApp } from '@/lib/store';
import type { Notice, ScheduleEvent } from '@/lib/types';
import { tint, useColors } from '@/theme';

interface Upcoming {
  notice: Notice;
  event: ScheduleEvent;
}

function dayTitle(date: string, today: string): string {
  const d = diffDays(date, today);
  if (d <= 0) return '오늘';
  if (d === 1) return '내일';
  return longDate(date);
}

export default function FavoritesScreen() {
  const c = useColors();
  const app = useApp();
  const today = todayStr();
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const favs = useMemo(() => sortNotices(Object.values(app.favorites), today), [app.favorites, today]);

  // 진행중인 일정은 '오늘'에 묶는다
  const groups = useMemo(() => {
    const items: Upcoming[] = [];
    for (const n of favs) {
      for (const ev of n.events) {
        if (ev.kind === 'announce') continue;
        if ((ev.end ?? ev.start) >= today) items.push({ notice: n, event: ev });
      }
    }
    items.sort((a, b) => (a.event.start < today ? today : a.event.start).localeCompare(b.event.start < today ? today : b.event.start));
    const map = new Map<string, Upcoming[]>();
    for (const it of items.slice(0, 40)) {
      const day = it.event.start < today ? today : it.event.start;
      map.set(day, [...(map.get(day) ?? []), it]);
    }
    return [...map.entries()];
  }, [favs, today]);

  const alerts = useMemo(
    () => planFavoriteAlerts(favs, app.settings).slice(0, MAX_SCHEDULED),
    [favs, app.settings]
  );

  if (favs.length === 0) {
    return (
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16 }}>
        <EmptyState
          icon="star-outline"
          title="찜한 공고가 없어요"
          body={'공고 목록에서 ☆ 를 누르면\n특별공급 · 1순위 · 2순위 · 당첨자 발표 · 계약 일정을\n전날과 당일에 알려 드려요.'}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.container}>
      {!isNative ? (
        <Banner icon="phone-portrait-outline" color={c.accent} text="일정 알림은 휴대폰 앱에서만 울려요." />
      ) : null}

      <SectionTitle title="다가오는 일정" />
      <Card style={{ paddingVertical: 8 }}>
        {groups.length === 0 ? (
          <Text style={{ color: c.sub, paddingVertical: 10 }}>남은 일정이 없어요.</Text>
        ) : (
          groups.map(([day, items], gi) => (
            <View key={day} style={[styles.dayGroup, gi > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
              <Text style={[styles.dayTitle, { color: diffDays(day, today) <= 1 ? c.accent : c.text }]}>
                {dayTitle(day, today)}
              </Text>
              {items.map(({ notice, event }) => (
                <Pressable
                  key={`${notice.key}-${event.id}`}
                  onPress={() => router.push(`/notice/${notice.key}`)}
                  style={({ pressed }) => [styles.eventRow, { opacity: pressed ? 0.6 : 1 }]}>
                  <View style={[styles.eventTag, { backgroundColor: tint(c.primary, 0.12) }]}>
                    <Text style={[styles.eventTagText, { color: c.primary }]} numberOfLines={1}>
                      {event.label}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.eventName, { color: c.text }]} numberOfLines={1}>
                      {notice.name}
                    </Text>
                    {event.end ? (
                      <Text style={[styles.eventRange, { color: c.faint }]}>{rangeLabel(event.start, event.end)}</Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ))
        )}
      </Card>

      {isNative ? (
        <>
          <SectionTitle
            title={`예약된 알림 ${alerts.length}개`}
            right={
              alerts.length > 3 ? (
                <Text style={{ color: c.primary, fontSize: 13, fontWeight: '700' }} onPress={() => setShowAllAlerts((v) => !v)}>
                  {showAllAlerts ? '접기' : '모두 보기'}
                </Text>
              ) : null
            }
          />
          <Card style={{ paddingVertical: 6 }}>
            {alerts.length === 0 ? (
              <Text style={{ color: c.sub, paddingVertical: 10 }}>
                예약된 알림이 없어요. 설정에서 전날/당일 알림이 켜져 있는지 확인해 주세요.
              </Text>
            ) : (
              (showAllAlerts ? alerts : alerts.slice(0, 3)).map((a, i) => (
                <View key={a.id} style={[styles.alertRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
                  <Text style={[styles.alertTime, { color: c.sub }]}>{dateTimeLabel(a.at)}</Text>
                  <Text style={[styles.alertTitle, { color: c.text }]} numberOfLines={1}>
                    {a.title}
                  </Text>
                  <Text style={[styles.alertBody, { color: c.faint }]} numberOfLines={1}>
                    {a.body}
                  </Text>
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}

      <SectionTitle title={`찜한 공고 ${favs.length}`} />
      {favs.map((n) => (
        <NoticeCard key={n.key} notice={n} favorite onToggleFavorite={() => app.toggleFavorite(n)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 0, paddingBottom: 32 },
  dayGroup: { paddingVertical: 10 },
  dayTitle: { fontSize: 14, fontWeight: '800', marginBottom: 8 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  eventTag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, minWidth: 74, alignItems: 'center' },
  eventTagText: { fontSize: 12, fontWeight: '800' },
  eventName: { fontSize: 14, fontWeight: '600' },
  eventRange: { fontSize: 12, marginTop: 1 },
  alertRow: { paddingVertical: 10 },
  alertTime: { fontSize: 12, fontWeight: '700' },
  alertTitle: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  alertBody: { fontSize: 12, marginTop: 1 },
});
