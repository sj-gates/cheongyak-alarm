import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { syncBackgroundTask } from './background';
import { categoriesForKinds } from './categories';
import { runCheck } from './check';
import { ensurePermission, rescheduleFavoriteAlerts } from './notifications';
import { DEMO_PREFIX, sampleNotices } from './sample';
import {
  DEFAULT_SETTINGS,
  getServiceKey,
  loadDemo,
  loadFavorites,
  loadLastCheck,
  loadNoticeCache,
  loadSeen,
  loadSettings,
  saveDemo,
  saveFavorites,
  saveSettings,
  setServiceKey,
} from './storage';
import type { CheckResult, Notice, Settings } from './types';

const AUTO_REFRESH_MS = 30 * 60 * 1000;
const NEW_WINDOW_MS = 48 * 60 * 60 * 1000;

interface AppStore {
  ready: boolean;
  settings: Settings;
  hasKey: boolean;
  demo: boolean;
  notices: Notice[];
  fetchedAt: number | null;
  favorites: Record<string, Notice>;
  /** 최근 48시간 안에 처음 본 공고 (NEW 표시) */
  newKeys: Set<string>;
  lastCheck: CheckResult | null;
  refreshing: boolean;
  refresh: () => Promise<CheckResult | null>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  toggleFavorite: (n: Notice) => Promise<boolean>;
  saveKey: (key: string | null) => Promise<void>;
  setDemo: (on: boolean) => Promise<void>;
  findNotice: (key: string) => Notice | undefined;
}

const Ctx = createContext<AppStore | null>(null);

