import React, { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk, useAvailability, useExams, usePlan, useSubjects } from '@/lib/queries';
import { useI18n } from '@/lib/i18n';
import { addDaysIso, formatWeekday } from '@/lib/format';
import { Badge, Button, Card, Chip, ErrorNotice, Icon, InfoNotice, Row, SkeletonCard, Text } from '@/components/ui';
import { EmptyState, Input, Screen, SectionHeader, SelectField, Sheet } from '@/components/forms';
import { TopBar } from '@/components/common';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export default function Plan() {
  const { t, lang, errorText } = useI18n();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const exams = useExams();
  const avail = useAvailability();
  const plan = usePlan();
  const subjects = useSubjects();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [minutes, setMinutes] = useState<number[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const today = plan.data?.today ?? new Date().toISOString().slice(0, 10);
  const mins = minutes ?? avail.data?.minutes ?? [0, 0, 0, 0, 0, 0, 0];
  const dayNames = t('plan.days').split(',');
  const subjectOptions = (subjects.data?.subjects ?? []).filter((s) => s.selected).map((s) => ({ value: s.id, label: lang === 'en' ? s.nameEn : s.nameDe }));
  const subjName = (id: string | null) => { const s = subjects.data?.subjects.find((x) => x.id === id); return s ? (lang === 'en' ? s.nameEn : s.nameDe) : ''; };
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: qk.exams }), qc.invalidateQueries({ queryKey: qk.plan }), qc.invalidateQueries({ queryKey: qk.dashboard }), qc.invalidateQueries({ queryKey: qk.availability }), qc.invalidateQueries({ queryKey: qk.progress })]);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + 'T00:00:00Z'));

  async function addExam() {
    setErr(null);
    try {
      await api('/api/exams', { method: 'POST', body: { subjectId: subjectId ?? subjectOptions[0]?.value, title: title.trim(), examDate: date } });
      setAdding(false); setTitle(''); setDate('');
      await refresh();
    } catch (e) { setErr(errorText(e)); }
  }
  async function saveAvailability(next: number[]) {
    setMinutes(next);
    try { await api('/api/plan/availability', { method: 'PUT', body: { minutes: next } }); await qc.invalidateQueries({ queryKey: qk.availability }); } catch (e) { setErr(errorText(e)); }
  }
  async function generate() {
    setBusy(true); setErr(null); setInfo(null);
    try {
      const r = await api<{ created: number; unscheduledLessons: number; hasLessons: boolean }>('/api/plan/generate', { method: 'POST' });
      setInfo([t('plan.generated', { n: r.created }), r.unscheduledLessons ? t('plan.unscheduled', { n: r.unscheduledLessons }) : null, !r.hasLessons ? t('plan.noLessons') : null].filter(Boolean).join(' '));
      await refresh();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }
  async function patchItem(id: string, body: object) {
    try { await api(`/api/plan/items/${id}`, { method: 'PATCH', body }); await refresh(); } catch (e) { setErr(errorText(e)); }
  }

  const byDay = new Map<string, NonNullable<typeof plan.data>['items']>();
  plan.data?.items.forEach((i) => byDay.set(i.scheduledFor, [...(byDay.get(i.scheduledFor) ?? []), i]));

  return (
    <Screen>
      <TopBar title={t('plan.title')} />
      {err ? <ErrorNotice message={err} /> : null}
      {info ? <InfoNotice message={info} icon="checkmark-circle" /> : null}

      <View style={{ gap: spacing.sm }}>
        <SectionHeader title={t('plan.exams')} action={t('plan.addExam')} onAction={() => setAdding(true)} />
        {exams.isPending ? <SkeletonCard /> : null}
        {exams.data?.exams.map((e) => (
          <Card key={e.id}>
            <Row style={{ justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{e.title}</Text>
                <Text variant="caption" muted>{subjName(e.subjectId)} · {formatWeekday(e.examDate, lang)}</Text>
              </View>
              <Button small variant="ghost" icon="trash-outline" title={t('plan.deleteExam')} onPress={async () => { await api(`/api/exams/${e.id}`, { method: 'DELETE' }); await refresh(); }} accessibilityLabel={`${t('plan.deleteExam')}: ${e.title}`} />
            </Row>
          </Card>
        ))}
        {exams.data && !exams.data.exams.length ? <Text muted>{t('home.examsEmpty')}</Text> : null}
      </View>

      <Card>
        <Text variant="heading">{t('plan.availability')}</Text>
        <Text variant="caption" muted>{t('plan.availabilityHint')}</Text>
        {mins.map((m, i) => (
          <Row key={i} style={{ justifyContent: 'space-between' }}>
            <Text variant="bodyStrong" style={{ width: 40 }}>{dayNames[i]}</Text>
            <Row gap={6}>
              <Button small variant="secondary" title="−15" accessibilityLabel={`${dayNames[i]} −15`} onPress={() => saveAvailability(mins.map((x, j) => (j === i ? Math.max(0, x - 15) : x)))} />
              <Text style={{ minWidth: 72, textAlign: 'center' }} accessibilityLabel={`${dayNames[i]}: ${m}`}>{t('common.minutes', { n: m })}</Text>
              <Button small variant="secondary" title="+15" accessibilityLabel={`${dayNames[i]} +15`} onPress={() => saveAvailability(mins.map((x, j) => (j === i ? Math.min(600, x + 15) : x)))} />
            </Row>
          </Row>
        ))}
        <Button full icon="sparkles" title={plan.data?.items.length ? t('plan.regenerate') : t('plan.generate')} loading={busy} onPress={generate} />
      </Card>

      <View style={{ gap: spacing.md }}>
        {plan.isPending ? <SkeletonCard /> : null}
        {plan.data && !plan.data.items.length ? <EmptyState title={t('plan.title')} text={t('plan.empty')} /> : null}
        {[...byDay.entries()].map(([day, items]) => (
          <View key={day} style={{ gap: spacing.sm }}>
            <Text variant="label" muted accessibilityRole="header">{day === today ? '● ' : ''}{formatWeekday(day, lang)}</Text>
            {items.map((i) => (
              <Card key={i.id}>
                <Row style={{ alignItems: 'flex-start' }}>
                  <Icon name={i.status === 'done' ? 'checkmark-circle' : i.status === 'skipped' ? 'remove-circle-outline' : 'ellipse-outline'} size={26} color={i.status === 'done' ? colors.success : colors.textMuted} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong" style={i.status !== 'planned' ? { textDecorationLine: 'line-through' } : undefined}>{i.title}</Text>
                    <Text variant="caption" muted>{subjName(i.subjectId)} · {t('common.minutes', { n: i.minutes })}</Text>
                    <Row wrap gap={6}>
                      {i.kind === 'revision' ? <Badge tone="brand" icon="repeat" label={t('plan.revision')} /> : null}
                      {i.rescheduledFrom ? <Badge tone="neutral" icon="swap-horizontal" label={t('plan.rescheduledFrom', { d: i.rescheduledFrom })} /> : null}
                    </Row>
                  </View>
                </Row>
                <Row wrap>
                  {i.status === 'planned' ? (
                    <>
                      <Button small icon="checkmark" title={t('plan.done')} onPress={() => patchItem(i.id, { status: 'done' })} />
                      <Button small variant="secondary" icon="arrow-forward" title={t('plan.tomorrow')} onPress={() => patchItem(i.id, { scheduledFor: addDaysIso(i.scheduledFor < today ? today : i.scheduledFor, 1) })} />
                      <Button small variant="ghost" title={t('plan.skip')} onPress={() => patchItem(i.id, { status: 'skipped' })} />
                    </>
                  ) : (
                    <Button small variant="ghost" icon="refresh" title={t('plan.reopen')} onPress={() => patchItem(i.id, { status: 'planned' })} />
                  )}
                </Row>
              </Card>
            ))}
          </View>
        ))}
      </View>

      <Sheet visible={adding} onClose={() => setAdding(false)} title={t('plan.addExam')}>
        <SelectField label={t('upload.subject')} value={subjectId ?? subjectOptions[0]?.value ?? null} options={subjectOptions} onChange={setSubjectId} />
        <Input label={t('plan.examTitle')} value={title} onChangeText={setTitle} maxLength={100} />
        <Input label={t('plan.examDate')} value={date} onChangeText={setDate} placeholder="2026-12-01" autoCapitalize="none" error={date && !validDate ? t('err.VALIDATION_ERROR') : null} />
        <Row wrap gap={8}>
          {[7, 14, 28].map((n) => (
            <Chip key={n} label={t(n === 7 ? 'plan.quick1w' : n === 14 ? 'plan.quick2w' : 'plan.quick4w')} onPress={() => setDate(addDaysIso(today, n))} />
          ))}
        </Row>
        {err ? <ErrorNotice message={err} /> : null}
        <Button full title={t('plan.addExam')} disabled={!title.trim() || !validDate} onPress={addExam} />
      </Sheet>
    </Screen>
  );
}
