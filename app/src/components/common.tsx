import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Card, Icon, Row, Text } from './ui';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TARGET, radius, spacing, subjectColor, withAlpha } from '@/theme/tokens';
import { useI18n } from '@/lib/i18n';
import { formatBytes } from '@/lib/format';
import type { Doc, JobStatus } from '@/lib/types';

export function TopBar({ title, right }: { title: string; right?: React.ReactNode }) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
        {title}
      </Text>
      {right}
      <Pressable accessibilityRole="button" accessibilityLabel={t('nav.settings')} onPress={() => router.push('/settings')} style={{ width: MIN_TARGET, height: MIN_TARGET, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="person-circle-outline" size={30} />
      </Pressable>
    </Row>
  );
}

export function Header({ title, right }: { title?: string; right?: React.ReactNode }) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ width: MIN_TARGET, height: MIN_TARGET, alignItems: 'center', justifyContent: 'center', marginLeft: -12 }}>
        <Icon name="arrow-back" size={26} />
      </Pressable>
      <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
        {title}
      </Text>
      {right}
    </Row>
  );
}

export function SubjectTile({ icon, color, size = 44 }: { icon: string; color: string; size?: number }) {
  const { scheme } = useTheme();
  const c = subjectColor(color, scheme);
  return (
    <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: withAlpha(c, 0.16), alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={size * 0.52} color={c} />
    </View>
  );
}

const STATUS_ICON: Record<JobStatus, string> = { queued: 'time-outline', uploading: 'cloud-upload-outline', processing: 'sync-outline', analyzing: 'sparkles-outline', completed: 'checkmark-circle', failed: 'alert-circle' };
const STATUS_TONE: Record<JobStatus, 'neutral' | 'info' | 'success' | 'danger'> = { queued: 'neutral', uploading: 'info', processing: 'info', analyzing: 'info', completed: 'success', failed: 'danger' };

export function DocStatusBadge({ status }: { status: JobStatus | null | undefined }) {
  const { t } = useI18n();
  if (!status) return null;
  return <Badge tone={STATUS_TONE[status]} icon={STATUS_ICON[status]} label={t(`doc.status.${status}` as any)} />;
}

export function DocCard({ doc, subjectName, onPress }: { doc: Doc; subjectName?: string; onPress: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const status = doc.job?.status;
  return (
    <Card onPress={onPress} accessibilityLabel={doc.name}>
      <Row style={{ alignItems: 'flex-start' }}>
        <Icon name={doc.mimeType.startsWith('image/') ? 'image-outline' : 'document-text-outline'} size={26} color={colors.accentText} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {doc.name}
          </Text>
          <Text variant="caption" muted>
            {[subjectName, formatBytes(doc.sizeBytes), doc.pageCount ? t('doc.page', { n: doc.pageCount }).replace('Seite', 'S.') : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.textMuted} />
      </Row>
      <Row wrap gap={8}>
        <DocStatusBadge status={status} />
        {doc.job?.status === 'completed' && doc.job.analysisState !== 'done' ? <Badge tone="warning" icon="information-circle" label={t(`doc.analysis.${doc.job.analysisState}` as any)} /> : null}
      </Row>
      {doc.job?.status === 'failed' && doc.job.errorMessage ? (
        <Text variant="caption" style={{ color: colors.danger }}>
          {doc.job.errorMessage}
        </Text>
      ) : null}
    </Card>
  );
}

export function StatTile({ label, value, icon }: { label: string; value: string; icon: string }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={{ flexGrow: 1, flexBasis: 150, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, gap: 4 }}>
      <Icon name={icon} size={20} color={colors.accentText} />
      <Text variant="title">{value}</Text>
      <Text variant="caption" muted>
        {label}
      </Text>
    </View>
  );
}
