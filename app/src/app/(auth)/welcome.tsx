import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Cloudy } from '@/components/Cloudy';
import { Button, Icon, Row, Text } from '@/components/ui';
import { Screen } from '@/components/forms';
import { useI18n } from '@/lib/i18n';
import { useCapabilities } from '@/lib/queries';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';
import { InfoNotice } from '@/components/ui';

export default function Welcome() {
  const { t, lang, setLang } = useI18n();
  const { colors } = useTheme();
  const router = useRouter();
  const caps = useCapabilities();
  return (
    <Screen maxWidth={520}>
      <Row style={{ justifyContent: 'flex-end' }}>
        <Button small variant="ghost" title={lang === 'de' ? 'English' : 'Deutsch'} onPress={() => setLang(lang === 'de' ? 'en' : 'de')} accessibilityLabel={lang === 'de' ? 'Switch to English' : 'Auf Deutsch wechseln'} />
      </Row>
      <View style={{ alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl }}>
        <Cloudy state="happy" size={150} />
        <Text variant="display" style={{ textAlign: 'center' }} accessibilityRole="header">
          {t('app.name')}
        </Text>
        <Text variant="heading" style={{ textAlign: 'center' }}>
          {t('auth.welcomeTitle')}
        </Text>
        <Text muted style={{ textAlign: 'center' }}>
          {t('auth.welcomeText')}
        </Text>
      </View>
      <Button full title={t('auth.register')} onPress={() => router.push('/(auth)/register')} />
      <Button full variant="ghost" title={t('auth.login')} onPress={() => router.push('/(auth)/login')} />
      <View style={{ gap: spacing.sm, padding: spacing.lg, borderRadius: 16, backgroundColor: colors.surfaceAlt }}>
        <Row>
          <Icon name="lock-closed" size={18} color={colors.accentText} />
          <Text variant="bodyStrong">{t('auth.privacyTitle')}</Text>
        </Row>
        <Text variant="caption">{t('auth.privacyBody')}</Text>
      </View>
      {caps.isError ? <InfoNotice tone="warning" message={t('err.NETWORK')} icon="cloud-offline" /> : null}
    </Screen>
  );
}
