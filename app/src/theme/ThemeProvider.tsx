import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, useColorScheme, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { darkColors, lightColors, type Colors, type Scheme } from './tokens';
import { storage } from '@/lib/storage';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeCtx {
  scheme: Scheme;
  colors: Colors;
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
}

const Ctx = createContext<ThemeCtx>({ scheme: 'light', colors: lightColors, preference: 'system', setPreference: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPref] = useState<ThemePreference>('system');
  useEffect(() => {
    storage.get('theme').then((v) => {
      if (v === 'light' || v === 'dark' || v === 'system') setPref(v);
    });
  }, []);
  const setPreference = useCallback((p: ThemePreference) => {
    setPref(p);
    storage.set('theme', p);
  }, []);
  const scheme: Scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const value = useMemo(() => ({ scheme, colors: scheme === 'dark' ? darkColors : lightColors, preference, setPreference }), [scheme, preference, setPreference]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);

/** Memoized, theme-aware StyleSheet factory. */
export function useStyles<T extends Record<string, ViewStyle | TextStyle | ImageStyle>>(factory: (c: Colors, scheme: Scheme) => T): T {
  const { colors, scheme } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => StyleSheet.create(factory(colors, scheme)), [colors, scheme]);
}
