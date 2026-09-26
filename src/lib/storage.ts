import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { KINDS } from './categories';
import type {
  AlertLogEntry,
  Category,
  CheckResult,
  HouseModel,
  Kind,
  Notice,
  Settings,
} from './types';

const K = {
  settings: 'settings.v1',
  favorites: 'favorites.v1',
  seen: 'seen.v1',
  notices: 'notices.v2', // v2: 세부 종류(kind) 추가
  log: 'alertLog.v1',
  lastCheck: 'lastCheck.v1',
  demo: 'demo.v1',
  interval12: 'migrated.interval12', // 확인 주기 기본값 3시간 → 12시간
  model: (key: string) => `model.v1.${key}`,
};
const SERVICE_KEY = 'serviceKey';

export const DEFAULT_SETTINGS: Settings = {
  kinds: ['APT_PRIVATE', 'APT_PUBLIC', 'APT_NEWLYWED', 'APT_PRESALE', 'REMNDR', 'RESUPPLY'],
  regions: ['서울', '경기', '부산'],
  maxPrice: null,
  minArea: null,
  maxArea: null,
  specialKinds: [],
  newNoticeAlert: true,
  checkIntervalHours: 12,
  dayBeforeAlert: true,
  dayBeforeHour: 20,
  dayOfAlert: true,
  dayOfHour: 8,
  lookbackDays: 60,
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

// ── 인증키 ───────────────────────────────────────────────────
// 앱에서 입력한 키(휴대폰 보안 저장소)가 우선이고, 없으면 빌드 때 넣은 기본 키를 쓴다.
// 기본 키는 .env.local(로컬) 또는 EAS 환경변수(클라우드 빌드)의 EXPO_PUBLIC_SERVICE_KEY.
const BUILTIN_KEY = process.env.EXPO_PUBLIC_SERVICE_KEY?.trim() || null;

async function getSavedKey(): Promise<string | null> {
  if (Platform.OS === 'web') return AsyncStorage.getItem(SERVICE_KEY);
  return SecureStore.getItemAsync(SERVICE_KEY);
}

export async function getServiceKey(): Promise<string | null> {
  return (await getSavedKey()) || BUILTIN_KEY;
}

export async function getKeySource(): Promise<'saved' | 'builtin' | null> {
  if (await getSavedKey()) return 'saved';
  return BUILTIN_KEY ? 'builtin' : null;
}

export async function setServiceKey(key: string | null) {
  if (Platform.OS === 'web') {
    if (key) await AsyncStorage.setItem(SERVICE_KEY, key);
    else await AsyncStorage.removeItem(SERVICE_KEY);
    return;
  }
  if (key) await SecureStore.setItemAsync(SERVICE_KEY, key);
  else await SecureStore.deleteItemAsync(SERVICE_KEY);
}

// ── 설정 ─────────────────────────────────────────────────────
export async function loadSettings(): Promise<Settings> {
  const saved = await readJson<Partial<Settings> & { categories?: Category[] }>(K.settings, {});
  const { categories: oldCategories, ...rest } = saved;
  const settings: Settings = { ...DEFAULT_SETTINGS, ...rest };
  // 예전 설정은 공급유형(categories) 단위였다 → 그 유형의 세부 종류를 모두 켠 것으로 옮긴다.
  // 무순위에는 불법행위 재공급이 섞여 있었으므로 무순위를 켰으면 재공급도 켠다.
  if (!rest.kinds && oldCategories) {
    const cats = new Set<Category>(oldCategories);
    if (cats.has('REMNDR')) cats.add('RESUPPLY');
    settings.kinds = KINDS.filter((k) => cats.has(k.category)).map((k): Kind => k.id);
    await writeJson(K.settings, settings);
  }
  // 확인 주기 기본값을 3시간에서 12시간으로 바꿨다. 예전 기본값 그대로인 설정은 한 번만 12시간으로 옮긴다.
  if (!(await AsyncStorage.getItem(K.interval12))) {
    if (saved.checkIntervalHours === 3) {
      settings.checkIntervalHours = 12;
      await writeJson(K.settings, settings);
    }
    await AsyncStorage.setItem(K.interval12, '1');
  }
  return settings;
}

export async function saveSettings(settings: Settings) {
  await writeJson(K.settings, settings);
}

// ── 찜: 공고 전체를 저장해 두어 오프라인에서도 일정 알림을 다시 잡을 수 있게 ──
export async function loadFavorites(): Promise<Record<string, Notice>> {
  return readJson(K.favorites, {});
}

export async function saveFavorites(favs: Record<string, Notice>) {
  await writeJson(K.favorites, favs);
}

// ── 본 공고 (중복 알림 방지) ─────────────────────────────────────
// keys: 공고 key → 처음 본 시각 (처음 조회로 채운 것은 0)
export interface SeenState {
  keys: Record<string, number>;
  seededCategories: Category[];
}

const MAX_SEEN = 4000;

export async function loadSeen(): Promise<SeenState> {
  return readJson<SeenState>(K.seen, { keys: {}, seededCategories: [] });
}

export async function saveSeen(state: SeenState) {
  const entries = Object.entries(state.keys);
  if (entries.length > MAX_SEEN) {
    entries.sort((a, b) => b[1] - a[1]);
    state = { ...state, keys: Object.fromEntries(entries.slice(0, MAX_SEEN)) };
  }
  await writeJson(K.seen, state);
}

// ── 마지막으로 받아온 공고 목록 ─────────────────────────────────
export interface NoticeCache {
  fetchedAt: number;
  notices: Notice[];
}

export async function loadNoticeCache(): Promise<NoticeCache | null> {
  return readJson<NoticeCache | null>(K.notices, null);
}

export async function saveNoticeCache(cache: NoticeCache) {
  await writeJson(K.notices, cache);
}

// ── 주택형별 정보 캐시 (공고가 나온 뒤엔 잘 바뀌지 않는다) ──────────
export async function loadModelCache(key: string): Promise<HouseModel[] | null> {
  return readJson<HouseModel[] | null>(K.model(key), null);
}

export async function saveModelCache(key: string, models: HouseModel[]) {
  await writeJson(K.model(key), models);
}

// ── 알림내역 ─────────────────────────────────────────────────
const MAX_LOG = 200;

export async function loadAlertLog(): Promise<AlertLogEntry[]> {
  return readJson(K.log, []);
}

export async function appendAlertLog(entries: Omit<AlertLogEntry, 'id'>[]) {
  if (entries.length === 0) return;
  const log = await loadAlertLog();
  const stamped = entries.map((e, i) => ({ ...e, id: `${e.at}-${i}-${Math.random().toString(36).slice(2, 7)}` }));
  await writeJson(K.log, [...stamped.reverse(), ...log].slice(0, MAX_LOG));
}

export async function clearAlertLog() {
  await writeJson(K.log, []);
}

// ── 마지막 확인 결과 ─────────────────────────────────────────
export async function loadLastCheck(): Promise<CheckResult | null> {
  return readJson<CheckResult | null>(K.lastCheck, null);
}

export async function saveLastCheck(result: CheckResult) {
  await writeJson(K.lastCheck, result);
}

// ── 예시 데이터 모드 ─────────────────────────────────────────
export async function loadDemo(): Promise<boolean> {
  return readJson(K.demo, false);
}

export async function saveDemo(on: boolean) {
  await writeJson(K.demo, on);
}
