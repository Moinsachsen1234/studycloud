import React, { useEffect, useState } from 'react';
import { Platform, Share, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { qk, useCapabilities, useSchools, useSubjects } from '@/lib/queries';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { Button, Card, Chip, ErrorNotice, InfoNotice, Row, Text } from '@/components/ui';
import { Input, Screen, SectionHeader, SelectField, Sheet, ToggleRow } from '@/components/forms';
import { Header } from '@/components/common';
import { spacing, subjectColor } from '@/theme/tokens';
import type { Lang } from '@/lib/types';

export default function Settings() {
  const { t, lang, setLang, errorText } = useI18n();
  const { preference, setPreference, scheme } = useTheme();
  const { me, signOut, refreshMe } = useAuth();
  const caps = useCapabilities();
  const schools = useSchools();
  const subjects = useSubjects();
  const qc = useQueryClient();
  const p = me?.profile;
  const [name, setName] = useState(p?.displayName ?? '');
  const [grade, setGrade] = useState<number>(p?.grade ?? 8);
  const [stateId, setStateId] = useState<string | null>(p?.federalState ?? null);
  const [schoolType, setSchoolType] = useState<string | null>(p?.schoolType ?? null);
  const [subjectIds, setSubjectIds] = useState<string[]>(me?.subjectIds ?? []);
  const [uiLang, setUiLang] = useState<Lang>(p?.uiLanguage ?? lang);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [pw, setPw] = useState('');

  useEffect(() => {
    if (me?.profile) {
      setName(me.profile.displayName); setGrade(me.profile.grade); setStateId(me.profile.federalState); setSchoolType(me.profile.schoolType); setUiLang(me.profile.uiLanguage); setSubjectIds(me.subjectIds);
    }
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const state = schools.data?.federalStates.find((s) => s.id === stateId);
  async function saveProfile() {
    setErr(null); setMsg(null);
    try {
      await api('/api/me/profile', { method: 'PUT', body: { displayName: name.trim(), grade, uiLanguage: uiLang, timeZone: p?.timeZone ?? 'Europe/Berlin', learningGoals: p?.learningGoals ?? [], federalState: stateId, schoolType, subjectIds } });
      setLang(uiLang);
      await Promise.all([refreshMe(), qc.invalidateQueries({ queryKey: qk.subjects }), qc.invalidateQueries({ queryKey: qk.dashboard })]);
      setMsg(t('settings.saved'));
    } catch (e) { setErr(errorText(e)); }
  }
  async function toggleAi(v: boolean) {
    setErr(null);
    try { await api('/api/me/consents', { method: 'POST', body: { kind: 'ai_processing', granted: v } }); await refreshMe(); } catch (e) { setErr(errorText(e)); }
  }
  async function exportData() {
    setErr(null);
    try {
      const data = await api('/api/me/export');
      const json = JSON.stringify(data, null, 2);
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url; a.download = 'studycloud-export.json'; a.click();
        URL.revokeObjectURL(url);
      } else await Share.share({ message: json, title: 'studycloud-export.json' });
      setMsg(t('settings.exportDone'));
    } catch (e) { setErr(errorText(e)); }
  }
  async function deleteAccount() {
    try { await api('/api/me', { method: 'DELETE', body: { password: pw } }); setDelOpen(false); await signOut(); } catch (e) { setErr(e instanceof ApiError ? errorText(e) : t('common.errorTitle')); }
  }

  return (
    <Screen>
      <Header title={t('settings.title')} />
      <Text variant="caption" muted>{me?.email}</Text>
      {msg ? <InfoNotice message={msg} icon="checkmark-circle" /> : null}
      {err ? <ErrorNotice message={err} /> : null}

      <Card>
        <Text variant="heading">{t('settings.profile')}</Text>
        <Input label={t('onb.name.ph')} value={name} onChangeText={setName} maxLength={40} />
        <SelectField label={t('onb.grade.q')} value={grade} options={Array.from({ length: 13 }, (_, i) => ({ value: i + 1, label: t('onb.grade', { n: i + 1 }) }))} onChange={setGrade} />
        <SelectField label={t('onb.state.q')} value={stateId} options={(schools.data?.federalStates ?? []).map((s) => ({ value: s.id, label: s.name }))} onChange={(v) => { setStateId(v); setSchoolType(null); }} />
        <SelectField label={t('onb.school.q')} value={schoolType} options={(state?.schoolTypes ?? []).map((s) => ({ value: s.id, label: s.name }))} onChange={setSchoolType} />
        <View style={{ gap: spacing.sm }}>
          <Text variant="label">{t('onb.subjects.q')}</Text>
          <Row wrap gap={8}>
            {subjects.data?.subjects.map((s) => (
              <Chip key={s.id} icon={s.icon} color={subjectColor(s.color, scheme)} label={lang === 'en' ? s.nameEn : s.nameDe} selected={subjectIds.includes(s.id)} onPress={() => setSubjectIds(subjectIds.includes(s.id) ? subjectIds.filter((x) => x !== s.id) : [...subjectIds, s.id])} />
            ))}
          </Row>
        </View>
        <View style={{ gap: spacing.sm }}>
          <Text variant="label">{t('settings.language')}</Text>
          <Row>{(['de', 'en'] as Lang[]).map((l) => <Chip key={l} label={l === 'de' ? 'Deutsch' : 'English'} selected={uiLang === l} onPress={() => setUiLang(l)} />)}</Row>
        </View>
        <Button full title={t('common.save')} disabled={!name.trim() || !stateId || !schoolType || !subjectIds.length} onPress={saveProfile} />
      </Card>

      <Card>
        <Text variant="heading">{t('settings.appearance')}</Text>
        <Row wrap>
          {(['system', 'light', 'dark'] as ThemePreference[]).map((p2) => <Chip key={p2} label={t(`settings.theme.${p2}` as any)} selected={preference === p2} onPress={() => setPreference(p2)} />)}
        </Row>
      </Card>

      <Card>
        <Text variant="heading">{t('settings.privacy')}</Text>
        <ToggleRow label={t('settings.aiConsent')} value={!!me?.consents.aiProcessing} onChange={toggleAi} description={caps.data?.ai.configured ? t('settings.aiProvider', { provider: caps.data.ai.provider ?? '' }) : t('settings.aiProviderNone')} />
        <Text variant="caption" muted>{t('auth.privacyBody')}</Text>
        <Button variant="secondary" icon="download-outline" title={t('settings.export')} onPress={exportData} />
        <InfoNotice tone="warning" message={t('settings.legalNote')} icon="alert-circle-outline" />
      </Card>

      <Card>
        <Button variant="ghost" icon="log-out-outline" title={t('auth.logout')} onPress={signOut} />
        <Button variant="danger" icon="trash" title={t('settings.deleteAccount')} onPress={() => setDelOpen(true)} />
      </Card>

      <Sheet visible={delOpen} onClose={() => setDelOpen(false)} title={t('settings.deleteAccount')}>
        <Text>{t('settings.deleteAccountText')}</Text>
        <Input label={t('auth.password')} value={pw} onChangeText={setPw} secureTextEntry />
        {err ? <ErrorNotice message={err} /> : null}
        <Button full variant="danger" title={t('settings.deleteConfirm')} disabled={!pw} onPress={deleteAccount} />
      </Sheet>
    </Screen>
  );
}
