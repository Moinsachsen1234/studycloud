import React, { useState } from 'react';
import { View } from 'react-native';
import { Badge, Card, Icon, Row, Text } from './ui';
import { MathText } from './MathText';
import { SourceBadge, SourceDetailsSheet } from './sources';
import { useTheme } from '@/theme/ThemeProvider';
import { spacing, withAlpha } from '@/theme/tokens';
import { useI18n } from '@/lib/i18n';
import type { BlockType, Lesson, LessonBlock, SourceRef } from '@/lib/types';

const TYPE_ICON: Record<BlockType, string> = {
  explanation: 'bulb-outline', definition: 'bookmark-outline', formula: 'calculator-outline', worked_example: 'pencil-outline',
  common_mistake: 'warning-outline', summary: 'list-outline', revision_activity: 'repeat-outline',
};

export function LessonBlockView({ block, claims }: { block: LessonBlock; claims: Lesson['claims'] }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const refs: SourceRef[] = block.claimIds.flatMap((id) => claims[id]?.sources ?? []);
  const claimText = block.claimIds.map((id) => claims[id]?.text).filter(Boolean)[0];
  const originTone = block.origin === 'external' ? 'success' : block.origin === 'material' ? 'brand' : 'neutral';
  const originIcon = block.origin === 'external' ? 'shield-checkmark' : block.origin === 'material' ? 'document-text' : 'sparkles';
  const tint = block.type === 'common_mistake' ? colors.warning : block.type === 'summary' ? colors.success : colors.accentText;
  return (
    <Card style={{ borderLeftWidth: 4, borderLeftColor: withAlpha(tint, 0.9) }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Row gap={6} style={{ flex: 1 }}>
          <Icon name={TYPE_ICON[block.type]} size={18} color={tint} />
          <Text variant="label" style={{ color: tint }}>
            {t(`lesson.type.${block.type}` as any).toUpperCase()}
          </Text>
        </Row>
        <Row gap={8}>
          <Badge tone={originTone as any} icon={originIcon} label={t(`lesson.origin.${block.origin}` as any)} />
          {refs.length ? <SourceBadge refs={refs} onPress={() => setOpen(true)} /> : null}
        </Row>
      </Row>
      {block.title ? (
        <Text variant="heading" accessibilityRole="header">
          {block.title}
        </Text>
      ) : null}
      <MathText>{block.text}</MathText>
      {block.origin === 'ai_explanation' ? (
        <Text variant="caption" muted>
          {t('lesson.origin.ai_hint')}
        </Text>
      ) : null}
      {block.type === 'worked_example' && block.mathChecked !== null ? (
        <Row gap={6}>
          <Icon name={block.mathChecked ? 'checkmark-circle' : 'help-circle-outline'} size={16} color={block.mathChecked ? colors.success : colors.textMuted} />
          <Text variant="caption" muted>
            {block.mathChecked ? t('lesson.mathChecked') : t('lesson.mathUnchecked')}
          </Text>
        </Row>
      ) : null}
      <SourceDetailsSheet visible={open} onClose={() => setOpen(false)} refs={refs} claimText={claimText} />
      <View />
    </Card>
  );
}
