import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Badge, Button, Card, Icon, InfoNotice, Row, Text } from './ui';
import { Sheet } from './forms';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TARGET, radius, spacing } from '@/theme/tokens';
import { useI18n } from '@/lib/i18n';
import { formatDate, formatDateTime } from '@/lib/format';
import type { ExternalSource, ProgramSources, SourceRef } from '@/lib/types';

/** Verified / unverified / failed — always icon + text, never color alone. */
export function SourceVerificationStatus({ status, verifiedAt }: { status: ExternalSource['verificationStatus']; verifiedAt?: string | null }) {
  const { t, lang, timeZone } = useI18n();
  const when = formatDateTime(verifiedAt, lang, timeZone);
  if (status === 'verified') return <Badge tone="success" icon="shield-checkmark" label={t('src.verified') + (when ? ` · ${when}` : '')} />;
  if (status === 'failed') return <Badge tone="danger" icon="close-circle" label={t('src.failed')} />;
  return <Badge tone="warning" icon="help-circle" label={t('src.unverified')} />;
}

/** Link to a private document: in-app navigation only, never a URL. */
export function DocumentReference({ documentId, documentName, page, location }: { documentId: string; documentName: string; page?: number | null; location?: string | null }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`${t('src.openDoc')}: ${documentName}`} onPress={() => router.push(`/document/${documentId}`)} style={{ minHeight: MIN_TARGET, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}>
      <Icon name="document-text" color={colors.accentText} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {documentName}
        </Text>
        <Text variant="caption" muted>
          {t('src.yourDoc')}
          {page ? ` · ${t('doc.page', { n: page })}` : location ? ` · ${location}` : ''} · {t('src.privateDoc')}
        </Text>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

/** Full metadata of an external source. Every value comes from the stored retrieval record. */
export function ExternalReference({ source, location, compact }: { source: ExternalSource; location?: string | null; compact?: boolean }) {
  const { t, lang, timeZone } = useI18n();
  const { colors } = useTheme();
  const na = t('src.notAvailable');
  const row = (label: string, value: React.ReactNode) => (
    <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }} accessible accessibilityLabel={`${label}: ${typeof value === 'string' ? value : ''}`}>
      <Text variant="label" muted style={{ width: 112 }}>
        {label}
      </Text>
      <View style={{ flex: 1 }}>{typeof value === 'string' ? <Text variant="caption">{value}</Text> : value}</View>
    </View>
  );
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="bodyStrong" accessibilityRole="header">
        {source.title}
      </Text>
      <SourceVerificationStatus status={source.verificationStatus} verifiedAt={source.verifiedAt} />
      {row(t('src.publisher'), source.publisher ?? na)}
      {!compact && row(t('src.author'), source.author ?? na)}
      {row(
        t('src.link'),
        <Pressable accessibilityRole="link" accessibilityLabel={`${t('src.openOriginal')}: ${source.url}`} onPress={() => Linking.openURL(source.url)} style={{ minHeight: 32, justifyContent: 'center' }}>
          <Text variant="caption" accent style={{ textDecorationLine: 'underline' }}>
            {source.url}
          </Text>
        </Pressable>,
      )}
      {row(t('src.published'), formatDate(source.publishedAt, lang, timeZone) ?? na)}
      {row(t('src.updated'), formatDateTime(source.updatedAt, lang, timeZone) ?? na)}
      {row(t('src.retrieved'), formatDateTime(source.retrievedAt, lang, timeZone) ?? na)}
      {row(
        t('src.license'),
        source.license ? (
          <Pressable onPress={() => source.license?.url && Linking.openURL(source.license.url)} accessibilityRole={source.license.url ? 'link' : 'text'}>
            <Text variant="caption" accent={!!source.license.url} style={source.license.url ? { textDecorationLine: 'underline' } : undefined}>
              {source.license.id}
            </Text>
          </Pressable>
        ) : (
          <Text variant="caption" style={{ color: colors.warning }}>
            {t('src.noLicense')}
          </Text>
        ),
      )}
      {location ? row(t('src.location'), location) : null}
      {!compact && <InfoNotice message={t('src.linkUnavailable')} icon="time" />}
    </View>
  );
}

/** Small, unobtrusive indicator next to a statement; opens the details sheet. */
export function SourceBadge({ refs, onPress }: { refs: SourceRef[]; onPress: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const ext = refs.some((r) => r.kind === 'external');
  const n = refs.length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={n > 1 ? t('src.badgeCount', { n }) : t('src.badge')}
      onPress={onPress}
      hitSlop={8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, alignSelf: 'flex-start' }}
    >
      <Icon name={ext ? 'link' : 'document-text'} size={14} color={colors.accentText} />
      <Text variant="caption" accent style={{ fontWeight: '700' }}>
        {n}
      </Text>
    </Pressable>
  );
}

