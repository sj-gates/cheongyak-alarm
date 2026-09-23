import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { MAX_SCHEDULED, SCHEDULE_PREFIX, planFavoriteAlerts } from './alertPlan';
import type { Notice, Settings } from './types';

export const isNative = Platform.OS !== 'web';

const CHANNEL_NEW = 'new-notice';
const CHANNEL_SCHEDULE = 'schedule';

export function configureNotificationHandler() {
  if (!isNative) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function setupChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_NEW, {
    name: '새 청약 공고',
    description: '조건에 맞는 새 모집공고가 올라오면 알려요',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 200, 250],
    lightColor: '#2F6BFF',
  });
  await Notifications.setNotificationChannelAsync(CHANNEL_SCHEDULE, {
    name: '청약 일정',
    description: '찜한 공고의 접수·발표 일정을 전날과 당일에 알려요',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 200, 250],
    lightColor: '#FF7A1A',
  });
}

export type PermissionState = 'granted' | 'denied' | 'undetermined' | 'unsupported';

export async function getPermissionState(): Promise<PermissionState> {
  if (!isNative) return 'unsupported';
  const p = await Notifications.getPermissionsAsync();
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'undetermined' : 'denied';
}

/** 안드로이드 13+는 채널이 하나라도 있어야 권한 창이 뜬다 */
export async function ensurePermission(): Promise<boolean> {
  if (!isNative) return false;
  await setupChannels();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

export async function notifyNow(
  title: string,
  body: string,
  data: Record<string, unknown> = {},
  channel: 'new' | 'schedule' = 'new'
): Promise<boolean> {
  if (!isNative) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data, sound: true },
    trigger:
      Platform.OS === 'android'
        ? { channelId: channel === 'new' ? CHANNEL_NEW : CHANNEL_SCHEDULE }
        : null,
  });
  return true;
}

/** 예약 알림 경로가 실제로 동작하는지 보려고 몇 초 뒤 알림 하나를 잡는다 */
export async function scheduleTestAlert(seconds: number, title: string, body: string) {
  if (!isNative) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: {}, sound: true },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
      channelId: CHANNEL_SCHEDULE,
    },
  });
  return true;
}

/** 기존 일정 알림을 모두 지우고 다시 잡는다. 잡은 개수를 돌려준다. */
export async function rescheduleFavoriteAlerts(favorites: Notice[], s: Settings): Promise<number> {
  if (!isNative) return 0;
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    existing
      .filter((r) => r.identifier.startsWith(SCHEDULE_PREFIX))
      .map((r) => Notifications.cancelScheduledNotificationAsync(r.identifier))
  );

  const plans = planFavoriteAlerts(favorites, s).slice(0, MAX_SCHEDULED);
  for (const p of plans) {
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: { title: p.title, body: p.body, data: { noticeKey: p.noticeKey }, sound: true },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: p.at,
        channelId: CHANNEL_SCHEDULE,
      },
    });
  }
  return plans.length;
}
