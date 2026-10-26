import React, { useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, fetchPrivateFileUri } from '@/lib/api';
import { qk, useCapabilities, useDocument } from '@/lib/queries';
import { useI18n } from '@/lib/i18n';
import { formatBytes, formatDateTime } from '@/lib/format';
import { Badge, Button, Card, Icon, InfoNotice, ErrorNotice, Row, SkeletonCard, Text } from '@/components/ui';
import { Input, Screen, SectionHeader, Sheet } from '@/components/forms';
import { DocStatusBadge, Header } from '@/components/common';
import { Cloudy } from '@/components/Cloudy';
import { useTheme } from '@/theme/ThemeProvider';
import { radius, spacing } from '@/theme/tokens';

type StepState = 'done' | 'active' | 'pending' | 'warn' | 'error';

export default function DocumentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, timeZone, errorText } = useI18n();
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const caps = useCapabilities();
  const q = useDocument(id);
  const d = q.data;
  const [rename, setRename] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mode, setMode] = useState<'materials_only' | 'materials_plus_research'>('materials_only');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<ApiError | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showAllText, setShowAllText] = useState(false);

  const text = useQuery({ queryKey: ['doc-text', id], queryFn: () => api<{ segments: { id: string; ordinal: number; page: number | null; heading: string | null; text: string }[] }>(`/api/documents/${id}/text`), enabled: d?.job?.status === 'completed' });

  const job = d?.job;
  const steps: { key: string; label: string; state: StepState; note?: string | null }[] = [{ key: 'stored', label: t('doc.step.stored'), state: 'done' }];
  if (job) {
    const read: StepState = job.status === 'failed' ? 'error' : job.status === 'completed' || job.status === 'analyzing' ? 'done' : job.status === 'processing' ? 'active' : 'pending';
    steps.push({ key: 'read', label: t('doc.step.read'), state: read, note: job.status === 'failed' ? job.errorMessage : null });
    const an: StepState = job.status === 'completed' ? (job.analysisState === 'done' ? 'done' : job.analysisState === 'failed' ? 'error' : 'warn') : job.status === 'analyzing' ? 'active' : 'pending';
    steps.push({ key: 'analyzed', label: t('doc.step.analyzed'), state: an, note: job.status === 'completed' ? job.analysisNote : null });
  }

  async function act(fn: () => Promise<unknown>) {
    await fn();
    await Promise.all([qc.invalidateQueries({ queryKey: qk.document(id) }), qc.invalidateQueries({ queryKey: ['documents'] }), qc.invalidateQueries({ queryKey: qk.dashboard })]);
  }

  async function generate() {
    setGenerating(true);
    setGenError(null);
    try {
      const r = await api<{ programId: string }>('/api/programs/generate', { method: 'POST', body: { documentIds: [id], sourceMode: mode, subjectId: d?.subjectId ?? undefined } });
      await Promise.all([qc.invalidateQueries({ queryKey: qk.programs }), qc.invalidateQueries({ queryKey: qk.dashboard }), qc.invalidateQueries({ queryKey: qk.document(id) })]);
      router.replace(`/program/${r.programId}`);
    } catch (e) {
      setGenError(e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', t('common.errorTitle')));
    } finally {
      setGenerating(false);
    }
  }

  async function loadPreview() {
    if (!d) return;
    try {
      setPreview(await fetchPrivateFileUri(d.id, d.mimeType));
    } catch (e) {
      setGenError(e instanceof ApiError ? e : null);
    }
  }

  const stateIcon: Record<StepState, { name: string; color: string }> = {
    done: { name: 'checkmark-circle', color: colors.success },
    active: { name: 'sync-circle', color: colors.info },
    pending: { name: 'ellipse-outline', color: colors.textMuted },
    warn: { name: 'alert-circle', color: colors.warning },
    error: { name: 'close-circle', color: colors.danger },
  };
  const segs = text.data?.segments ?? [];
  const shown = showAllText ? segs : segs.slice(0, 6);
  const canRetry = job && (job.status === 'failed' || (job.status === 'completed' && job.analysisState !== 'done'));

  return (
    <Screen>
      <Header title={d?.name} />
      {q.isPending ? <SkeletonCard /> : null}
      {q.isError ? <ErrorNotice message={errorText(q.error)} onRetry={() => q.refetch()} retryLabel={t('common.retry')} /> : null}
      {d ? (
        <>
          <Card>
            <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text variant="heading">{d.name}</Text>
                <Text variant="caption" muted>
                  {d.originalFilename} · {formatBytes(d.sizeBytes)} · {formatDateTime(d.createdAt, lang, timeZone)}
                </Text>
              </View>
              <DocStatusBadge status={job?.status} />
            </Row>
            <Row gap={6}>
              <Icon name="lock-closed" size={14} color={colors.accentText} />
              <Text variant="caption" muted>
                {t('doc.private')}
              </Text>
            </Row>
            <Row wrap>
              <Button small variant="secondary" icon="create-outline" title={t('doc.rename')} onPress={() => setRename(d.name)} />
              <Button small variant="ghost" icon="trash-outline" title={t('common.delete')} onPress={() => setConfirmDelete(true)} />
              {canRetry ? <Button small icon="refresh" title={t('doc.retry')} onPress={() => act(() => api(`/api/documents/${id}/retry`, { method: 'POST' }))} /> : null}
            </Row>
          </Card>

          <Card>
            <Text variant="heading">{t('doc.timeline')}</Text>
            {steps.map((s) => (
              <View key={s.key} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }} accessible accessibilityLabel={`${s.label}: ${s.state}${s.note ? ` – ${s.note}` : ''}`}>
                <Icon name={stateIcon[s.state].name} color={stateIcon[s.state].color} size={24} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{s.label}</Text>
                  {s.note ? (
                    <Text variant="caption" style={{ color: s.state === 'error' ? colors.danger : colors.textMuted }}>
                      {s.note}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
            {job ? (
              <Text variant="caption" muted>
                {t('doc.status.' + job.status as any)} · #{job.attempt}
              </Text>
            ) : null}
          </Card>

          {job?.status === 'completed' ? (
            <Card tint>
              <Row>
                <Cloudy state="happy" size={56} />
                <Text variant="heading" style={{ flex: 1 }}>
                  {t('gen.title')}
                </Text>
              </Row>
              <Text variant="label" muted>
                {t('gen.mode')}
              </Text>
              {(['materials_only', 'materials_plus_research'] as const).map((m) => {
                const selected = mode === m;
                const disabled = m === 'materials_plus_research' && caps.data && !caps.data.research.configured;
                return (
                  <Pressable key={m} disabled={!!disabled} accessibilityRole="radio" accessibilityState={{ selected, disabled: !!disabled }} accessibilityLabel={t(m === 'materials_only' ? 'gen.modeMaterials' : 'gen.modeResearch')} onPress={() => setMode(m)} style={{ padding: spacing.md, borderRadius: radius.md, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.accentText : colors.borderStrong, backgroundColor: colors.surface, opacity: disabled ? 0.5 : 1, gap: 2 }}>
                    <Row>
                      <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} color={selected ? colors.accentText : colors.textMuted} />
                      <Text variant="bodyStrong" style={{ flex: 1 }}>
                        {t(m === 'materials_only' ? 'gen.modeMaterials' : 'gen.modeResearch')}
                      </Text>
                    </Row>
                    <Text variant="caption" muted>
                      {t(m === 'materials_only' ? 'gen.modeMaterialsText' : 'gen.modeResearchText')}
                    </Text>
                  </Pressable>
                );
              })}
              {caps.data && !caps.data.ai.configured ? <InfoNotice tone="warning" message={t('err.AI_NOT_CONFIGURED')} /> : null}
              {generating ? <InfoNotice message={t('gen.working')} icon="hourglass" /> : null}
              {genError ? (
                <View style={{ gap: spacing.sm }}>
                  <ErrorNotice message={errorText(genError)} />
                  {genError.code === 'AI_CONSENT_REQUIRED' ? <Button small variant="secondary" title={t('gen.goSettings')} onPress={() => router.push('/settings')} /> : null}
                </View>
              ) : null}
              <Button full icon="sparkles" title={t('gen.start')} loading={generating} disabled={caps.data ? !caps.data.ai.configured : false} onPress={generate} />
            </Card>
          ) : null}

          {d.programs.length ? (
            <View style={{ gap: spacing.sm }}>
              <SectionHeader title={t('doc.programs')} />
              {d.programs.map((p) => (
                <Card key={p.id} onPress={() => router.push(`/program/${p.id}`)} accessibilityLabel={p.title}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text variant="bodyStrong" style={{ flex: 1 }}>
                      {p.title}
                    </Text>
                    <Icon name="chevron-forward" size={18} />
                  </Row>
                </Card>
              ))}
            </View>
          ) : null}

          {d.objectives.length || d.concepts.length ? (
            <Card>
              {d.objectives.length ? (
                <>
                  <Text variant="heading">{t('doc.objectives')}</Text>
                  {d.objectives.map((o) => (
                    <Row key={o.id} style={{ alignItems: 'flex-start' }}>
                      <Icon name="flag-outline" size={18} />
                      <Text style={{ flex: 1 }}>{o.text}</Text>
                    </Row>
                  ))}
                </>
              ) : null}
              {d.concepts.length ? (
                <>
                  <Text variant="heading">{t('doc.concepts')}</Text>
                  <Row wrap gap={8}>
                    {d.concepts.map((c) => (
                      <Badge key={c.id} tone={c.kind === 'misconception' ? 'warning' : 'brand'} label={c.name} />
                    ))}
                  </Row>
                </>
              ) : null}
            </Card>
          ) : null}

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title={t('doc.originalPreview')} />
            {preview ? (
              d.mimeType.startsWith('image/') ? (
                <Image source={{ uri: preview }} accessibilityLabel={d.name} style={{ width: '100%', height: 320, borderRadius: radius.md }} resizeMode="contain" />
              ) : d.mimeType === 'application/pdf' && Platform.OS === 'web' ? (
                React.createElement('iframe', { src: preview, title: d.name, style: { width: '100%', height: 480, border: 0, borderRadius: 12 }, sandbox: '' })
              ) : (
                <InfoNotice message={t('doc.noPreview')} />
              )
            ) : (
              <Button small variant="secondary" icon="eye-outline" title={t('doc.originalPreview')} onPress={loadPreview} />
            )}
          </View>

          {job?.status === 'completed' ? (
            <View style={{ gap: spacing.sm }}>
              <SectionHeader title={t('doc.text')} />
              {text.isPending ? <SkeletonCard /> : null}
              {shown.map((s) => (
                <Card key={s.id}>
                  <Text variant="label" muted>
                    {[s.page ? t('doc.page', { n: s.page }) : null, s.heading].filter(Boolean).join(' · ') || `#${s.ordinal + 1}`}
                  </Text>
                  <Text selectable>{s.text}</Text>
                </Card>
              ))}
              {segs.length > 6 && !showAllText ? <Button small variant="ghost" title={`+${segs.length - 6}`} onPress={() => setShowAllText(true)} /> : null}
            </View>
          ) : null}
        </>
      ) : null}

      <Sheet visible={rename !== null} onClose={() => setRename(null)} title={t('doc.rename')}>
        <Input label={t('upload.name')} value={rename ?? ''} onChangeText={setRename} maxLength={150} />
        <Button full title={t('common.save')} disabled={!rename?.trim()} onPress={async () => { await act(() => api(`/api/documents/${id}`, { method: 'PATCH', body: { name: rename!.trim() } })); setRename(null); }} />
      </Sheet>
      <Sheet visible={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('doc.delete')}>
        <Text>{t('doc.deleteConfirm')}</Text>
        <Button full variant="danger" icon="trash" title={t('common.delete')} onPress={async () => { await api(`/api/documents/${id}`, { method: 'DELETE' }); await Promise.all([qc.invalidateQueries({ queryKey: ['documents'] }), qc.invalidateQueries({ queryKey: qk.dashboard }), qc.invalidateQueries({ queryKey: qk.subjects })]); setConfirmDelete(false); router.replace('/upload'); }} />
        <Button full variant="ghost" title={t('common.cancel')} onPress={() => setConfirmDelete(false)} />
      </Sheet>
    </Screen>
  );
}
