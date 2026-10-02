import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dDayLabel, rangeLabel, todayStr } from '@/lib/dates';
import { isReceipt } from '@/lib/filters';
import type { ScheduleEvent } from '@/lib/types';
import { tint, useColors } from '@/theme';

/** 접힌 일정 머리줄: 지금 챙길 일정 (다음 청약 접수 → 없으면 다음 일정 → 다 끝났으면 안내) */
function currentStatus(events: ScheduleEvent[], today: string) {
  const upcoming = (e: ScheduleEvent) => (e.end ?? e.start) >= today;
  const receipt = events.find((e) => isReceipt(e) && upcoming(e));
  if (receipt) {
    const active = receipt.start <= today;
    return { title: receipt.label, date: rangeLabel(receipt.start, receipt.end), tag: active ? '진행중' : dDayLabel(receipt.start, today), strong: true };
  }
  const next = events.find(upcoming);
  if (next) return { title: next.label, date: rangeLabel(next.start, next.end), tag: '접수 끝 · 참고', strong: false };
  const last = events[events.length - 1];
  return { title: '모든 일정이 끝났어요', date: last ? `마지막 ${last.label} ${rangeLabel(last.start, last.end)}` : '', tag: '', strong: false };
}

/** 청약 일정표: 지금 상황만 한 줄로 보여 주고, 누르면 전체. D-day 는 청약 접수 일정에만, 나머지는 참고로 흐리게 */
export function Timeline({ events }: { events: ScheduleEvent[] }) {
  const c = useColors();
  const today = todayStr();
  const [open, setOpen] = useState(false);
  if (!events.length) return null;
  const status = currentStatus(events, today);

  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={[styles.head, open && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 12, marginBottom: 12 }]}
        accessibilityRole="button"
        accessibilityLabel={open ? '청약 일정 접기' : '청약 일정 전체 보기'}
      >
        <View style={styles.headText}>
          <Text style={[styles.label, { color: c.text }]}>{status.title}</Text>
          {status.date ? <Text style={[styles.date, { color: c.sub }]}>{status.date}</Text> : null}
        </View>
        {status.tag ? <Text style={[status.strong ? styles.dday : styles.ref, { color: status.strong ? c.accent : c.faint }]}>{status.tag}</Text> : null}
        <Text style={[styles.chev, { color: c.sub }]}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open
        ? events.map((ev, i) => {
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
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headText: { flex: 1 },
  chev: { fontSize: 14 },
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