export function useApp(): AppStore {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider 안에서만 쓸 수 있어요');
  return v;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [hasKey, setHasKey] = useState(false);
  const [demo, setDemoState] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [favorites, setFavorites] = useState<Record<string, Notice>>({});
  const [newKeys, setNewKeys] = useState<Set<string>>(new Set());
  const [lastCheck, setLastCheck] = useState<CheckResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const settingsRef = useRef(settings);
  const favoritesRef = useRef(favorites);
  const refreshingRef = useRef(false);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  /** runCheck 가 저장소에 쓴 결과를 화면 상태로 다시 읽어온다 */
  const reloadFromStorage = useCallback(async () => {
    const [cache, favs, seenState, last] = await Promise.all([
      loadNoticeCache(),
      loadFavorites(),
      loadSeen(),
      loadLastCheck(),
    ]);
    if (cache) {
      setNotices(cache.notices);
      setFetchedAt(cache.fetchedAt);
    }
    setFavorites(favs);
    const since = Date.now() - NEW_WINDOW_MS;
    setNewKeys(new Set(Object.keys(seenState.keys).filter((k) => seenState.keys[k] > since)));
    setLastCheck(last);
  }, []);

  const refresh = useCallback(async (): Promise<CheckResult | null> => {
    if (refreshingRef.current) return null;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const key = await getServiceKey();
      if (!key) {
        if (await loadDemo()) {
          setNotices(sampleNotices());
          setFetchedAt(Date.now());
        }
        return null;
      }
      const result = await runCheck({ notify: true });
      await reloadFromStorage();
      return result;
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [reloadFromStorage]);

  const clearDemoFavorites = useCallback(async () => {
    // ref 는 렌더 뒤에야 따라오므로 저장소에서 직접 읽는다 (실제 찜을 지우지 않게)
    const current = await loadFavorites();
    const favs = Object.fromEntries(
      Object.entries(current).filter(([, n]) => !n.houseManageNo.startsWith(DEMO_PREFIX))
    );
    setFavorites(favs);
    favoritesRef.current = favs;
    await saveFavorites(favs);
    await rescheduleFavoriteAlerts(Object.values(favs), settingsRef.current).catch(() => 0);
  }, []);

  // 처음 실행: 저장된 것부터 보여주고, 오래됐으면 새로 받아온다
  useEffect(() => {
    (async () => {
      const [s, key, demoOn] = await Promise.all([loadSettings(), getServiceKey(), loadDemo()]);
      setSettings(s);
      setHasKey(!!key);
      setDemoState(!key && demoOn);
      await reloadFromStorage();
      // 예시 데이터로 보다가 기본 키가 생긴 경우: 예시로 찜한 공고는 정리
      if (key && demoOn) {
        await saveDemo(false);
        await clearDemoFavorites();
      }
      if (!key && demoOn) {
        setNotices(sampleNotices());
        setFetchedAt(Date.now());
      }
      setReady(true);

      await ensurePermission().catch(() => false);
      if (key) {
        await syncBackgroundTask(s, true).catch(() => {});
        const cache = await loadNoticeCache();
        if (!cache || Date.now() - cache.fetchedAt > AUTO_REFRESH_MS) refresh();
      }
    })();
  }, [refresh, reloadFromStorage, clearDemoFavorites]);

  // 다시 앱으로 돌아오면 30분 지났을 때 새로고침
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      await reloadFromStorage();
      const cache = await loadNoticeCache();
      if (cache && Date.now() - cache.fetchedAt > AUTO_REFRESH_MS) refresh();
    });
    return () => sub.remove();
  }, [refresh, reloadFromStorage]);

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const prev = settingsRef.current;
      const next = { ...prev, ...patch };
      setSettings(next);
      settingsRef.current = next;
      await saveSettings(next);

      const timingChanged =
        prev.dayBeforeAlert !== next.dayBeforeAlert ||
        prev.dayBeforeHour !== next.dayBeforeHour ||
        prev.dayOfAlert !== next.dayOfAlert ||
        prev.dayOfHour !== next.dayOfHour;
      if (timingChanged) {
        await rescheduleFavoriteAlerts(Object.values(favoritesRef.current), next).catch(() => 0);
      }
      const key = await getServiceKey();
      if (key && prev.checkIntervalHours !== next.checkIntervalHours) {
        await syncBackgroundTask(next, true).catch(() => {});
      }
      const fetchChanged =
        categoriesForKinds(prev.kinds).join() !== categoriesForKinds(next.kinds).join() ||
        prev.lookbackDays !== next.lookbackDays;
      if (key && fetchChanged) refresh();
    },
    [refresh]
  );

  const toggleFavorite = useCallback(async (n: Notice) => {
    const favs = { ...favoritesRef.current };
    const on = !favs[n.key];
    if (on) favs[n.key] = n;
    else delete favs[n.key];
    setFavorites(favs);
    favoritesRef.current = favs;
    await saveFavorites(favs);
    await rescheduleFavoriteAlerts(Object.values(favs), settingsRef.current).catch(() => 0);
    return on;
  }, []);

  const saveKey = useCallback(
    async (key: string | null) => {
      const trimmed = key?.trim() || null;
      await setServiceKey(trimmed);
      // 직접 입력한 키를 지워도 앱 기본 키가 있으면 계속 쓴다
      const effective = await getServiceKey();
      setHasKey(!!effective);
      if (effective) {
        await saveDemo(false);
        setDemoState(false);
        await clearDemoFavorites();
        setNotices([]);
        await syncBackgroundTask(settingsRef.current, true).catch(() => {});
        await refresh();
      } else {
        await syncBackgroundTask(settingsRef.current, false).catch(() => {});
      }
    },
    [clearDemoFavorites, refresh]
  );

  const setDemo = useCallback(
    async (on: boolean) => {
      await saveDemo(on);
      setDemoState(on);
      if (on) {
        setNotices(sampleNotices());
        setFetchedAt(Date.now());
      } else {
        setNotices([]);
        setFetchedAt(null);
        await clearDemoFavorites();
      }
    },
    [clearDemoFavorites]
  );

  const findNotice = useCallback(
    (key: string) => notices.find((n) => n.key === key) ?? favorites[key],
    [notices, favorites]
  );

  const value = useMemo<AppStore>(
    () => ({
      ready,
      settings,
      hasKey,
      demo,
      notices,
      fetchedAt,
      favorites,
      newKeys,
      lastCheck,
      refreshing,
      refresh,
      updateSettings,
      toggleFavorite,
      saveKey,
      setDemo,
      findNotice,
    }),
    [
      ready,
      settings,
      hasKey,
      demo,
      notices,
      fetchedAt,
      favorites,
      newKeys,
      lastCheck,
      refreshing,
      refresh,
      updateSettings,
      toggleFavorite,
      saveKey,
      setDemo,
      findNotice,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
