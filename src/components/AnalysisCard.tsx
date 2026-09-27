import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge, Card, type IconName } from '@/components/ui';
import { WEB_BASE } from '@/lib/applyhome';
import { typeLabel } from '@/lib/categories';
import type { AnalysisPoint, Notice, NoticeAnalysis } from '@/lib/types';
import { CATEGORY_COLOR, tint, useColors } from '@/theme';

const ICONS: Record<AnalysisPoint['icon'], IconName> = {
  train: 'train-outline',
  school: 'school-outline',
  book: 'book-outline',
  cart: 'cart-outline',
  price: 'pricetag-outline',
  people: 'people-outline',
  wallet: 'wallet-outline',
  flag: 'flag-outline',
  home: 'business-outline',
  calendar: 'calendar-outline',
};

/** undefined: 불러오는 중, null: 자료 없음 */
export type LoadedAnalysis = NoticeAnalysis | null | undefined;

/** 분석 문장은 웹 빌드가 사이트의 data/analysis/<공고>.json 으로 만들어 둔다 (scripts/analysis.ts) */
export function fetchAnalysis(key: string): Promise<NoticeAnalysis | null> {
  return fetch(`${WEB_BASE}/data/analysis/${encodeURIComponent(key)}.json`)
    .then((res) => (res.ok ? (res.json() as Promise<NoticeAnalysis>) : null))
    .catch(() => null);
}

export const ANALYSIS_SOURCE = '분석은 공공데이터·카카오 로컬 자료로 자동으로 만든 참고용이에요. 청약 전에 모집공고문과 현장을 꼭 확인하세요.';

/** 공고 하나의 분석 카드 (찜 분석 탭 · 지역 분석 화면 공용). 머리를 누르면 공고 상세로 */
export function AnalysisCard({ notice, data }: { notice?: Notice; data: LoadedAnalysis }) {
  const c = useColors();
  const name = notice?.name ?? data?.name ?? '';
  const key = notice?.key ?? data?.key;
  return (
    <Card style={{ marginBottom: 12 }}>
      <Pressable onPress={() => key && router.push(`/notice/${key}`)} accessibilityRole="link">
        {notice ? (
          <View style={styles.badges}>
            <Badge label={typeLabel(notice)} color={CATEGORY_COLOR[notice.category]} />
            <Badge label={notice.region} color={c.sub} />
          </View>
        ) : null}
        <Text style={[styles.name, { color: c.text }]}>{name}</Text>
      </Pressable>

      {data === undefined ? (
        <ActivityIndicator color={c.primary} style={{ paddingVertical: 16 }} />
      ) : data === null ? (
        <Text style={[styles.hint, { color: c.faint }]}>이 공고는 분석 자료가 없어요. 공고 목록에서 빠진 공고일 수 있어요.</Text>
      ) : (
        <>
          {data.highlights.length > 0 ? (
            <View style={[styles.badges, { marginTop: 10 }]}>
              {data.highlights.map((h) => (
                <Text key={h} style={[styles.chip, { color: c.primary, backgroundColor: c.primarySoft }]}>
                  {h}
                </Text>
              ))}
            </View>
          ) : null}
          {data.sections.map((s) => (
            <View key={s.title} style={[styles.section, { borderTopColor: c.border }]}>
              <Text style={[styles.sectionTitle, { color: c.sub }]}>{s.title}</Text>
              {s.points.map((p, i) => {
                const color = p.tone === 'good' ? c.success : p.tone === 'bad' ? c.danger : c.sub;
                return (
                  <View key={`${p.title}-${i}`} style={styles.point}>
                    <View style={[styles.icon, { backgroundColor: p.tone ? tint(color, 0.12) : c.cardAlt }]}>
                      <Ionicons name={ICONS[p.icon] ?? 'ellipse-outline'} size={17} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pointTitle, { color: c.faint }]}>{p.title}</Text>
                      <Text style={[styles.pointText, { color: c.text }]}>{p.text}</Text>
                    </View>
                  </View>
                );
              })}
              {s.note ? <Text style={[styles.note, { color: c.faint }]}>{s.note}</Text> : null}
            </View>
          ))}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  name: { fontSize: 17, fontWeight: '800', marginTop: 8, letterSpacing: -0.3 },
  hint: { fontSize: 12, marginTop: 12, lineHeight: 18 },
  chip: { fontSize: 12, fontWeight: '700', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  section: { marginTop: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  sectionTitle: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  point: { flexDirection: 'row', gap: 10, paddingVertical: 7 },
  icon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pointTitle: { fontSize: 12, fontWeight: '700' },
  pointText: { fontSize: 14, lineHeight: 22 },
  note: { fontSize: 11, marginTop: 4, lineHeight: 16 },
});
