import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { MapPreview } from '@/components/MapPreview';
import { Timeline } from '@/components/Timeline';
import { Badge, Button, Card, EmptyState, InfoRow, SectionTitle } from '@/components/ui';
import { errorMessage, fetchCompetition, fetchNoticeByKey, fetchScores } from '@/lib/api';
import { APPLY_HOURS, WEB_BASE, activeReceipt, applyUrl, mapLinks } from '@/lib/applyhome';
import { typeLabel } from '@/lib/categories';
import { getModelsCached } from '@/lib/check';
import { parseRate } from '@/lib/normalize';
import { shortDate, todayStr } from '@/lib/dates';
import { STATUS_LABEL, noticeStatus } from '@/lib/filters';
import { formatArea, formatManwon, formatPhone, formatUnits, formatYearMonth } from '@/lib/format';
import { isDemoKey, sampleCompetition, sampleModels, sampleNotices, sampleScores } from '@/lib/sample';
import { getServiceKey } from '@/lib/storage';
import { useApp } from '@/lib/store';
import type { CompetitionRow, HouseModel, Notice, ScoreRow } from '@/lib/types';
import { CATEGORY_COLOR, STATUS_COLOR, useColors } from '@/theme';

type Loadable<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'done'; data: T }
  | { state: 'error'; message: string };

function openUrl(url: string) {
  const full = /^https?:\/\//.test(url) ? url : `http://${url}`;
  if (Platform.OS === 'web') Linking.openURL(full);
  else WebBrowser.openBrowserAsync(full);
}

