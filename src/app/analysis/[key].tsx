import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { ANALYSIS_SOURCE, AnalysisCard, fetchAnalysis, type LoadedAnalysis } from '@/components/AnalysisCard';
import { Button } from '@/components/ui';
import { useApp } from '@/lib/store';
import { useColors } from '@/theme';

/** 공고 상세의 "해당지역 분석하기": 찜하지 않은 공고도 하나만 본다 */
export default function AnalysisOneScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const c = useColors();
  const app = useApp();
  const notice = app.findNotice(key) ?? app.favorites[key];
  const favorite = !!app.favorites[key];
  const [data, setData] = useState<LoadedAnalysis>(undefined);

  useEffect(() => {
    let alive = true;
    fetchAnalysis(key).then((d) => {
      if (alive) setData(d);
    });
    return () => {
      alive = false;
    };
  }, [key]);

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.container}>
      <AnalysisCard notice={notice} data={data} />
      {notice ? (
        favorite ? (
          <Button label="찜한 공고 분석 모두 보기" variant="ghost" icon="analytics-outline" onPress={() => router.navigate('/analysis')} />
        ) : (
          <Button
            label="찜하고 분석 탭에 모아 보기"
            variant="secondary"
            icon="star-outline"
            onPress={async () => {
              await app.toggleFavorite(notice);
              router.navigate('/analysis');
            }}
          />
        )
      ) : null}
      <Text style={[styles.source, { color: c.faint }]}>{ANALYSIS_SOURCE}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40 },
  source: { fontSize: 11, textAlign: 'center', marginTop: 16, lineHeight: 16 },
});
