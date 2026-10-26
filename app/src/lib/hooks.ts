import { useEffect, useState } from 'react';
import { AccessibilityInfo, useWindowDimensions } from 'react-native';
import { breakpoints } from '@/theme/tokens';

/** Honors the OS "reduce motion" setting (also prefers-reduced-motion on web). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduced(!!v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduced(!!v));
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

export function useIsWide(): boolean {
  const { width } = useWindowDimensions();
  return width >= breakpoints.wide;
}
