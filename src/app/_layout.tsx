import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { configureNotificationHandler, isNative } from '@/lib/notifications';
import { AppProvider } from '@/lib/store';
import { useColors } from '@/theme';

configureNotificationHandler();

/** 알림을 누르면 해당 공고 상세로 이동 */
function useNotificationNavigation() {
  useEffect(() => {
    if (!isNative) return;
    const open = (response: Notifications.NotificationResponse | null) => {
      const key = response?.notification.request.content.data?.noticeKey;
      if (typeof key === 'string' && key) router.push(`/notice/${key}`);
    };
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) {
        open(r);
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
      }
    });
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}

export default function RootLayout() {
  const c = useColors();
  const scheme = useColorScheme();
  useNotificationNavigation();

  return (
    <AppProvider>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.bg },
          headerBackButtonDisplayMode: 'minimal',
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="notice/[key]" options={{ title: '공고 상세' }} />
      </Stack>
    </AppProvider>
  );
}