export default function NoticeDetailScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const app = useApp();
  const c = useColors();
  const today = todayStr();

  const demoNotice = useMemo(
    () => (isDemoKey(key) ? sampleNotices().find((n) => n.key === key) : undefined),
    [key]
  );
  const known = app.findNotice(key) ?? demoNotice;
  const [fetched, setFetched] = useState<Loadable<Notice | null>>({ state: 'idle' });
  const requested = useRef(false);
  const notice = known ?? (fetched.state === 'done' ? fetched.data : null);

  const [models, setModels] = useState<Loadable<HouseModel[]>>({ state: 'idle' });
  const [competition, setCompetition] = useState<Loadable<CompetitionRow[]>>({ state: 'idle' });
  const [scores, setScores] = useState<Loadable<ScoreRow[]>>({ state: 'idle' });

  // 알림을 눌러 들어왔는데 목록에 없으면 공고 하나만 따로 조회
  useEffect(() => {
    if (known || requested.current) return;
    requested.current = true;
    (async () => {
      try {
        const serviceKey = await getServiceKey();
        const n = serviceKey ? await fetchNoticeByKey(serviceKey, key) : null;
        setFetched({ state: 'done', data: n });
      } catch (e) {
        setFetched({ state: 'error', message: errorMessage(e) });
      }
    })();
  }, [key, known]);

  const receiptStarted = !!notice?.receiptStart && notice.receiptStart <= today;
  const winnerAnnounced = !!notice?.winnerDate && notice.winnerDate <= today;

  useEffect(() => {
    if (!notice) return;
    let alive = true;
    const demo = isDemoKey(notice.key);
    const load = async <T,>(
      set: (v: Loadable<T>) => void,
      sample: () => T,
      real: (serviceKey: string) => Promise<T>
    ) => {
      try {
        let data: T;
        if (demo) data = sample();
        else {
          const serviceKey = await getServiceKey();
          if (!serviceKey) throw new Error('인증키가 없어요');
          data = await real(serviceKey);
        }
        if (alive) set({ state: 'done', data });
      } catch (e) {
        if (alive) set({ state: 'error', message: errorMessage(e) });
      }
    };

    load(setModels, () => sampleModels(notice), (k) => getModelsCached(k, notice));
    if (receiptStarted) {
      load(setCompetition, () => sampleCompetition(notice), (k) => fetchCompetition(k, notice));
    }
    if (winnerAnnounced && notice.category === 'APT') {
      load(setScores, () => sampleScores(notice), (k) => fetchScores(k, notice));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice?.key, receiptStarted, winnerAnnounced]);

  const favorite = !!(notice && app.favorites[notice.key]);
  const toggle = async () => {
    if (!notice) return;
    const on = await app.toggleFavorite(notice);
    if (Platform.OS !== 'web') Haptics.notificationAsync(on ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
  };

  if (!notice) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        {fetched.state === 'loading' || fetched.state === 'idle' ? (
          <ActivityIndicator color={c.primary} />
        ) : (
          <EmptyState
            icon="alert-circle-outline"
            title="공고를 찾을 수 없어요"
            body={fetched.state === 'error' ? fetched.message : '목록을 새로고침한 뒤 다시 열어 주세요.'}
          />
        )}
      </View>
    );
  }

  const status = noticeStatus(notice, today);
  const map = mapLinks(notice.address, notice.name);
  const receipt = activeReceipt(notice, today);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={toggle}
              hitSlop={12}
              style={{ paddingHorizontal: 6 }}
              accessibilityLabel={favorite ? '찜 해제' : '찜하기'}>
              <Ionicons name={favorite ? 'star' : 'star-outline'} size={24} color={favorite ? '#FFB020' : c.text} />
            </Pressable>
          ),
        }}
      />
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <View style={styles.badges}>
            <Badge label={typeLabel(notice)} color={CATEGORY_COLOR[notice.category]} />
            <Badge label={notice.region} color={c.sub} />
            <Badge label={STATUS_LABEL[status]} color={STATUS_COLOR[status]} />
          </View>
          <Text style={[styles.title, { color: c.text }]} selectable>
            {notice.name}
          </Text>
          <Text style={[styles.address, { color: c.sub }]} selectable>
            {notice.address}
          </Text>
          {notice.tags.length > 0 ? (
            <View style={[styles.badges, { marginTop: 10 }]}>
              {notice.tags.map((t) => (
                <Badge key={t} label={t} color={c.accent} />
              ))}
            </View>
          ) : null}
        </View>

        <Card style={styles.mapCard}>
          {/* 웹 사이트의 map.html (카카오맵). 끌어서 이동, 두 손가락으로 확대·축소 */}
          <MapPreview uri={`${WEB_BASE}/${map.mapPage}`} title={notice.name} />
          {map.approximate ? (
            <Text style={[styles.mapNote, { color: c.faint }]}>공고에 정확한 번지가 없어 동네 위치로 보여 줘요.</Text>
          ) : null}
        </Card>

        {receipt ? (
          <View style={{ marginBottom: 14 }}>
            <Button
              label="청약 접수하러 가기"
              variant="accent"
              icon="open-outline"
              onPress={() => Linking.openURL(applyUrl(notice.category, receipt.kind))}
            />
            <Text style={[styles.note, { color: c.faint }]}>
              오늘 {receipt.label} 접수{receipt.end ? ` (${shortDate(receipt.end)}까지)` : ''} · 청약홈 {APPLY_HOURS}
            </Text>
          </View>
        ) : null}

        <Button
          label={favorite ? '찜한 공고 · 접수일 알림 받는 중' : '찜하고 접수일 알림 받기'}
          icon={favorite ? 'notifications' : 'notifications-outline'}
          variant={favorite ? 'secondary' : 'primary'}
          onPress={toggle}
        />
        {favorite ? (
          <Text style={[styles.note, { color: c.faint }]}>
            청약 접수 전날 {app.settings.dayBeforeHour}시, 당일 {app.settings.dayOfHour}시에 알려 드려요.
          </Text>
        ) : null}

        <SectionTitle title="청약 일정" />
        <Card>
          {notice.events.length > 0 ? (
            <Timeline events={notice.events} />
          ) : (
            <Text style={{ color: c.sub }}>일정 정보가 없어요.</Text>
          )}
        </Card>

        <SectionTitle title="주택형별 공급" />
        <Card style={{ paddingVertical: 6 }}>
          <ModelList state={models} />
        </Card>

        {receiptStarted ? (
          <>
            <SectionTitle title="청약 경쟁률" />
            <Card style={{ paddingVertical: 6 }}>
              <CompetitionList state={competition} />
            </Card>
          </>
        ) : null}

        {winnerAnnounced && notice.category === 'APT' ? (
          <>
            <SectionTitle title="당첨 가점" />
            <Card style={{ paddingVertical: 6 }}>
              <ScoreList state={scores} />
            </Card>
          </>
        ) : null}

        <SectionTitle title="기본 정보" />
        <Card style={{ paddingVertical: 4 }}>
          <InfoRow label="공급규모" value={notice.totalUnits ? formatUnits(notice.totalUnits) : undefined} />
          <InfoRow label="모집공고일" value={shortDate(notice.announceDate)} />
          <InfoRow label="입주예정" value={formatYearMonth(notice.moveIn)} />
          {notice.builder ? <InfoRow label="시공사" value={notice.builder} /> : null}
          <InfoRow label="시행사" value={notice.developer} />
          <InfoRow
            label="문의처"
            value={notice.phone ? formatPhone(notice.phone) : undefined}
            onPress={notice.phone ? () => Linking.openURL(`tel:${notice.phone}`) : undefined}
          />
        </Card>

        <View style={{ gap: 8, marginTop: 20 }}>
          {notice.url ? (
            <Button label="청약홈에서 모집공고 보기" icon="document-text-outline" onPress={() => openUrl(notice.url!)} />
          ) : null}
          {notice.homepage ? (
            <Button label="분양 홈페이지" variant="ghost" icon="globe-outline" onPress={() => openUrl(notice.homepage!)} />
          ) : null}
        </View>
        <Text style={[styles.source, { color: c.faint }]}>
          자료: 한국부동산원 청약홈 (공공데이터포털). 청약 전에 반드시 모집공고문 원문을 확인하세요.
        </Text>
      </ScrollView>
    </>
  );
}