export function SourceDetailsSheet({ visible, onClose, refs, claimText }: { visible: boolean; onClose: () => void; refs: SourceRef[]; claimText?: string }) {
  const { t } = useI18n();
  return (
    <Sheet visible={visible} onClose={onClose} title={t('src.details')}>
      {claimText ? (
        <Text variant="caption" muted>
          “{claimText}”
        </Text>
      ) : null}
      {refs.map((r, i) =>
        r.kind === 'external' ? (
          <Card key={i}>
            <ExternalReference source={r.source} location={r.location} />
            <Text variant="caption" muted>
              {t('src.verifiedChecks')}
            </Text>
          </Card>
        ) : r.kind === 'document' ? (
          <DocumentReference key={i} documentId={r.documentId} documentName={r.documentName} page={r.page} location={r.location} />
        ) : (
          <InfoNotice key={i} message={t('src.aiOnly')} icon="sparkles" />
        ),
      )}
    </Sheet>
  );
}

/** "Sources & References" section of a program, grouped by origin. */
export function SourceList({ sources }: { sources: ProgramSources }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<ExternalSource | null>(null);
  const none = !sources.myMaterials.length && !sources.verifiedExternal.length && !sources.licensedResources.length && !sources.unverifiedExternal.length;
  const group = (title: string, items: ExternalSource[]) =>
    items.length ? (
      <View style={{ gap: spacing.sm }}>
        <Text variant="label" muted>
          {title}
        </Text>
        {items.map((s) => (
          <Card key={s.id} onPress={() => setOpen(s)} accessibilityLabel={s.title}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {s.title}
              </Text>
              <Icon name="chevron-forward" size={18} />
            </Row>
            <Text variant="caption" muted>
              {s.publisher ?? t('src.notAvailable')}
              {s.license ? ` · ${s.license.id}` : ''}
            </Text>
            <SourceVerificationStatus status={s.verificationStatus} />
            {s.usedFor?.[0] ? (
              <Text variant="caption" muted numberOfLines={2}>
                {t('src.usedFor')}: {s.usedFor[0]}
              </Text>
            ) : null}
          </Card>
        ))}
      </View>
    ) : null;
  return (
    <View style={{ gap: spacing.lg }}>
      <Text variant="heading" accessibilityRole="header">
        {t('src.title')}
      </Text>
      {sources.myMaterials.length ? (
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" muted>
            {t('src.mine')}
          </Text>
          {sources.myMaterials.map((d) => (
            <DocumentReference key={d.documentId} documentId={d.documentId} documentName={d.name} />
          ))}
        </View>
      ) : null}
      {group(t('src.external'), [...sources.verifiedExternal, ...sources.unverifiedExternal])}
      {group(t('src.licensed'), sources.licensedResources)}
      {!sources.verifiedExternal.length && !sources.licensedResources.length && !sources.unverifiedExternal.length && !none ? <InfoNotice message={t('src.none')} /> : null}
      {none ? <InfoNotice message={t('src.none')} /> : null}
      <SourceDetailsSheet visible={!!open} onClose={() => setOpen(null)} refs={open ? [{ kind: 'external', source: open }] : []} />
    </View>
  );
}

/** Row of source chips shown under a tutor answer. */
export function ProvenanceRow({ provenance }: { provenance: SourceRef[] }) {
  const { t } = useI18n();
  const [sheet, setSheet] = useState(false);
  const only = provenance.length === 1 && provenance[0].kind === 'ai_generated';
  if (only)
    return (
      <Row gap={6} style={{ marginTop: 6 }}>
        <Icon name="sparkles" size={14} />
        <Text variant="caption" muted>
          {t('src.aiOnly')}
        </Text>
      </Row>
    );
  return (
    <View style={{ marginTop: 8, gap: 6 }}>
      <Text variant="label" muted>
        {t('tutor.sourcesFrom')}
      </Text>
      <Row wrap gap={8}>
        {provenance.map((p, i) => (
          <Pressable key={i} accessibilityRole="button" accessibilityLabel={p.kind === 'external' ? p.source.title : p.kind === 'document' ? p.documentName : 'AI'} onPress={() => setSheet(true)} style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: 'rgba(122,97,232,0.12)', flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <Icon name={p.kind === 'external' ? 'link' : 'document-text'} size={14} />
            <Text variant="caption" numberOfLines={1} style={{ maxWidth: 220 }}>
              {p.kind === 'external' ? p.source.title : p.kind === 'document' ? p.documentName + (p.page ? ` · ${t('doc.page', { n: p.page })}` : '') : ''}
            </Text>
          </Pressable>
        ))}
      </Row>
      <SourceDetailsSheet visible={sheet} onClose={() => setSheet(false)} refs={provenance} />
    </View>
  );
}

export { Button };
