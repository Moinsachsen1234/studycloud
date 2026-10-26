import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useReducedMotion } from '@/lib/hooks';
import { useTheme } from '@/theme/ThemeProvider';
import { useT } from '@/lib/i18n';

export type CloudyState = 'neutral' | 'happy' | 'thinking' | 'explaining' | 'encouraging' | 'confused';

const INK = '#2A2350';
const OUTLINE = '#7A61E8';
const CHEEK = '#FF9DB8';

/** Cloudy — original StudyCloud mascot (hand-built vector shapes; no third-party artwork). */
export function Cloudy({ state = 'neutral', size = 96, animated = true }: { state?: CloudyState; size?: number; animated?: boolean }) {
  const { scheme } = useTheme();
  const t = useT();
  const reduced = useReducedMotion();
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animated || reduced) {
      bob.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, reduced, bob]);

  const fill = scheme === 'dark' ? '#E9E4FF' : '#FFFFFF';
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.04] });
  const body = (extra: object) => (
    <>
      <Rect x={18} y={54} width={84} height={32} rx={16} {...extra} />
      <Circle cx={42} cy={50} r={20} {...extra} />
      <Circle cx={66} cy={40} r={26} {...extra} />
      <Circle cx={88} cy={54} r={17} {...extra} />
    </>
  );

  const happyEye = (cx: number) => <Path d={`M${cx - 5} 63 Q${cx} 55 ${cx + 5} 63`} stroke={INK} strokeWidth={3.2} strokeLinecap="round" fill="none" />;
  const roundEye = (cx: number, dx = 0, dy = 0, r = 4.4) => (
    <G>
      <Ellipse cx={cx} cy={62} rx={r + 1.4} ry={r + 2} fill="#FFFFFF" stroke={INK} strokeWidth={1.2} />
      <Circle cx={cx + dx} cy={62 + dy} r={r} fill={INK} />
    </G>
  );

  let face: React.ReactNode;
  switch (state) {
    case 'happy':
      face = (
        <>
          {happyEye(50)}
          {happyEye(76)}
          <Circle cx={41} cy={71} r={5} fill={CHEEK} opacity={0.8} />
          <Circle cx={85} cy={71} r={5} fill={CHEEK} opacity={0.8} />
          <Path d="M53 70 Q63 84 73 70 Z" fill={INK} />
        </>
      );
      break;
    case 'thinking':
      face = (
        <>
          {roundEye(50, 2, -2)}
          {roundEye(76, 2, -2)}
          <Path d="M57 76 L69 75" stroke={INK} strokeWidth={3} strokeLinecap="round" />
          <Circle cx={96} cy={26} r={3} fill={OUTLINE} />
          <Circle cx={104} cy={17} r={4.5} fill={OUTLINE} />
          <Circle cx={113} cy={7} r={6} fill={OUTLINE} />
        </>
      );
      break;
    case 'explaining':
      face = (
        <>
          {roundEye(50)}
          {roundEye(76)}
          <Ellipse cx={63} cy={76} rx={5.5} ry={6.5} fill={INK} />
          <Path d="M96 40 L108 34 M98 50 L112 50 M96 60 L108 66" stroke={OUTLINE} strokeWidth={3} strokeLinecap="round" />
        </>
      );
      break;
    case 'encouraging':
      face = (
        <>
          {happyEye(50)}
          {happyEye(76)}
          <Circle cx={41} cy={71} r={5} fill={CHEEK} opacity={0.8} />
          <Circle cx={85} cy={71} r={5} fill={CHEEK} opacity={0.8} />
          <Path d="M54 71 Q63 79 72 71" stroke={INK} strokeWidth={3.2} strokeLinecap="round" fill="none" />
          <Path d="M104 8 l3.2 7 7.6 .9 -5.6 5.2 1.5 7.5 -6.7 -3.8 -6.7 3.8 1.5 -7.5 -5.6 -5.2 7.6 -.9z" fill="#FFB400" />
        </>
      );
      break;
    case 'confused':
      face = (
        <>
          {roundEye(50, 0, 0, 3.6)}
          {roundEye(76, 0, 0, 5.2)}
          <Path d="M43 52 L56 55 M70 53 L83 49" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
          <Path d="M53 75 Q58 70 63 75 T73 75" stroke={INK} strokeWidth={3} strokeLinecap="round" fill="none" />
          <SvgText x={100} y={24} fontSize={22} fontWeight="bold" fill={OUTLINE}>
            ?
          </SvgText>
        </>
      );
      break;
    default:
      face = (
        <>
          {roundEye(50)}
          {roundEye(76)}
          <Path d="M54 73 Q63 80 72 73" stroke={INK} strokeWidth={3.2} strokeLinecap="round" fill="none" />
        </>
      );
  }

  const labelKey = { neutral: 'Cloudy', happy: 'Cloudy', thinking: 'Cloudy', explaining: 'Cloudy', encouraging: 'Cloudy', confused: 'Cloudy' }[state];
  void t;
  return (
    <Animated.View accessible accessibilityRole="image" accessibilityLabel={`${labelKey} (${state})`} style={{ width: size, height: size * 0.88, transform: [{ translateY }] }}>
      <Svg width={size} height={size * 0.88} viewBox="0 0 120 106">
        <G stroke={OUTLINE} strokeWidth={6} strokeLinejoin="round">
          {body({ fill: OUTLINE })}
        </G>
        {body({ fill })}
        {face}
      </Svg>
    </Animated.View>
  );
}

export function CloudyBubble({ state, children, size = 72 }: { state?: CloudyState; children: React.ReactNode; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Cloudy state={state} size={size} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}
