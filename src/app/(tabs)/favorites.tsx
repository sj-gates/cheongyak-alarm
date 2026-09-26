import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { NoticeCard } from '@/components/NoticeCard';
import { TodayApply } from '@/components/TodayApply';
import { Banner, Card, EmptyState, SectionTitle } from '@/components/ui';
import { MAX_SCHEDULED, planFavoriteAlerts } from '@/lib/alertPlan';
import { dateTimeLabel, todayStr } from '@/lib/dates';
import { sortNotices } from '@/lib/filters';
import { isNative } from '@/lib/notifications';
import { useApp } from '@/lib/store';
import { useColors } from '@/theme';

export default function FavoritesScreen() {
  const c = useColors();
  const app = useApp();
  const today = todayStr();
  const [showAllAlerts, setShowAllAlerts] = useState(false);

  const favs = useMemo(() => sortNotices(Object.values(app.favorites), today), [app.favorites, today]);
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
          body={'공고 목록에서 ☆ 를 누르면\n특별공급 · 1순위 · 2순위 같은 청약 접수일을\n전날과 당일에 알려 드려요.'}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.container}>
      {!isNative ? (
        <Banner icon="phone-portrait-outline" color={c.accent} text="일정 알림은 휴대폰 앱에서만 울려요." />
      ) : null}

      <View style={{ height: 8 }} />
      <TodayApply favorites={favs} />

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
  alertRow: { paddingVertical: 10 },
  alertTime: { fontSize: 12, fontWeight: '700' },
  alertTitle: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  alertBody: { fontSize: 12, marginTop: 1 },
});
