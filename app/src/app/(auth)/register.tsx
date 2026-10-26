import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useCapabilities } from '@/lib/queries';
import { Button, ErrorNotice, InfoNotice, Row, Text, Icon } from '@/components/ui';
import { CheckRow, Input, Screen } from '@/components/forms';
import { Cloudy } from '@/components/Cloudy';

export default function Register() {
  const { t, errorText } = useI18n();
  const { signIn } = useAuth();
  const router = useRouter();
  const caps = useCapabilities();
  const consentAge = caps.data?.digitalConsentAge ?? 16;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [privacy, setPrivacy] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const [ai, setAi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const year = parseInt(birthYear, 10);
  const yearOk = Number.isFinite(year) && year >= 1900 && year <= new Date().getFullYear() - 5;
  const minor = yearOk && new Date().getFullYear() - year < consentAge;
  const pwOk = password.length >= 10;
  const canSubmit = /.+@.+\..+/.test(email) && pwOk && yearOk && privacy && (!minor || guardian);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string }>('/api/auth/register', { method: 'POST', auth: false, body: { email, password, birthYear: year, acceptPrivacy: true, guardianConsent: minor ? guardian : undefined, aiConsent: ai } });
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
        <Cloudy state="happy" size={64} />
        <Text variant="title" accessibilityRole="header">
          {t('auth.register')}
        </Text>
      </Row>
      <Input label={t('auth.email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <Input label={t('auth.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" hint={t('auth.passwordHint')} error={password && !pwOk ? t('auth.passwordHint') : null} />
      <Input label={t('auth.birthYear')} value={birthYear} onChangeText={(v) => setBirthYear(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" hint={t('auth.birthYearHint')} />
      <CheckRow checked={privacy} onChange={setPrivacy} label={t('auth.acceptPrivacy')} />
      {minor ? <CheckRow checked={guardian} onChange={setGuardian} label={t('auth.guardian', { age: consentAge })} /> : null}
      <CheckRow checked={ai} onChange={setAi} label={t('auth.aiConsent')} />
      <InfoNotice message={t('auth.privacyBody')} icon="lock-closed" />
      {error ? <ErrorNotice message={error} /> : null}
      <Button full title={t('auth.register')} loading={busy} disabled={!canSubmit} onPress={submit} />
    </Screen>
  );
}
