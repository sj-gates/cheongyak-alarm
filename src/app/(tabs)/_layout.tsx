import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ColorValue } from 'react-native';

import type { IconName } from '@/components/ui';
import { useApp } from '@/lib/store';
import { useColors } from '@/theme';

function TabIcon({
  name,
  active,
  color,
  focused,
}: {
  name: IconName;
  active: IconName;
  color: ColorValue;
  focused: boolean;
}) {
  return <Ionicons name={focused ? active : name} size={23} color={color} />;
}

export default function TabLayout() {
  const c = useColors();
  const { favorites } = useApp();
  const favCount = Object.keys(favorites).length;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.faint,
        tabBarStyle: { backgroundColor: c.tabBar, borderTopColor: c.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '800', fontSize: 19 },
        headerTitleAlign: 'left',
        sceneStyle: { backgroundColor: c.bg },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: '청약 공고', tabBarLabel: '공고', tabBarIcon: (p) => <TabIcon name="home-outline" active="home" {...p} /> }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: '찜한 공고',
          tabBarLabel: '찜',
          tabBarIcon: (p) => <TabIcon name="star-outline" active="star" {...p} />,
          tabBarBadge: favCount > 0 ? favCount : undefined,
          tabBarBadgeStyle: { backgroundColor: c.accent, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: '설정', tabBarLabel: '설정', tabBarIcon: (p) => <TabIcon name="settings-outline" active="settings" {...p} /> }}
      />
    </Tabs>
  );
}
