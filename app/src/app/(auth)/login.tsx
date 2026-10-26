import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Button, ErrorNotice, Row, Text, Icon } from '@/components/ui';
import { Input, Screen } from '@/components/forms';
import { Cloudy } from '@/components/Cloudy';

export default function Login() {
  const { t, errorText } = useI18n();
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string }>('/api/auth/login', { method: 'POST', body: { email, password }, auth: false });
      await signIn(r.token);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen maxWidth={480}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={{ minHeight: 48, justifyContent: 'center' }}>
        <Row gap={4}>
          <Icon name="chevron-back" />
          <Text>{t('common.back')}</Text>
        </Row>
      </Pressable>
      <Row>
        <Cloudy state="neutral" size={64} />
        <Text variant="title" accessibilityRole="header">
          {t('auth.login')}
        </Text>
      </Row>
      <Input label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <Input label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} />
      {error ? <ErrorNotice message={error} /> : null}
      <Button full title={t('auth.login')} loading={busy} disabled={!email || !password} onPress={submit} />
      <Button full variant="ghost" title={`${t('auth.noAccount')} ${t('auth.register')}`} onPress={() => router.replace('/(auth)/register')} />
    </Screen>
  );
}
