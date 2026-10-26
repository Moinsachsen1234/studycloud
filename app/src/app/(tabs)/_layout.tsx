import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme/ThemeProvider';
import { useI18n } from '@/lib/i18n';
import { useIsWide } from '@/lib/hooks';

/**
 * Primary navigation: Home · Subjects · Upload · Study plan · AI tutor.
 * Bottom tab bar on phones, persistent left sidebar on tablets/desktop. Tabs stay mounted → state is preserved.
 */
export default function TabsLayout() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const wide = useIsWide();
  const icon = (name: string, focusedName: string) => ({ color, focused, size }: { color: string; focused: boolean; size: number }) => <Ionicons name={(focused ? focusedName : name) as any} color={color} size={size} />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentText,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderColor: colors.border, minHeight: 60, paddingTop: 4, paddingBottom: 8 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarPosition: wide ? 'left' : 'bottom',
        tabBarVariant: wide ? 'material' : 'uikit',
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: colors.bg },
      } as any}
    >
      <Tabs.Screen name="index" options={{ title: t('nav.home'), tabBarIcon: icon('home-outline', 'home'), tabBarAccessibilityLabel: t('nav.home') } as any} />
      <Tabs.Screen name="subjects" options={{ title: t('nav.subjects'), tabBarIcon: icon('grid-outline', 'grid'), tabBarAccessibilityLabel: t('nav.subjects') } as any} />
      <Tabs.Screen name="upload" options={{ title: t('nav.upload'), tabBarIcon: icon('cloud-upload-outline', 'cloud-upload'), tabBarAccessibilityLabel: t('nav.upload') } as any} />
      <Tabs.Screen name="plan" options={{ title: t('nav.plan'), tabBarIcon: icon('calendar-outline', 'calendar'), tabBarAccessibilityLabel: t('nav.plan') } as any} />
      <Tabs.Screen name="tutor" options={{ title: t('nav.tutor'), tabBarIcon: icon('chatbubble-ellipses-outline', 'chatbubble-ellipses'), tabBarAccessibilityLabel: t('nav.tutor') } as any} />
    </Tabs>
  );
}
