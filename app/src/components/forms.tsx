import React, { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Switch, TextInput, View, type TextInputProps } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, Icon, Row, Text } from './ui';
import { Cloudy, type CloudyState } from './Cloudy';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TARGET, radius, spacing } from '@/theme/tokens';
import { useIsWide } from '@/lib/hooks';
import { useT } from '@/lib/i18n';

export function Input({ label, error, hint, style, ...rest }: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
        style={[
          { minHeight: MIN_TARGET, borderWidth: focused ? 2 : 1, borderColor: error ? colors.danger : focused ? colors.focus : colors.borderStrong, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: colors.text, backgroundColor: colors.surface, fontSize: 16 },
          rest.multiline && { minHeight: 96, textAlignVertical: 'top' },
          Platform.OS === 'web' && ({ outlineStyle: 'none' } as any),
          style,
        ]}
      />
      {error ? (
        <Text variant="caption" style={{ color: colors.danger }} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" muted>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function ToggleRow({ label, value, onChange, description }: { label: string; value: boolean; onChange: (v: boolean) => void; description?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label} onPress={() => onChange(!value)} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TARGET }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong">{label}</Text>
        {description ? (
          <Text variant="caption" muted>
            {description}
          </Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor="#FFFFFF" />
    </Pressable>
  );
}

export function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={label} onPress={() => onChange(!checked)} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start', minHeight: MIN_TARGET, paddingVertical: 6 }}>
      <View style={{ width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: checked ? colors.primary : colors.borderStrong, backgroundColor: checked ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {checked ? <Icon name="checkmark" size={18} color={colors.onPrimary} /> : null}
      </View>
      <Text style={{ flex: 1 }} variant="caption">
        {label}
      </Text>
    </Pressable>
  );
}

/** Bottom sheet on phones, centered dialog on wide screens. */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const wide = useIsWide();
  const t = useT();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
      <Pressable accessibilityLabel={t('common.close')} accessibilityRole="button" onPress={onClose} style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: wide ? 'center' : 'flex-end', alignItems: wide ? 'center' : 'stretch' }}>
        <Pressable
          accessible={false}
          onPress={() => {}}
          style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderRadius: wide ? radius.xl : undefined, maxHeight: '88%', width: wide ? 560 : '100%', paddingBottom: insets.bottom + spacing.lg }}
        >
          <Row style={{ padding: spacing.lg, justifyContent: 'space-between' }}>
            <Text variant="heading" style={{ flex: 1 }} accessibilityRole="header">
              {title}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.close')} onPress={onClose} style={{ width: MIN_TARGET, height: MIN_TARGET, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={26} />
            </Pressable>
          </Row>
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, gap: spacing.md }}>{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function SelectField<T extends string | number>({ label, value, options, onChange, placeholder }: { label: string; value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void; placeholder?: string }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${current?.label ?? placeholder ?? ''}`} onPress={() => setOpen(true)} style={{ minHeight: MIN_TARGET, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface }}>
        <Text style={{ color: current ? colors.text : colors.textMuted }}>{current?.label ?? placeholder ?? '–'}</Text>
        <Icon name="chevron-down" size={20} />
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        <View style={{ gap: spacing.sm }}>
          {options.map((o) => (
            <Chip key={String(o.value)} label={o.label} selected={o.value === value} onPress={() => { onChange(o.value); setOpen(false); }} />
          ))}
        </View>
      </Sheet>
    </View>
  );
}

export function Screen({ children, scroll = true, maxWidth = 760, padded = true, refreshControl, footer }: { children: React.ReactNode; scroll?: boolean; maxWidth?: number; padded?: boolean; refreshControl?: React.ReactElement<any>; footer?: React.ReactNode }) {
  const { colors } = useTheme();
  const inner = <View style={{ width: '100%', maxWidth, alignSelf: 'center', gap: spacing.lg, padding: padded ? spacing.lg : 0, paddingBottom: spacing.xxxl }}>{children}</View>;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.bg }}>
      {scroll ? (
        <ScrollView refreshControl={refreshControl} keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
          {inner}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{inner}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

export function EmptyState({ title, text, action, onAction, state = 'encouraging', secondaryAction, onSecondary }: { title: string; text?: string; action?: string; onAction?: () => void; state?: CloudyState; secondaryAction?: string; onSecondary?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: spacing.md, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.surfaceAlt }}>
      <Cloudy state={state} size={88} />
      <Text variant="heading" style={{ textAlign: 'center' }} accessibilityRole="header">
        {title}
      </Text>
      {text ? (
        <Text muted style={{ textAlign: 'center', maxWidth: 420 }}>
          {text}
        </Text>
      ) : null}
      {action ? <Button title={action} onPress={onAction} /> : null}
      {secondaryAction ? <Button variant="ghost" title={secondaryAction} onPress={onSecondary} /> : null}
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
        {title}
      </Text>
      {action ? <Button small variant="ghost" title={action} onPress={onAction} /> : null}
    </Row>
  );
}
