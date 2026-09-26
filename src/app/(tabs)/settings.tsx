import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Banner, Button, Card, Chip, SectionTitle, ToggleRow } from '@/components/ui';
import { errorMessage, testConnection } from '@/lib/api';
import { getBackgroundInfo, type BackgroundInfo } from '@/lib/background';
import { KIND_GROUPS, kindMeta } from '@/lib/categories';
import { dateTimeLabel, timeAgo } from '@/lib/dates';
import { formatManwon } from '@/lib/format';
import {
  ensurePermission,
  getPermissionState,
  isNative,
  notifyNow,
  scheduleTestAlert,
  type PermissionState,
} from '@/lib/notifications';
import { REGION_NAMES } from '@/lib/regions';
import { appendAlertLog, clearAlertLog, getKeySource, getServiceKey, loadAlertLog } from '@/lib/storage';
import { useApp } from '@/lib/store';
import type { AlertLogEntry, Kind, SpecialKind } from '@/lib/types';
import { useColors } from '@/theme';

const SPECIAL_KINDS: SpecialKind[] = ['신혼부부', '생애최초', '신생아', '청년', '다자녀', '노부모'];
const INTERVALS = [1, 3, 6, 12];
const BEFORE_HOURS = [18, 19, 20, 21, 22];
const DAY_HOURS = [7, 8, 9, 10, 12];

