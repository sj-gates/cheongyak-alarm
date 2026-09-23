import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { runCheck } from './check';
import { isNative } from './notifications';
import type { Settings } from './types';

export const CHECK_TASK = 'cheongyak-check';

// 전역에서 정의해야 앱이 꺼져 있을 때 시스템이 깨워도 찾을 수 있다 (index.ts 에서 import)
if (isNative) {
  TaskManager.defineTask(CHECK_TASK, async () => {
    try {
      const result = await runCheck({ notify: true });
      return result.ok
        ? BackgroundTask.BackgroundTaskResult.Success
        : BackgroundTask.BackgroundTaskResult.Failed;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
}

/** 설정한 주기로 백그라운드 확인을 등록한다 (다시 등록하면 주기가 바뀐다) */
export async function syncBackgroundTask(settings: Settings, enabled: boolean) {
  if (!isNative) return;
  const registered = await TaskManager.isTaskRegisteredAsync(CHECK_TASK);
  if (enabled) {
    await BackgroundTask.registerTaskAsync(CHECK_TASK, {
      minimumInterval: Math.max(15, settings.checkIntervalHours * 60),
    });
  } else if (registered) {
    await BackgroundTask.unregisterTaskAsync(CHECK_TASK);
  }
}

export interface BackgroundInfo {
  available: boolean;
  registered: boolean;
}

export async function getBackgroundInfo(): Promise<BackgroundInfo> {
  if (!isNative) return { available: false, registered: false };
  const status = await BackgroundTask.getStatusAsync();
  const registered = await TaskManager.isTaskRegisteredAsync(CHECK_TASK);
  return { available: status === BackgroundTask.BackgroundTaskStatus.Available, registered };
}
