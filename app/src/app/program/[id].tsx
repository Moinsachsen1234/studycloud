import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk, useProgram } from '@/lib/queries';
import { useI18n } from '@/lib/i18n';
import { formatDateTime } from '@/lib/format';
import { Badge, Button, Card, ErrorNotice, Icon, InfoNotice, ProgressBar, Row, SkeletonCard, Text } from '@/components/ui';
import { Screen, SectionHeader, Sheet } from '@/components/forms';
import { Header } from '@/components/common';
import { SourceList } from '@/components/sources';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing } from '@/theme/tokens';

export default function ProgramScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, timeZone, errorText } = useI18n();
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useProgram(id);
  const p = q.data;
  const [confirm, setConfirm] = useState(false);

  const statusIcon = (s: string) => (s === 'completed' ? { n: 'checkmark-circle', c: colors.success } : s === 'in_progress' ? { n: 'play-circle', c: colors.info } : { n: 'ellipse-outline', c: colors.textMuted });
  return (
    <Screen>
      <Header title={p?.title} />
      {q.isPending ? <SkeletonCard /> : null}
      {q.isError ? <ErrorNotice message={errorText(q.error)} onRetry={() => q.refetch()} retryLabel={t('common.retry')} /> : null}
      {p ? (
        <>
          <Card>
            <Text variant="title" accessibilityRole="header">
              {p.title}
            </Text>
            <Text>{p.description}</Text>
            <Row wrap gap={8}>
              <Badge tone="brand" icon="time-outline" label={t('program.estimated', { n: p.estimatedMinutes })} />
              <Badge tone="neutral" icon="school-outline" label={t('program.grade', { a: p.gradeMin, b: p.gradeMax })} />
              <Badge tone={p.sourceMode === 'materials_only' ? 'neutral' : 'success'} icon={p.sourceMode === 'materials_only' ? 'document-text' : 'shield-checkmark'} label={t(p.sourceMode === 'materials_only' ? 'gen.modeMaterials' : 'gen.modeResearch')} />
            </Row>
            <ProgressBar value={p.progress.total ? p.progress.completed / p.progress.total : 0} label={t('subjects.progress')} />
            <Text variant="caption" muted>
              {p.progress.completed}/{p.progress.total} {t('program.lessons')}
            </Text>
          </Card>

          {p.warnings.length ? (
            <Card tint>
              <Row>
                <Icon name="shield-half-outline" color={colors.warning} />
                <Text variant="bodyStrong">{t('program.warnings')}</Text>
              </Row>
              <Text variant="caption">{t('program.warningsIntro')}</Text>
              {p.warnings.map((w, i) => (
                <Text key={i} variant="caption" muted>
                  • {w}
                </Text>
              ))}
            </Card>
          ) : null}

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title={t('program.lessons')} />
            {p.lessons.map((l) => {
              const si = statusIcon(l.status);
              return (
                <Pressable key={l.id} accessibilityRole="button" accessibilityLabel={`${l.ordinal + 1}. ${l.title} – ${t(`program.status.${l.status}` as any)}`} onPress={() => router.push(`/lesson/${l.id}`)}>
                  <Card>
                    <Row>
                      <Icon name={si.n} color={si.c} size={26} />
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyStrong">
                          {l.ordinal + 1}. {l.title}
                        </Text>
                        <Text variant="caption" muted>
                          {t('common.minutes', { n: l.estimatedMinutes })} · {t(`program.status.${l.status}` as any)}
                        </Text>
                      </View>
                      <Icon name="chevron-forward" size={18} color={colors.textMuted} />
                    </Row>
                  </Card>
                </Pressable>
              );
            })}
          </View>

          {p.objectives.length ? (
            <View style={{ gap: spacing.sm }}>
              <SectionHeader title={t('program.objectives')} />
              {p.objectives.map((o) => (
                <Row key={o.id} style={{ alignItems: 'flex-start' }}>
                  <Icon name="flag-outline" size={18} />
                  <Text style={{ flex: 1 }}>{o.text}</Text>
                </Row>
              ))}
            </View>
          ) : null}

          <Button variant="secondary" icon="chatbubble-ellipses" title={t('program.askCloudy')} onPress={() => router.push({ pathname: '/tutor', params: { programId: p.id } })} />

          <SourceList sources={p.sources} />

          <InfoNotice
            icon="hardware-chip-outline"
            message={[p.generation.provider ? t('program.generatedBy', { provider: p.generation.provider, model: p.generation.model ?? '' }) : null, formatDateTime(p.generation.generated_at, lang, timeZone)].filter(Boolean).join(' · ')}
          />
          <Button variant="ghost" icon="trash-outline" title={t('program.delete')} onPress={() => setConfirm(true)} />
          <Sheet visible={confirm} onClose={() => setConfirm(false)} title={t('program.delete')}>
            <Button full variant="danger" title={t('common.delete')} onPress={async () => { await api(`/api/programs/${id}`, { method: 'DELETE' }); await Promise.all([qc.invalidateQueries({ queryKey: qk.programs }), qc.invalidateQueries({ queryKey: qk.dashboard }), qc.invalidateQueries({ queryKey: qk.subjects })]); setConfirm(false); router.replace('/'); }} />
            <Button full variant="ghost" title={t('common.cancel')} onPress={() => setConfirm(false)} />
          </Sheet>
        </>
      ) : null}
    </Screen>
  );
}