function StateView<T>({
  state,
  empty,
  children,
}: {
  state: Loadable<T[]>;
  empty: string;
  children: (data: T[]) => ReactNode;
}) {
  const c = useColors();
  if (state.state === 'idle' || state.state === 'loading') {
    return <ActivityIndicator color={c.primary} style={{ paddingVertical: 18 }} />;
  }
  if (state.state === 'error') {
    return <Text style={[styles.errorText, { color: c.danger }]}>{state.message}</Text>;
  }
  if (state.data.length === 0) {
    return <Text style={[styles.errorText, { color: c.sub }]}>{empty}</Text>;
  }
  return <>{children(state.data)}</>;
}

function ModelList({ state }: { state: Loadable<HouseModel[]> }) {
  const c = useColors();
  return (
    <StateView state={state} empty="주택형 정보가 아직 없어요.">
      {(models) =>
        models.map((m, i) => {
          const specials = Object.entries(m.special).filter(([, v]) => (v ?? 0) > 0);
          return (
            <View
              key={`${m.rawType}-${i}`}
              style={[styles.modelRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
              <View style={styles.modelTop}>
                <Text style={[styles.modelLabel, { color: c.text }]}>{m.label}</Text>
                <Text style={[styles.modelArea, { color: c.sub }]}>
                  전용 {formatArea(m.exclusiveArea)}
                  {m.supplyArea ? ` · 공급 ${formatArea(m.supplyArea)}` : ''}
                </Text>
                <Text style={[styles.modelPrice, { color: c.text }]}>{formatManwon(m.price)}</Text>
              </View>
              <Text style={[styles.modelUnits, { color: c.sub }]}>
                {m.generalUnits !== undefined ? `일반 ${m.generalUnits}세대` : ''}
                {m.specialUnits ? ` · 특별 ${m.specialUnits}세대` : ''}
                {m.deposit ? ` · 청약신청금 ${formatManwon(m.deposit)}` : ''}
              </Text>
              {specials.length > 0 ? (
                <Text style={[styles.modelSpecial, { color: c.faint }]}>
                  {specials.map(([k, v]) => `${k} ${v}`).join(' · ')}
                </Text>
              ) : null}
            </View>
          );
        })
      }
    </StateView>
  );
}

function CompetitionList({ state }: { state: Loadable<CompetitionRow[]> }) {
  const c = useColors();
  const hint =
    state.state === 'error'
      ? '경쟁률은 "청약접수 경쟁률 및 특별공급 신청현황 조회 서비스" 활용신청이 따로 필요해요.'
      : null;
  return (
    <>
      <StateView state={state} empty="아직 경쟁률이 공개되지 않았어요.">
        {(rows) =>
          rows.map((r, i) => {
            const rate = parseRate(r.rate);
            return (
              <View
                key={`${r.houseType}-${r.group}-${i}`}
                style={[styles.tableRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
                <Text style={[styles.cellType, { color: c.text }]}>{r.houseType}</Text>
                <Text style={[styles.cellGroup, { color: c.sub }]} numberOfLines={1}>
                  {r.group}
                </Text>
                <Text style={[styles.cellNum, { color: c.sub }]}>
                  {r.units ?? '-'} / {r.requests ?? '-'}
                </Text>
                <Text style={[styles.cellRate, { color: rate.shortfall ? c.danger : c.primary }]}>
                  {rate.text}
                </Text>
              </View>
            );
          })
        }
      </StateView>
      {state.state === 'done' && state.data.length > 0 ? (
        <Text style={[styles.tableHint, { color: c.faint }]}>
          세대수 / 접수건수 · 경쟁률(:1) · 미달은 접수가 모자란 세대수
        </Text>
      ) : null}
      {hint ? <Text style={[styles.tableHint, { color: c.faint }]}>{hint}</Text> : null}
    </>
  );
}

function ScoreList({ state }: { state: Loadable<ScoreRow[]> }) {
  const c = useColors();
  return (
    <StateView state={state} empty="공개된 당첨 가점이 없어요. 미달이거나 추첨 물량이면 가점이 나오지 않아요.">
      {(rows) => (
        <>
          {rows.map((r, i) => (
            <View
              key={`${r.houseType}-${r.reside}-${i}`}
              style={[styles.tableRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border }]}>
              <Text style={[styles.cellType, { color: c.text }]}>{r.houseType}</Text>
              <Text style={[styles.cellGroup, { color: c.sub }]}>{r.reside}</Text>
              <Text style={[styles.cellNum, { color: c.sub }]}>
                {r.min ?? '-'} ~ {r.max ?? '-'}
              </Text>
              <Text style={[styles.cellRate, { color: c.primary }]}>{r.avg ?? '-'}</Text>
            </View>
          ))}
          <Text style={[styles.tableHint, { color: c.faint }]}>최저 ~ 최고 · 평균 가점</Text>
        </>
      )}
    </StateView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 16, paddingBottom: 48 },
  hero: { paddingHorizontal: 2, paddingBottom: 16 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  title: { fontSize: 24, fontWeight: '800', marginTop: 10, letterSpacing: -0.5 },
  address: { fontSize: 14, marginTop: 6, lineHeight: 20 },
  note: { fontSize: 12, textAlign: 'center', marginTop: 8 },
  mapCard: { padding: 0, overflow: 'hidden', marginBottom: 14 },
  mapNote: { fontSize: 12, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  errorText: { fontSize: 13, paddingVertical: 14, lineHeight: 19 },
  modelRow: { paddingVertical: 12 },
  modelTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  modelLabel: { fontSize: 16, fontWeight: '800', minWidth: 44 },
  modelArea: { flex: 1, fontSize: 12 },
  modelPrice: { fontSize: 14, fontWeight: '700' },
  modelUnits: { fontSize: 13, marginTop: 4 },
  modelSpecial: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 8 },
  cellType: { width: 48, fontSize: 14, fontWeight: '800' },
  cellGroup: { flex: 1, fontSize: 13 },
  cellNum: { fontSize: 12 },
  cellRate: { minWidth: 56, textAlign: 'right', fontSize: 14, fontWeight: '800' },
  tableHint: { fontSize: 11, paddingTop: 4, paddingBottom: 10, lineHeight: 16 },
  source: { fontSize: 11, textAlign: 'center', marginTop: 20, lineHeight: 16 },
});
