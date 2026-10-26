import React from 'react';
import { RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDashboard, qk } from '@/lib/queries';
import { useI18n } from '@/lib/i18n';
import { formatDuration, formatWeekday } from '@/lib/format';
import { Badge, Button, Card, ErrorNotice, Icon, ProgressBar, Row, SkeletonCard, Text } from '@/components/ui';
import { EmptyState, Screen, SectionHeader } from '@/components/forms';
import { CloudyBubble } from '@/components/Cloudy';
import { DocStatusBadge, StatTile, SubjectTile, TopBar } from '@/components/common';
import { spacing, subjectColor } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export default function Home() {
  const { t, lang, errorText } = useI18n();
  const { colors, scheme } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useDashboard();
  const d = q.data;
  const isNew = !!d && !d.continueLearning && d.recentDocuments.length === 0 && d.progress.programsStarted === 0;

  async function togglePlan(id: string, done: boolean) {
    await api(`/api/plan/items/${id}`, { method: 'PATCH', body: { status: done ? 'planned' : 'done' } });
    qc.invalidateQueries({ queryKey: qk.dashboard });
    qc.invalidateQueries({ queryKey: qk.plan });
  }
  const dayLabel = (n: number) => (n <= 0 ? t('home.dayLeftToday') : n === 1 ? t('home.dayLeftTomorrow') : t('home.daysLeft', { n }));

  return (
    <Screen refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { void q.refetch(); }} />}>
      <TopBar title={d?.displayName ? t('home.hello', { name: d.displayName }) : t('nav.home')} />
      {q.isError ? <ErrorNotice message={errorText(q.error)} onRetry={() => q.refetch()} retryLabel={t('common.retry')} /> : null}
      {q.isPending ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : null}
      {d ? (
        <>
          <Card tint>
            <CloudyBubble state={isNew ? 'happy' : 'neutral'}>
              <Text>{isNew ? t('home.cloudyWelcomeNew') : t('home.cloudyWelcome')}</Text>
            </CloudyBubble>
          </Card>

          {isNew ? (
            <View style={{ gap: spacing.md }}>
              <Text variant="heading" accessibilityRole="header">
                {t('home.firstSteps')}
              </Text>
              {[
                { n: 1, key: 'home.step1', go: '/subjects', icon: 'grid-outline' },
                { n: 2, key: 'home.step2', go: '/upload', icon: 'cloud-upload-outline' },
                { n: 3, key: 'home.step3', go: '/plan', icon: 'calendar-outline' },
              ].map((s) => (
                <Card key={s.n} onPress={() => router.push(s.go as any)} accessibilityLabel={t(s.key as any)}>
                  <Row>
                    <Badge tone="brand" label={String(s.n)} />
                    <Text variant="bodyStrong" style={{ flex: 1 }}>
                      {t(s.key as any)}
                    </Text>
                    <Icon name={s.icon} color={colors.accentText} />
                  </Row>
                </Card>
              ))}
            </View>
          ) : null}

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title={t('home.continue')} />
            {d.continueLearning ? (
              <Card onPress={() => router.push(`/lesson/${d.continueLearning!.lessonId}`)} accessibilityLabel={d.continueLearning.title}>
                <Text variant="caption" muted>
                  {d.continueLearning.programTitle}
                </Text>
                <Text variant="heading">{d.continueLearning.title}</Text>
                <Button title={t('home.continue')} icon="play" onPress={() => router.push(`/lesson/${d.continueLearning!.lessonId}`)} />
              </Card>
            ) : (
              <Text muted>{t('home.continueEmpty')}</Text>
            )}
          </View>

          <Card onPress={() => router.push('/upload')} accessibilityLabel={t('home.quickUpload')}>
            <Row>
              <SubjectTile icon="cloud-upload-outline" color="#6A50D8" />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{t('home.quickUpload')}</Text>
                <Text variant="caption" muted>
                  {t('home.quickUploadText')}
                </Text>
              </View>
              <Icon name="chevron-forward" size={18} />
            </Row>
          </Card>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title={t('home.mySubjects')} action={t('nav.subjects')} onAction={() => router.push('/subjects')} />
            {d.subjects.map((s) => (
              <Card key={s.id} onPress={() => router.push(`/subject/${s.id}`)} accessibilityLabel={lang === 'en' ? s.nameEn : s.nameDe}>
                <Row>
                  <SubjectTile icon={s.icon} color={s.color} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <Text variant="bodyStrong">{lang === 'en' ? s.nameEn : s.nameDe}</Text>
                    <Text variant="caption" muted>
                      {`${s.documents} ${t('subjects.documents')}`}{s.lessons ? ` · ${s.completed}/${s.lessons} ${t('program.lessons')}` : ''}
                    </Text>
                    {s.lessons > 0 ? <ProgressBar value={s.completed / s.lessons} label={t('subjects.progress')} color={subjectColor(s.color, scheme)} /> : null}
                  </View>
                  <Icon name="chevron-forward" size={18} />
                </Row>
              </Card>
            ))}
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title={t('home.exams')} action={t('nav.plan')} onAction={() => router.push('/plan')} />
            {d.upcomingExams.length ? (
              d.upcomingExams.map((e) => (
                <Card key={e.id}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{e.title}</Text>
                      <Text variant="caption" muted>
                        {formatWeekday(e.examDate, lang)}
                      </Text>
                    </View>
                    <Badge tone={e.daysLeft <= 3 ? 'warning' : 'brand'} icon="calendar" label={dayLabel(e.daysLeft)} />
                  </Row>
                </Card>
              ))
            ) : (
              <Text muted>{t('home.examsEmpty')}</Text>
            )}
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title={t('home.today')} />
            {d.todayPlan.length ? (
              d.todayPlan.map((i) => (
                <Card key={i.id}>
                  <Row>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong" style={i.status === 'done' ? { textDecorationLine: 'line-through' } : undefined}>
                        {i.title}
                      </Text>
                      <Text variant="caption" muted>
                        {t('common.minutes', { n: i.minutes })}
                      </Text>
                    </View>
                    <Button small variant={i.status === 'done' ? 'secondary' : 'primary'} icon={i.status === 'done' ? 'checkmark-circle' : 'ellipse-outline'} title={i.status === 'done' ? t('plan.done') : t('plan.done')} onPress={() => togglePlan(i.id, i.status === 'done')} accessibilityLabel={`${i.title}: ${t('plan.done')}`} />
                  </Row>
                </Card>
              ))
            ) : (
              <Text muted>{t('home.todayEmpty')}</Text>
            )}
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title={t('home.recent')} action={t('nav.upload')} onAction={() => router.push('/upload')} />
            {d.recentDocuments.length ? (
              d.recentDocuments.map((doc) => (
                <Card key={doc.id} onPress={() => router.push(`/document/${doc.id}`)} accessibilityLabel={doc.name}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                      {doc.name}
                    </Text>
                    <DocStatusBadge status={doc.status} />
                  </Row>
                </Card>
              ))
            ) : (
              <Text muted>{t('home.recentEmpty')}</Text>
            )}
          </View>

          <View style={{ gap: spacing.sm }}>
            <SectionHeader title={t('home.progress')} />
            <Row wrap gap={spacing.md} style={{ alignItems: 'stretch' }}>
              <StatTile icon="checkmark-done" label={t('progress.lessons')} value={String(d.progress.lessonsCompleted)} />
              <StatTile icon="book-outline" label={t('progress.started')} value={String(d.progress.programsStarted)} />
              <StatTile icon="trophy-outline" label={t('progress.completed')} value={String(d.progress.programsCompleted)} />
              <StatTile icon="time-outline" label={t('progress.time')} value={formatDuration(d.progress.studySeconds, lang)} />
              <StatTile icon="bookmark-outline" label={t('progress.topics')} value={String(d.progress.topicsReviewed)} />
              <StatTile icon="calendar-outline" label={t('progress.plan')} value={`${d.progress.planItemsDone}/${d.progress.planItemsDue}`} />
            </Row>
            <Text variant="caption" muted>
              {t('progress.note')}
            </Text>
          </View>
        </>
      ) : null}
      {d && d.subjects.length === 0 ? <EmptyState title={t('subjects.title')} text={t('home.step1')} action={t('subjects.manage')} onAction={() => router.push('/subjects')} /> : null}
    </Screen>
  );
}
