import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk, useSubjects } from '@/lib/queries';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, Card, Chip, ErrorNotice, Icon, Row, SkeletonCard, Text } from '@/components/ui';
import { Input, Screen, Sheet } from '@/components/forms';
import { SubjectTile, TopBar } from '@/components/common';
import { spacing } from '@/theme/tokens';

const COLORS = ['#6A50D8', '#1F6FDB', '#D2432E', '#238A5B', '#A35F00', '#B83D78', '#0E8499'];
const ICONS = ['school-outline', 'musical-notes-outline', 'globe-outline', 'color-palette-outline', 'code-slash-outline', 'barbell-outline', 'earth-outline', 'library-outline'];

export default function Subjects() {
  const { t, lang, errorText } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useSubjects();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(ICONS[0]);
  const [err, setErr] = useState<string | null>(null);

  async function toggle(id: string, selected: boolean) {
    const ids = (q.data?.subjects ?? []).filter((s) => (s.id === id ? !selected : s.selected)).map((s) => s.id);
    try {
      await api('/api/me/subjects', { method: 'PUT', body: { subjectIds: ids } });
      await Promise.all([qc.invalidateQueries({ queryKey: qk.subjects }), qc.invalidateQueries({ queryKey: qk.dashboard }), qc.invalidateQueries({ queryKey: qk.me })]);
    } catch (e) {
      setErr(errorText(e));
    }
  }
  async function create() {
    try {
      await api('/api/subjects', { method: 'POST', body: { name: name.trim(), color, icon } });
      setAdding(false);
      setName('');
      await Promise.all([qc.invalidateQueries({ queryKey: qk.subjects }), qc.invalidateQueries({ queryKey: qk.dashboard })]);
    } catch (e) {
      setErr(errorText(e));
    }
  }
  return (
    <Screen>
      <TopBar title={t('subjects.title')} />
      {err ? <ErrorNotice message={err} /> : null}
      {q.isPending ? <SkeletonCard /> : null}
      {q.isError ? <ErrorNotice message={errorText(q.error)} onRetry={() => q.refetch()} retryLabel={t('common.retry')} /> : null}
      {q.data?.subjects.map((s) => (
        <Card key={s.id}>
          <Row>
            <Row style={{ flex: 1 }} gap={spacing.md}>
              <SubjectTile icon={s.icon} color={s.color} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{lang === 'en' ? s.nameEn : s.nameDe}</Text>
                <Text variant="caption" muted>
                  {t('subjects.counts', { d: s.documentCount, p: s.programCount })}
                </Text>
              </View>
            </Row>
            {s.selected ? <Badge tone="brand" icon="checkmark" label={t('subjects.selected')} /> : null}
          </Row>
          <Row wrap>
            <Button small variant="secondary" title={t('common.open')} icon="arrow-forward" onPress={() => router.push(`/subject/${s.id}`)} accessibilityLabel={`${t('common.open')}: ${lang === 'en' ? s.nameEn : s.nameDe}`} />
            <Button small variant="ghost" title={s.selected ? t('subjects.selected') : t('subjects.select')} icon={s.selected ? 'checkbox' : 'square-outline'} onPress={() => toggle(s.id, s.selected)} accessibilityLabel={`${lang === 'en' ? s.nameEn : s.nameDe}: ${s.selected ? t('subjects.selected') : t('subjects.select')}`} />
          </Row>
        </Card>
      ))}
      <Button variant="secondary" icon="add" title={t('subjects.addCustom')} onPress={() => setAdding(true)} />
      <Sheet visible={adding} onClose={() => setAdding(false)} title={t('subjects.addCustom')}>
        <Input label={t('subjects.name')} value={name} onChangeText={setName} maxLength={40} />
        <Row wrap gap={8}>
          {COLORS.map((c) => (
            <Chip key={c} label={c} selected={c === color} onPress={() => setColor(c)} />
          ))}
        </Row>
        <Row wrap gap={8}>
          {ICONS.map((i) => (
            <Chip key={i} icon={i} label="" selected={i === icon} onPress={() => setIcon(i)} />
          ))}
        </Row>
        <Button full title={t('common.add')} disabled={!name.trim()} onPress={create} />
      </Sheet>
    </Screen>
  );
}
