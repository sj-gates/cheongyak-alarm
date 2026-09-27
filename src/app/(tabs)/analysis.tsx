import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { ANALYSIS_SOURCE, AnalysisCard, fetchAnalysis, type LoadedAnalysis } from '@/components/AnalysisCard';
import { EmptyState } from '@/components/ui';
import { todayStr } from '@/lib/dates';
import { sortNotices } from '@/lib/filters';
import { useApp } from '@/lib/store';
import { useColors } from '@/theme';

/** 찜한 공고 분석 */
export default function AnalysisScreen() {
  const c = useColors();
  const app = useApp();
  const favs = useMemo(() => sortNotices(Object.values(app.favorites), todayStr()), [app.favorites]);
  const [loaded, setLoaded] = useState<Record<string, LoadedAnalysis>>({});
  const keys = favs.map((n) => n.key).join(',');

  useEffect(() => {
    let alive = true;
    for (const key of keys ? keys.split(',') : []) {
      fetchAnalysis(key).then((data) => {
        if (alive) setLoaded((prev) => ({ ...prev, [key]: data }));
      });
    }
    return () => {
      alive = false;
    };
  }, [keys]);

  if (favs.length === 0) {
    return (
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 16 }}>
        <EmptyState
          icon="analytics-outline"
          title="찜한 공고가 없어요"
          body={'공고를 찜하면 지하철역 · 학교 · 시세\n경쟁률 · 자금을 분석해 드려요.\n공고 상세의 "해당지역 분석하기"로 하나씩 볼 수도 있어요.'}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.container}>
      <Text style={[styles.updated, { color: c.faint }]}>찜한 공고 {favs.length}개 · 입지 · 가격 · 경쟁 · 자금 · 조건</Text>
      {favs.map((n) => (
        <AnalysisCard key={n.key} notice={n} data={loaded[n.key]} />
      ))}
      <Text style={[styles.source, { color: c.faint }]}>{ANALYSIS_SOURCE}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  updated: { fontSize: 12, marginBottom: 8, marginHorizontal: 2 },
  source: { fontSize: 11, textAlign: 'center', marginTop: 12, lineHeight: 16 },
});