function notify(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

function toggleIn<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** 숫자 입력칸: 입력 중엔 글자 그대로, 벗어날 때 숫자로 저장 (값이 바뀌면 key 로 다시 그린다) */
function NumberField({
  value,
  onCommit,
  placeholder,
  suffix,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  placeholder: string;
  suffix: string;
}) {
  const c = useColors();
  const [text, setText] = useState(value === null ? '' : String(value));
  const commit = () => {
    const n = Number(text.replace(/[^0-9.]/g, ''));
    onCommit(text.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : n);
  };
  return (
    <View style={[styles.numField, { borderColor: c.border, backgroundColor: c.cardAlt }]}>
      <TextInput
        value={text}
        onChangeText={setText}
        onBlur={commit}
        onSubmitEditing={commit}
        placeholder={placeholder}
        placeholderTextColor={c.faint}
        keyboardType="numeric"
        returnKeyType="done"
        style={[styles.numInput, { color: c.text }]}
      />
      <Text style={{ color: c.sub, fontSize: 13 }}>{suffix}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const c = useColors();
  const app = useApp();
  const s = app.settings;

  const [keyInput, setKeyInput] = useState('');
  const [keyVisible, setKeyVisible] = useState(false);
  const [keyTail, setKeyTail] = useState<string | null>(null);
  const [keySource, setKeySource] = useState<'saved' | 'builtin' | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [permission, setPermission] = useState<PermissionState>('unsupported');
  const [bg, setBg] = useState<BackgroundInfo | null>(null);
  const [log, setLog] = useState<AlertLogEntry[]>([]);

  const refreshStatus = useCallback(async () => {
    const key = await getServiceKey();
    setKeyTail(key ? key.slice(-4) : null);
    setKeySource(await getKeySource());
    setPermission(await getPermissionState().catch(() => 'unsupported' as const));
    setBg(await getBackgroundInfo().catch(() => null));
    setLog(await loadAlertLog());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshStatus();
    }, [refreshStatus])
  );

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } catch (e) {
      notify('오류', errorMessage(e));
    } finally {
      setBusy(null);
      refreshStatus();
    }
  };

  const saveKey = () =>
    run('save', async () => {
      const key = keyInput.trim();
      if (!key) return notify('인증키', '인증키를 붙여넣어 주세요.');
      try {
        const total = await testConnection(key);
        await app.saveKey(key);
        setKeyInput('');
        notify('저장했어요', `연결 확인 완료 — APT 분양정보 전체 ${total.toLocaleString('ko-KR')}건`);
      } catch (e) {
        notify('연결에 실패했어요', `${errorMessage(e)}\n\n인증키를 다시 확인해 주세요. 저장하지 않았어요.`);
      }
    });

  const checkKey = () =>
    run('check', async () => {
      const key = await getServiceKey();
      if (!key) return notify('인증키', '인증키가 없어요.');
      const total = await testConnection(key);
      notify('정상', `APT 분양정보 전체 ${total.toLocaleString('ko-KR')}건 조회 가능`);
    });

  const deleteKey = () => {
    const go = () => run('delete', () => app.saveKey(null));
    if (Platform.OS === 'web') go();
    else
      Alert.alert(
        '인증키 삭제',
        keySource === 'saved' && keyTail
          ? '직접 입력한 인증키를 지울까요? 앱 기본 키가 있으면 그 키로 돌아가요.'
          : '인증키를 지울까요?',
        [
        { text: '취소', style: 'cancel' },
        { text: '삭제', style: 'destructive', onPress: go },
        ]
      );
  };

  const clearLog = () => {
    const go = async () => {
      await clearAlertLog();
      setLog([]);
    };
    if (Platform.OS === 'web') go();
    else
      Alert.alert('알림내역 지우기', '지금까지 받은 알림내역을 모두 지울까요?', [
        { text: '취소', style: 'cancel' },
        { text: '지우기', style: 'destructive', onPress: go },
      ]);
  };

  const needPermission = async () => {
    const ok = await ensurePermission();
    if (!ok) {
      Alert.alert('알림이 꺼져 있어요', '휴대폰 설정에서 청약알림의 알림을 허용해 주세요.', [
        { text: '닫기', style: 'cancel' },
        { text: '설정 열기', onPress: () => Linking.openSettings() },
      ]);
    }
    return ok;
  };

  const testNow = () =>
    run('test', async () => {
      if (!isNative) return notify('알림 테스트', '알림은 휴대폰 앱에서만 울려요.');
      if (!(await needPermission())) return;
      const title = '🔔 알림 테스트';
      const body = '청약 알림이 정상적으로 동작해요.';
      await notifyNow(title, body, {}, 'new');
      await appendAlertLog([{ at: Date.now(), title, body }]);
    });

  const testScheduled = () =>
    run('sched', async () => {
      if (!isNative) return notify('예약 알림 테스트', '알림은 휴대폰 앱에서만 울려요.');
      if (!(await needPermission())) return;
      await scheduleTestAlert(10, '⏰ 내일 1순위 접수 (테스트)', '찜한 공고 접수일 알림은 이런 모양으로 와요.');
      notify('10초 뒤에 알림이 와요', '앱을 닫거나 홈 화면으로 나가서 확인해 보세요.');
    });

  const checkNow = () =>
    run('refresh', async () => {
      const r = await app.refresh();
      if (r) notify(r.ok ? '확인 완료' : '확인 실패', `${r.message}${r.total !== undefined ? `\n받아온 공고 ${r.total}건` : ''}`);
      else if (!app.hasKey) notify('인증키 필요', '인증키를 먼저 저장해 주세요.');
    });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled">
        {!isNative ? (
          <Banner icon="phone-portrait-outline" color={c.accent} text="미리보기 화면이에요. 알림·백그라운드 확인은 휴대폰 앱에서 동작해요." />
        ) : null}

        <SectionTitle title="공공데이터포털 인증키" />
        <Card>
          <View style={styles.keyStatus}>
            <Ionicons
              name={keyTail ? 'checkmark-circle' : 'alert-circle'}
              size={18}
              color={keyTail ? c.success : c.accent}
            />
            <Text style={[styles.keyStatusText, { color: c.text }]}>
              {keySource === 'saved'
                ? `직접 입력한 키 사용 중 (••••${keyTail})`
                : keySource === 'builtin'
                  ? `앱 기본 키 사용 중 (••••${keyTail})`
                  : '아직 없어요'}
            </Text>
          </View>
          <View style={[styles.keyField, { borderColor: c.border, backgroundColor: c.cardAlt }]}>
            <TextInput
              value={keyInput}
              onChangeText={setKeyInput}
              placeholder={keyTail ? '다른 인증키로 바꾸기' : '인증키 붙여넣기'}
              placeholderTextColor={c.faint}
              secureTextEntry={!keyVisible}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.keyInput, { color: c.text }]}
            />
            <Pressable onPress={() => setKeyVisible((v) => !v)} hitSlop={10}>
              <Ionicons name={keyVisible ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.faint} />
            </Pressable>
          </View>
          <View style={styles.row}>
            <Button label="확인 후 저장" onPress={saveKey} loading={busy === 'save'} style={{ flex: 1 }} />
            {keyTail ? (
              <Button label="연결 확인" variant="secondary" onPress={checkKey} loading={busy === 'check'} style={{ flex: 1 }} />
            ) : null}
            {keySource === 'saved' ? <Button label="삭제" variant="ghost" onPress={deleteKey} /> : null}
          </View>
          <Text style={[styles.hint, { color: c.faint }]}>
            data.go.kr 마이페이지의 일반 인증키(Encoding·Decoding 둘 다 됨). 여기서 입력한 키는 이 휴대폰의 보안 저장소에만 저장되고, 앱 기본 키보다 먼저 쓰여요.
          </Text>
          {!keyTail ? (
            <ToggleRow
              label="예시 데이터로 둘러보기"
              hint="인증키가 반영되기 전 화면을 미리 볼 수 있어요"
              value={app.demo}
              onChange={app.setDemo}
            />
          ) : null}
        </Card>

        <SectionTitle title="받아볼 공고 종류" />
        <Card style={{ gap: 14 }}>
          {KIND_GROUPS.map((g) => {
            const allOn = g.kinds.every((k) => s.kinds.includes(k));
            return (
              <View key={g.title}>
                <View style={styles.groupHead}>
                  <Text style={[styles.label, { color: c.text, marginBottom: 0 }]}>{g.title}</Text>
                  <Text
                    style={{ color: c.primary, fontSize: 13, fontWeight: '700' }}
                    onPress={() =>
                      app.updateSettings({
                        kinds: allOn
                          ? s.kinds.filter((k) => !g.kinds.includes(k))
                          : [...new Set<Kind>([...s.kinds, ...g.kinds])],
                      })
                    }>
                    {allOn ? '모두 끄기' : '모두 켜기'}
                  </Text>
                </View>
                <View style={styles.wrap}>
                  {g.kinds.map((k) => (
                    <Chip
                      key={k}
                      label={kindMeta(k).label}
                      selected={s.kinds.includes(k)}
                      onPress={() => app.updateSettings({ kinds: toggleIn<Kind>(s.kinds, k) })}
                    />
                  ))}
                </View>
              </View>
            );
          })}
          <Text style={[styles.hint, { color: c.faint, marginTop: 0 }]}>
            고른 종류만 목록에 보이고 새 공고 알림도 와요.
          </Text>
        </Card>

        <SectionTitle
          title="관심 지역"
          right={
            <Text style={{ color: c.primary, fontSize: 13, fontWeight: '700' }} onPress={() => app.updateSettings({ regions: [] })}>
              전국으로
            </Text>
          }
        />
        <Card>
          <View style={styles.wrap}>
            {REGION_NAMES.map((r) => (
              <Chip
                key={r}
                label={r}
                selected={s.regions.includes(r)}
                onPress={() => app.updateSettings({ regions: toggleIn(s.regions, r) })}
              />
            ))}
          </View>
          <Text style={[styles.hint, { color: c.faint }]}>
            {s.regions.length === 0
              ? '전국 공고를 알려 드려요.'
              : `공고 목록 위에 ${s.regions.join(' · ')} 탭이 생기고, 이 지역 새 공고만 알려 드려요.`}
          </Text>
        </Card>

        <SectionTitle title="새 공고 알림 조건 (선택)" />
        <Card>
          <Text style={[styles.label, { color: c.text }]}>최고 분양가</Text>
          <NumberField key={`p${s.maxPrice}`} value={s.maxPrice} onCommit={(v) => app.updateSettings({ maxPrice: v })} placeholder="제한 없음" suffix="만원 이하" />
          {s.maxPrice ? <Text style={[styles.hint, { color: c.primary }]}>{formatManwon(s.maxPrice)} 이하 주택형이 있는 공고</Text> : null}

          <Text style={[styles.label, { color: c.text, marginTop: 14 }]}>전용면적</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <NumberField key={`a${s.minArea}`} value={s.minArea} onCommit={(v) => app.updateSettings({ minArea: v })} placeholder="최소" suffix="㎡" />
            </View>
            <Text style={{ color: c.sub, alignSelf: 'center' }}>~</Text>
            <View style={{ flex: 1 }}>
              <NumberField key={`b${s.maxArea}`} value={s.maxArea} onCommit={(v) => app.updateSettings({ maxArea: v })} placeholder="최대" suffix="㎡" />
            </View>
          </View>

          <Text style={[styles.label, { color: c.text, marginTop: 14 }]}>특별공급 (APT)</Text>
          <View style={styles.wrap}>
            {SPECIAL_KINDS.map((k) => (
              <Chip
                key={k}
                label={k}
                selected={s.specialKinds.includes(k)}
                onPress={() => app.updateSettings({ specialKinds: toggleIn(s.specialKinds, k) })}
              />
            ))}
          </View>
          <Text style={[styles.hint, { color: c.faint }]}>
            비워 두면 공급유형·지역만 봐요. 조건을 넣으면 주택형별 정보를 한 번 더 조회해서 하나라도 맞는 공고만 알려요.
          </Text>
        </Card>

        <SectionTitle title="새 공고 알림" />
        <Card>
          <ToggleRow
            label="새 모집공고 알림"
            hint="처음 보는 공고가 조건에 맞으면 알려요. 같은 공고는 두 번 알리지 않아요."
            value={s.newNoticeAlert}
            onChange={(v) => app.updateSettings({ newNoticeAlert: v })}
          />
          <Text style={[styles.label, { color: c.text, marginTop: 6 }]}>확인 주기</Text>
          <View style={styles.wrap}>
            {INTERVALS.map((h) => (
              <Chip
                key={h}
                label={`${h}시간`}
                selected={s.checkIntervalHours === h}
                onPress={() => app.updateSettings({ checkIntervalHours: h })}
              />
            ))}
          </View>
          <Text style={[styles.hint, { color: c.faint }]}>
            휴대폰이 배터리·네트워크 상황을 보고 이 주기 이후에 실행해요. 재부팅 후에도 자동으로 다시 등록돼요.
            {bg ? `\n백그라운드 확인: ${bg.registered ? '등록됨' : '꺼짐'}${bg.available ? '' : ' (이 기기에서 제한됨)'}` : ''}
            {app.lastCheck ? `\n마지막 확인: ${timeAgo(app.lastCheck.at)} · ${app.lastCheck.message}` : ''}
          </Text>
        </Card>

        <SectionTitle title="찜한 공고 청약 접수일 알림" />
        <Card>
          <ToggleRow
            label="전날 알림"
            hint="예: 내일 1순위 접수 시작"
            value={s.dayBeforeAlert}
            onChange={(v) => app.updateSettings({ dayBeforeAlert: v })}
          />
          {s.dayBeforeAlert ? (
            <View style={[styles.wrap, { marginBottom: 8 }]}>
              {BEFORE_HOURS.map((h) => (
                <Chip key={h} label={`${h}시`} selected={s.dayBeforeHour === h} onPress={() => app.updateSettings({ dayBeforeHour: h })} />
              ))}
            </View>
          ) : null}
          <ToggleRow
            label="당일 알림"
            hint="예: 오늘 1순위 접수 · 오늘 특별공급 접수 마감"
            value={s.dayOfAlert}
            onChange={(v) => app.updateSettings({ dayOfAlert: v })}
          />
          {s.dayOfAlert ? (
            <View style={styles.wrap}>
              {DAY_HOURS.map((h) => (
                <Chip key={h} label={`${h}시`} selected={s.dayOfHour === h} onPress={() => app.updateSettings({ dayOfHour: h })} />
              ))}
            </View>
          ) : null}
        </Card>

        <SectionTitle title="알림 테스트" />
        <Card style={{ gap: 8 }}>
          {isNative ? (
            <View style={styles.keyStatus}>
              <Ionicons
                name={permission === 'granted' ? 'checkmark-circle' : 'alert-circle'}
                size={18}
                color={permission === 'granted' ? c.success : c.danger}
              />
              <Text style={[styles.keyStatusText, { color: c.text, flex: 1 }]}>
                알림 권한: {permission === 'granted' ? '허용됨' : permission === 'denied' ? '꺼짐' : '아직 묻지 않음'}
              </Text>
              {permission !== 'granted' ? (
                <Text style={{ color: c.primary, fontWeight: '700' }} onPress={needPermission}>
                  허용하기
                </Text>
              ) : null}
            </View>
          ) : null}
          <Button label="🔔 알림 테스트" onPress={testNow} loading={busy === 'test'} />
          <Button label="⏰ 예약 알림 테스트 (10초 후)" variant="secondary" onPress={testScheduled} loading={busy === 'sched'} />
          <Button label="지금 새 공고 확인" variant="ghost" icon="refresh" onPress={checkNow} loading={busy === 'refresh'} />
          {Platform.OS === 'android' ? (
            <Text style={[styles.hint, { color: c.faint }]}>
              삼성 등 일부 휴대폰은 배터리 절약 때문에 백그라운드 확인을 멈출 수 있어요. 설정 → 애플리케이션 → 청약알림 → 배터리 → ‘제한 없음’으로 바꾸면 안정적이에요.
            </Text>
          ) : null}
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
        <Card style={{ paddingVertical: 4 }}>
          {log.length === 0 ? (
            <Text style={[styles.hint, { color: c.faint, marginVertical: 10 }]}>
              새 공고 알림과 테스트 알림이 여기에 쌓여요.
            </Text>
          ) : (
            log.slice(0, 30).map((e, i) => (
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
            ))
          )}
        </Card>

        <Text style={[styles.footer, { color: c.faint }]}>
          청약알림 {Constants.expoConfig?.version ?? ''}
          {'\n'}자료: 한국부동산원 청약홈 분양정보 · 경쟁률 조회 서비스 (공공데이터포털)
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 0, paddingBottom: 40 },
  keyStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyStatusText: { fontSize: 14, fontWeight: '700' },
  keyField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    marginTop: 12,
    marginBottom: 10,
    gap: 8,
  },
  keyInput: { flex: 1, fontSize: 14, paddingVertical: 0 },
  row: { flexDirection: 'row', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: 12, lineHeight: 18, marginTop: 10 },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  groupHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  numField: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    gap: 6,
  },
  numInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  footer: { fontSize: 11, textAlign: 'center', marginTop: 28, lineHeight: 17 },
  logRow: { paddingVertical: 11 },
  logTime: { fontSize: 11, fontWeight: '700' },
  logTitle: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  logBody: { fontSize: 13, marginTop: 2, lineHeight: 18 },
});
