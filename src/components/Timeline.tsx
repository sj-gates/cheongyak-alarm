import { StyleSheet, Text, View } from 'react-native';

import { dDayLabel, rangeLabel, todayStr } from '@/lib/dates';
import { isReceipt } from '@/lib/filters';
import type { ScheduleEvent } from '@/lib/types';
import { tint, useColors } from '@/theme';

/** 청약 일정표: D-day 는 청약 접수 일정에만, 모집공고·발표·계약은 참고로 흐리게 */
export function Timeline({ events }: { events: ScheduleEvent[] }) {
  const c = useColors();
  const today = todayStr();

  return (
    <View>
      {events.map((ev, i) => {
        const end = ev.end ?? ev.start;
        const receipt = isReceipt(ev);
        const past = end < today;
        const active = receipt && ev.start <= today && today <= end;
        const dotColor = active ? c.accent : past ? c.border : receipt ? c.primary : c.faint;
        const last = i === events.length - 1;
        return (
          <View key={ev.id} style={styles.row}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: dotColor },
                  active && { borderColor: tint(c.accent, 0.3), borderWidth: 4, width: 16, height: 16 },
                ]}
              />
              {!last ? <View style={[styles.line, { backgroundColor: c.border }]} /> : null}
            </View>
            <View style={[styles.body, { opacity: past ? 0.5 : receipt ? 1 : 0.6 }]}>
              <View style={styles.titleRow}>
                <Text style={[styles.label, { color: c.text }]}>{ev.label}</Text>
                {past ? null : receipt ? (
                  <Text style={[styles.dday, { color: active ? c.accent : c.primary }]}>
                    {active ? '진행중' : dDayLabel(ev.start, today)}
                  </Text>
                ) : (
                  <Text style={[styles.ref, { color: c.faint }]}>참고</Text>
                )}
              </View>
              <Text style={[styles.date, { color: c.sub }]}>{rangeLabel(ev.start, ev.end)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  rail: { width: 22, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 8, marginTop: 5 },
  line: { width: 2, flex: 1, marginVertical: 3 },
  body: { flex: 1, paddingLeft: 8, paddingBottom: 16 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 15, fontWeight: '700' },
  dday: { fontSize: 13, fontWeight: '800' },
  ref: { fontSize: 12, fontWeight: '600' },
  date: { fontSize: 13, marginTop: 2 },
});
