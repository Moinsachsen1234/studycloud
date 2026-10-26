import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk, useLesson } from '@/lib/queries';
import { useI18n } from '@/lib/i18n';
import { Badge, Button, ErrorNotice, Row, SkeletonCard, Text } from '@/components/ui';
import { Screen } from '@/components/forms';
import { Header } from '@/components/common';
import { LessonBlockView } from '@/components/LessonBlock';
import { Cloudy } from '@/components/Cloudy';
import { spacing } from '@/theme/tokens';

export default function LessonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, errorText } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useLesson(id);
  const l = q.data;
  const started = useRef<number>(Date.now());
  const recorded = useRef(false);
  const [busy, setBusy] = useState(false);

  const elapsed = () => Math.min(4 * 3600, Math.round((Date.now() - started.current) / 1000));

  // Real activity only: mark started once; record the time actually spent when leaving.
  useEffect(() => {
    started.current = Date.now();
    recorded.current = false;
    api(`/api/lessons/${id}/progress`, { method: 'POST', body: { status: 'in_progress' } }).then(() => qc.invalidateQueries({ queryKey: qk.dashboard })).catch(() => {});
    return () => {
      const s = elapsed();
      if (!recorded.current && s >= 10) api('/api/study-sessions', { method: 'POST', body: { seconds: s, lessonId: id } }).catch(() => {});
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function complete() {
    setBusy(true);
    try {
      const s = elapsed();
      recorded.current = true;
      await api(`/api/lessons/${id}/progress`, { method: 'POST', body: { status: 'completed', seconds: Math.max(1, s) } });
      await Promise.all([qc.invalidateQueries({ queryKey: qk.lesson(id) }), qc.invalidateQueries({ queryKey: qk.dashboard }), qc.invalidateQueries({ queryKey: qk.program(l!.programId) }), qc.invalidateQueries({ queryKey: qk.progress }), qc.invalidateQueries({ queryKey: qk.subjects })]);
    } finally {
      setBusy(false);
    }
  }
  const done = l?.progress.status === 'completed';

  return (
    <Screen maxWidth={720}>
      <Header title={l?.programTitle} />
      {q.isPending ? <SkeletonCard /> : null}
      {q.isError ? <ErrorNotice message={errorText(q.error)} onRetry={() => q.refetch()} retryLabel={t('common.retry')} /> : null}
      {l ? (
        <>
          <View style={{ gap: 6 }}>
            <Text variant="caption" muted>
              {l.ordinal + 1} · {t('common.minutes', { n: l.estimatedMinutes })}
            </Text>
            <Text variant="title" accessibilityRole="header">
              {l.title}
            </Text>
            {done ? <Badge tone="success" icon="checkmark-circle" label={t('lesson.completed')} /> : null}
          </View>
          {l.blocks.map((b) => (
            <LessonBlockView key={b.id} block={b} claims={l.claims} />
          ))}
          <Row wrap>
            <Button variant="secondary" icon="chatbubble-ellipses" title={t('lesson.ask')} onPress={() => router.push({ pathname: '/tutor', params: { lessonId: l.id, programId: l.programId } })} />
          </Row>
          {!done ? <Button full icon="checkmark-circle" title={t('lesson.complete')} loading={busy} onPress={complete} /> : (
            <Row gap={spacing.md} style={{ justifyContent: 'center' }}>
              <Cloudy state="encouraging" size={64} />
              <Text variant="bodyStrong">{t('lesson.completed')}</Text>
            </Row>
          )}
          <Row style={{ justifyContent: 'space-between' }}>
            <Button variant="ghost" icon="arrow-back" title={t('lesson.prev')} disabled={!l.prevLessonId} onPress={() => router.replace(`/lesson/${l.prevLessonId}`)} />
            <Button variant={done ? 'primary' : 'ghost'} icon="arrow-forward" title={t('lesson.next')} disabled={!l.nextLessonId} onPress={() => router.replace(`/lesson/${l.nextLessonId}`)} />
          </Row>
        </>
      ) : null}
    </Screen>
  );
}
