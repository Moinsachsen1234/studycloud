import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Slot, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { AuthProvider, useAuth } from '@/lib/auth';
import { Cloudy } from '@/components/Cloudy';
import { Text } from '@/components/ui';

function Gate() {
  const { status, me } = useAuth();
  const { colors, scheme } = useTheme();
  const { setLang, setTimeZone, t } = useI18n();
  const router = useRouter();
  const segments = useSegments();
  const group = segments[0] as string | undefined;

  useEffect(() => {
    if (me?.profile) {
      setLang(me.profile.uiLanguage);
      setTimeZone(me.profile.timeZone);
    }
  }, [me?.profile?.uiLanguage, me?.profile?.timeZone]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'out' && group !== '(auth)') router.replace('/(auth)/welcome');
    else if (status === 'in' && me && !me.onboardingCompleted && group !== 'onboarding') router.replace('/onboarding');
    else if (status === 'in' && me?.onboardingCompleted && (group === '(auth)' || group === 'onboarding')) router.replace('/');
  }, [status, me?.onboardingCompleted, group]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === 'loading')
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 12 }} accessibilityLabel={t('common.loading')}>
        <Cloudy state="thinking" size={120} />
        <Text muted>{t('common.loading')}</Text>
      </View>
    );
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'default' }} />
    </>
  );
}

export default function RootLayout() {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: false } } }));
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <I18nProvider>
            <AuthProvider>
              <Gate />
            </AuthProvider>
          </I18nProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

export { Slot };
