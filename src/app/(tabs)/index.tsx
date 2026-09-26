import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { NoticeCard } from '@/components/NoticeCard';
import { TodayApply } from '@/components/TodayApply';
import { Banner, Button, Chip, EmptyState } from '@/components/ui';
import { ALL_KINDS, KINDS } from '@/lib/categories';
import { timeAgo, todayStr } from '@/lib/dates';
import { STATUS_LABEL, matchesRegion, noticeStatus, sortNotices } from '@/lib/filters';
import { useApp } from '@/lib/store';
import type { Kind, Notice, NoticeStatus } from '@/lib/types';
import { useColors } from '@/theme';

const STATUS_FILTERS: (NoticeStatus | 'all')[] = ['all', 'open', 'upcoming', 'waiting', 'closed'];

/** 지역 탭: 'mine' = 설정한 지역 전체, 'nation' = 전국, 그 밖엔 시·도 이름 */
type RegionTab = string;

function inRegion(n: Notice, tab: RegionTab, mine: string[]) {
  if (tab === 'nation') return true;
  if (tab === 'mine') return matchesRegion(n, mine);
  return n.region === tab;
}

export default function NoticesScreen() {
  const c = useColors();
  const app = useApp();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<NoticeStatus | 'all'>('all');
  const [regionTab, setRegionTab] = useState<RegionTab>('mine');
  const [kind, setKind] = useState<Kind | 'all'>('all');

  const myKinds = app.demo ? ALL_KINDS : app.settings.kinds;
  const myRegions = app.settings.regions;
  const today = todayStr();

  // 설정에서 고른 종류만 남긴 공고 (예시 데이터는 전부)
  const pool = useMemo(() => app.notices.filter((n) => myKinds.includes(n.kind)), [app.notices, myKinds]);

  const regionTabs = useMemo(() => {
    const count = (tab: RegionTab) => pool.filter((n) => inRegion(n, tab, myRegions)).length;
    const tabs: { id: RegionTab; label: string; count: number }[] = [];
    if (myRegions.length > 1) tabs.push({ id: 'mine', label: '전체', count: count('mine') });
    for (const r of myRegions) tabs.push({ id: r, label: r, count: count(r) });
    tabs.push({ id: 'nation', label: '전국', count: count('nation') });
    return tabs;
  }, [pool, myRegions]);
  const activeRegion = regionTabs.some((t) => t.id === regionTab) ? regionTab : regionTabs[0].id;

  const regionPool = useMemo(
    () => pool.filter((n) => inRegion(n, activeRegion, myRegions)),
    [pool, activeRegion, myRegions]
  );
  // 칩은 지금 지역에 공고가 있는 종류만
  const kindChips = KINDS.filter((k) => myKinds.includes(k.id) && regionPool.some((n) => n.kind === k.id));
  const activeKind = kind !== 'all' && kindChips.some((k) => k.id === kind) ? kind : 'all';

  const list = useMemo(() => {
    const q = query.trim();
    const filtered = regionPool.filter((n) => {
      if (activeKind !== 'all' && n.kind !== activeKind) return false;
      if (status !== 'all' && noticeStatus(n, today) !== status) return false;
      if (q && !`${n.name} ${n.address} ${n.builder ?? ''}`.includes(q)) return false;
      return true;
    });
    return sortNotices(filtered, today);
  }, [regionPool, activeKind, status, query, today]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: 0, open: 0, upcoming: 0, waiting: 0, closed: 0 };
    for (const n of regionPool) {
      if (activeKind !== 'all' && n.kind !== activeKind) continue;
      m.all++;
      m[noticeStatus(n, today)]++;
    }
    return m;
  }, [regionPool, activeKind, today]);

  if (!app.ready) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!app.hasKey && !app.demo) {
    return (
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.onboard}>
        <EmptyState
          icon="notifications-outline"
          title="청약 알림을 시작해 볼까요?"
          body={
            '공공데이터포털에서 받은 인증키를 넣으면\n서울·경기 APT 분양과 무순위 공고부터\n새 공고와 일정을 알려 드려요.'
          }>
          <Button label="인증키 입력하러 가기" icon="key-outline" onPress={() => router.push('/settings')} />
          <Button
            label="예시 데이터로 둘러보기"
            variant="secondary"
            icon="eye-outline"
            onPress={() => app.setDemo(true)}
          />
        </EmptyState>
        <View style={[styles.steps, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.stepsTitle, { color: c.text }]}>인증키 받는 법</Text>
          {[
            'data.go.kr 로그인',
            '"한국부동산원_청약홈 분양정보 조회 서비스" 활용신청 (자동승인)',
            '경쟁률도 보려면 "청약접수 경쟁률 및 특별공급 신청현황" 도 신청',
            '마이페이지 → 인증키 복사 → 앱 설정에 붙여넣기',
          ].map((t, i) => (
            <View key={t} style={styles.stepRow}>
              <Text style={[styles.stepNo, { color: c.primary }]}>{i + 1}</Text>
              <Text style={[styles.stepText, { color: c.sub }]}>{t}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  const header = (
    <View style={{ paddingBottom: 6 }}>
      <TodayApply favorites={Object.values(app.favorites)} />
      {app.demo ? (
        <View style={{ marginBottom: 10 }}>
          <Banner
            icon="information-circle"
            color={c.accent}
            text="예시 데이터를 보고 있어요. 설정에서 인증키를 넣으면 실제 공고로 바뀝니다."
          />
        </View>
      ) : null}

      <View style={[styles.search, { backgroundColor: c.card, borderColor: c.border }]}>
        <Ionicons name="search" size={17} color={c.faint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="단지명, 주소, 시공사 검색"
          placeholderTextColor={c.faint}
          style={[styles.searchInput, { color: c.text }]}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.regionTabs, { borderBottomColor: c.border }]}
        contentContainerStyle={{ gap: 18, paddingHorizontal: 2 }}>
        {regionTabs.map((t) => {
          const on = activeRegion === t.id;
          return (
            <Text
              key={t.id}
              onPress={() => setRegionTab(t.id)}
              style={[
                styles.regionTab,
                { color: on ? c.text : c.faint, borderBottomColor: on ? c.primary : 'transparent' },
              ]}>
              {t.label} <Text style={{ fontWeight: '600', color: on ? c.primary : c.faint }}>{t.count}</Text>
            </Text>
          );
        })}
      </ScrollView>

      {kindChips.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="전체 종류" selected={activeKind === 'all'} onPress={() => setKind('all')} />
          {kindChips.map((k) => (
            <Chip
              key={k.id}
              label={k.short}
              selected={activeKind === k.id}
              onPress={() => setKind(activeKind === k.id ? 'all' : k.id)}
            />
          ))}
        </ScrollView>
      ) : (
        <View style={{ height: 12 }} />
      )}

      <View style={[styles.segment, { backgroundColor: c.cardAlt, borderColor: c.border }]}>
        {STATUS_FILTERS.map((s) => {
          const on = status === s;
          return (
            <Text
              key={s}
              onPress={() => setStatus(s)}
              style={[
                styles.segmentItem,
                { color: on ? c.text : c.faint, backgroundColor: on ? c.card : 'transparent' },
              ]}>
              {s === 'all' ? '전체' : STATUS_LABEL[s]} {counts[s]}
            </Text>
          );
        })}
      </View>

      {!app.demo && app.lastCheck ? (
        <Text style={[styles.lastCheck, { color: app.lastCheck.ok ? c.faint : c.danger }]} numberOfLines={2}>
          {app.fetchedAt ? `${timeAgo(app.fetchedAt)} 업데이트 · ` : ''}
          {app.lastCheck.message}
        </Text>
      ) : null}
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={styles.list}
      data={list}
      keyExtractor={(n) => n.key}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => (
        <NoticeCard
          notice={item}
          favorite={!!app.favorites[item.key]}
          isNew={app.newKeys.has(item.key)}
          onToggleFavorite={() => app.toggleFavorite(item)}
        />
      )}
      ListEmptyComponent={
        app.refreshing && app.notices.length === 0 ? (
          <View style={{ paddingTop: 40 }}>
            <ActivityIndicator color={c.primary} />
          </View>
        ) : (
          <EmptyState
            icon="file-tray-outline"
            title="조건에 맞는 공고가 없어요"
            body={
              activeRegion === 'nation'
                ? '설정에서 받아볼 공고 종류를 더 골라 보세요.'
                : '위의 "전국" 탭에서 다른 지역 공고도 볼 수 있어요.'
            }
          />
        )
      }
      refreshControl={
        <RefreshControl refreshing={app.refreshing} onRefresh={app.refresh} tintColor={c.primary} colors={[c.primary]} />
      }
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  onboard: { padding: 16, paddingBottom: 40 },
  steps: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 10 },
  stepsTitle: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  stepRow: { flexDirection: 'row', gap: 10 },
  stepNo: { fontSize: 14, fontWeight: '800', width: 14 },
  stepText: { flex: 1, fontSize: 14, lineHeight: 20 },
  list: { padding: 16, paddingTop: 8, paddingBottom: 32 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  chips: { gap: 8, paddingVertical: 12 },
  regionTabs: { marginTop: 10, borderBottomWidth: StyleSheet.hairlineWidth, flexGrow: 0 },
  regionTab: {
    fontSize: 16,
    fontWeight: '800',
    paddingTop: 6,
    paddingBottom: 9,
    borderBottomWidth: 2.5,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
  },
  segmentItem: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    paddingVertical: 8,
    borderRadius: 9,
    overflow: 'hidden',
  },
  lastCheck: { fontSize: 12, marginTop: 10, marginBottom: 2, paddingHorizontal: 2 },
});
