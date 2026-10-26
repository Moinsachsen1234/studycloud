import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { qk } from '@/lib/queries';
import { useI18n } from '@/lib/i18n';
import { Button, Card, Chip, ErrorNotice, Icon, ProgressBar, Row, SkeletonCard, Text } from '@/components/ui';
import { EmptyState, Input, Screen, SectionHeader } from '@/components/forms';
import { DocStatusBadge, Header, SubjectTile } from '@/components/common';
import { spacing, subjectColor } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';
import type { Subject } from '@/lib/types';

interface Detail {
  subject: Subject;
  topics: { id: string; title: string }[];
  collections: { id: string; name: string }[];
  documents: { id: string; name: string; created_at: string; status: any }[];
  programs: { id: string; title: string; estimated_minutes: number; lesson_count: number; completed_count: number }[];
  progress: { completed: number; total: number };
}

export default function SubjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, errorText } = useI18n();
  const { scheme } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.subject(id), queryFn: () => api<Detail>(`/api/subjects/${id}`) });
  const [topic, setTopic] = useState('');
  const [collection, setCollection] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const d = q.data;

  async function add(kind: 'topics' | 'collections', value: string, reset: () => void) {
    try {
      await api(`/api/subjects/${id}/${kind}`, { method: 'POST', body: kind === 'topics' ? { title: value } : { name: value } });
      reset();
      qc.invalidateQueries({ queryKey: qk.subject(id) });
    } catch (e) {
      setErr(errorText(e));
    }
  }
  async function remove(path: string) {
    await api(path, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: qk.subject(id) });
  }

  return (
    <Screen>
      <Header title={d ? (lang === 'en' ? d.subject.nameEn : d.subject.nameDe) : ''} />
      {q.isPending ? <SkeletonCard /> : null}
      {q.isError ? <ErrorNotice message={errorText(q.error)} onRetry={() => q.refetch()} retryLabel={t('common.retry')} /> : null}
      {err ? <ErrorNotice message={err} /> : null}
      {d ? (
        <>
          <Card>
            <Row>
              <SubjectTile icon={d.subject.icon} color={d.subject.color} size={56} />
              <View style={{ flex: 1, gap: 6 }}>
                <Text variant="caption" muted>
                  {t('subjects.progress')}: {d.progress.completed}/{d.progress.total} {t('program.lessons')}
                </Text>
                <ProgressBar value={d.progress.total ? d.progress.completed / d.progress.total : 0} color={subjectColor(d.subject.color, scheme)} label={t('subjects.progress')} />
              </View>
            </Row>
          </Card>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title={t('subjects.objectives')} />
            {d.subject.objectives.map((o, i) => (
              <Row key={i} style={{ alignItems: 'flex-start' }}>
                <Icon name="flag-outline" size={18} />
                <Text style={{ flex: 1 }}>{o}</Text>
              </Row>
            ))}
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title={t('subjects.programs')} />
            {d.programs.length ? (
              d.programs.map((p) => (
                <Card key={p.id} onPress={() => router.push(`/program/${p.id}`)} accessibilityLabel={p.title}>
                  <Text variant="bodyStrong">{p.title}</Text>
                  <Text variant="caption" muted>
                    {p.completed_count}/{p.lesson_count} {t('program.lessons')} · {t('program.estimated', { n: p.estimated_minutes })}
                  </Text>
                  <ProgressBar value={p.lesson_count ? p.completed_count / p.lesson_count : 0} label={p.title} />
                </Card>
              ))
            ) : (
              <EmptyState title={t('subjects.programs')} text={t('subjects.programsEmpty')} action={t('nav.upload')} onAction={() => router.push('/upload')} />
            )}
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title={t('subjects.documents')} />
            {d.documents.map((doc) => (
              <Card key={doc.id} onPress={() => router.push(`/document/${doc.id}`)} accessibilityLabel={doc.name}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                    {doc.name}
                  </Text>
                  <DocStatusBadge status={doc.status} />
                </Row>
              </Card>
            ))}
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title={t('subjects.topics')} />
            {d.topics.length ? (
              <Row wrap gap={8}>
                {d.topics.map((tp) => (
                  <Chip key={tp.id} label={tp.title} onPress={() => remove(`/api/topics/${tp.id}`)} icon="close-circle-outline" />
                ))}
              </Row>
            ) : (
              <Text muted>{t('subjects.topicsEmpty')}</Text>
            )}
            <Row>
              <View style={{ flex: 1 }}>
                <Input label={t('subjects.addTopic')} value={topic} onChangeText={setTopic} maxLength={100} onSubmitEditing={() => topic.trim() && add('topics', topic.trim(), () => setTopic(''))} />
              </View>
              <Button small icon="add" title={t('common.add')} disabled={!topic.trim()} onPress={() => add('topics', topic.trim(), () => setTopic(''))} style={{ marginTop: 24 }} />
            </Row>
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title={t('subjects.collections')} />
            <Row wrap gap={8}>
              {d.collections.map((c) => (
                <Chip key={c.id} label={c.name} icon="close-circle-outline" onPress={() => remove(`/api/collections/${c.id}`)} />
              ))}
            </Row>
            <Row>
              <View style={{ flex: 1 }}>
                <Input label={t('subjects.addCollection')} value={collection} onChangeText={setCollection} maxLength={100} />
              </View>
              <Button small icon="add" title={t('common.add')} disabled={!collection.trim()} onPress={() => add('collections', collection.trim(), () => setCollection(''))} style={{ marginTop: 24 }} />
            </Row>
          </View>
        </>
      ) : null}
    </Screen>
  );
}
