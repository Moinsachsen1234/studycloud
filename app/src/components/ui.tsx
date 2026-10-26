import React from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, StyleSheet, Text as RNText, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '@/theme/ThemeProvider';
import { MIN_TARGET, fontSize, radius, spacing, withAlpha } from '@/theme/tokens';
import { useReducedMotion } from '@/lib/hooks';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'caption' | 'label';

const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontSize: fontSize.display, lineHeight: 42, fontWeight: '800' },
  title: { fontSize: fontSize.xxl, lineHeight: 34, fontWeight: '800' },
  heading: { fontSize: fontSize.xl, lineHeight: 28, fontWeight: '700' },
  body: { fontSize: fontSize.md, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: fontSize.md, lineHeight: 24, fontWeight: '700' },
  caption: { fontSize: fontSize.sm, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: fontSize.sm, lineHeight: 18, fontWeight: '700', letterSpacing: 0.2 },
};

export function Text({ variant = 'body', muted, accent, color, style, ...rest }: TextProps & { variant?: Variant; muted?: boolean; accent?: boolean; color?: string }) {
  const { colors } = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[VARIANTS[variant], { color: color ?? (muted ? colors.textMuted : accent ? colors.accentText : colors.text) }, style]}
    />
  );
}

export function Icon({ name, size = 22, color, style }: { name: keyof typeof Ionicons.glyphMap | string; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  const { colors } = useTheme();
  return <Ionicons name={name as any} size={size} color={color ?? colors.text} style={style} accessibilityElementsHidden importantForAccessibility="no" />;
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({
  title, onPress, variant = 'primary', icon, loading, disabled, full, style, accessibilityLabel, small,
}: {
  title: string; onPress?: () => void; variant?: BtnVariant; icon?: string; loading?: boolean; disabled?: boolean; full?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string; small?: boolean;
}) {
  const { colors } = useTheme();
  const off = disabled || loading;
  const bg = variant === 'primary' ? colors.primary : variant === 'danger' ? colors.danger : variant === 'secondary' ? colors.surfaceAlt : 'transparent';
  const fg = variant === 'primary' ? colors.onPrimary : variant === 'danger' ? '#FFFFFF' : colors.accentText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed, focused }: any) => [
        { minHeight: small ? 40 : MIN_TARGET, paddingHorizontal: small ? spacing.lg : spacing.xl, borderRadius: radius.pill, backgroundColor: bg, opacity: off ? 0.5 : pressed ? 0.85 : 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm, alignSelf: full ? 'stretch' : 'flex-start' },
        variant === 'ghost' && { borderWidth: 1, borderColor: colors.borderStrong },
        focused && { outlineColor: colors.focus, outlineWidth: 3, outlineOffset: 2 } as any,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={20} color={fg} /> : null}
      <RNText maxFontSizeMultiplier={1.5} style={{ color: fg, fontSize: small ? fontSize.sm : fontSize.md, fontWeight: '700' }}>
        {title}
      </RNText>
    </Pressable>
  );
}

export function Card({ children, style, tint, onPress, accessibilityLabel }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tint?: boolean; onPress?: () => void; accessibilityLabel?: string }) {
  const s = useStyles((c) => ({
    card: { backgroundColor: c.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: c.border, gap: spacing.sm },
    tint: { backgroundColor: c.surfaceAlt, borderColor: 'transparent' },
  }));
  const content = [s.card, tint && s.tint, style];
  if (onPress)
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [...content, pressed && { opacity: 0.85 }] as any}>
        {children}
      </Pressable>
    );
  return <View style={content}>{children}</View>;
}

export function Chip({ label, selected, onPress, icon, color }: { label: string; selected?: boolean; onPress?: () => void; icon?: string; color?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ focused }: any) => [
        { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: selected ? 2 : 1, borderColor: selected ? colors.accentText : colors.borderStrong, backgroundColor: selected ? colors.surfaceAlt : colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        focused && ({ outlineColor: colors.focus, outlineWidth: 3 } as any),
      ]}
    >
      {icon ? <Icon name={icon} size={18} color={color ?? colors.accentText} /> : null}
      <RNText maxFontSizeMultiplier={1.5} style={{ color: colors.text, fontSize: fontSize.sm + 1, fontWeight: selected ? '700' : '500' }}>
        {label}
      </RNText>
      {selected ? <Icon name="checkmark" size={16} color={colors.accentText} /> : null /* selection never relies on color alone */}
    </Pressable>
  );
}

export function ProgressBar({ value, label, color }: { value: number; label?: string; color?: string }) {
  const { colors } = useTheme();
  const v = Math.max(0, Math.min(1, value));
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }} style={{ height: 10, borderRadius: radius.pill, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }}>
      <View style={{ width: `${v * 100}%`, height: '100%', borderRadius: radius.pill, backgroundColor: color ?? colors.brand }} />
    </View>
  );
}

export function Row({ children, style, gap = spacing.md, wrap }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number; wrap?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap, flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'; icon?: string }) {
  const { colors } = useTheme();
  const fg = { neutral: colors.textMuted, success: colors.success, warning: colors.warning, danger: colors.danger, info: colors.info, brand: colors.accentText }[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: withAlpha(fg, 0.12), alignSelf: 'flex-start' }}>
      {icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <RNText maxFontSizeMultiplier={1.4} style={{ color: fg, fontSize: fontSize.xs + 1, fontWeight: '700' }}>
        {label}
      </RNText>
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const o = React.useRef(new Animated.Value(0.5)).current;
  React.useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(Animated.sequence([Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(o, { toValue: 0.5, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [reduced, o]);
  return <Animated.View accessibilityElementsHidden style={[{ height, width, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, opacity: reduced ? 0.8 : o }, style]} />;
}

export function SkeletonCard() {
  return (
    <Card>
      <Skeleton height={18} width="55%" />
      <Skeleton height={14} />
      <Skeleton height={14} width="80%" />
    </Card>
  );
}

export function ErrorNotice({ message, onRetry, retryLabel }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radius.md, backgroundColor: withAlpha(colors.danger, 0.1), borderWidth: 1, borderColor: withAlpha(colors.danger, 0.5), alignItems: 'flex-start' }}>
      <Icon name="alert-circle" color={colors.danger} />
      <View style={{ flex: 1, gap: spacing.sm }}>
        <Text style={{ color: colors.text }}>{message}</Text>
        {onRetry ? <Button small variant="ghost" title={retryLabel ?? 'Retry'} onPress={onRetry} /> : null}
      </View>
    </View>
  );
}

export function InfoNotice({ message, icon = 'information-circle', tone = 'info' }: { message: string; icon?: string; tone?: 'info' | 'warning' }) {
  const { colors } = useTheme();
  const c = tone === 'warning' ? colors.warning : colors.info;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: withAlpha(c, 0.1), alignItems: 'flex-start' }}>
      <Icon name={icon} color={c} size={20} />
      <Text variant="caption" style={{ flex: 1, color: colors.text }}>
        {message}
      </Text>
    </View>
  );
}

export const hairline = Platform.OS === 'web' ? 1 : StyleSheet.hairlineWidth;
