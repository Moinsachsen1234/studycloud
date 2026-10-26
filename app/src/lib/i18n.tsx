import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { de, en, type Key } from './dictionary';
import { storage } from './storage';
import { ApiError } from './api';
import type { Lang } from './types';

export type { Key };

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  const s = (lang === 'en' ? en : de)[key] ?? de[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : s;
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: Key, vars?: Record<string, string | number>) => string;
  /** Localized, user-facing message for an API error (falls back to the server's message). */
  errorText: (e: unknown) => string;
  timeZone: string;
  setTimeZone: (tz: string) => void;
}

const Ctx = createContext<I18n>({ lang: 'de', setLang: () => {}, t: (k) => translate('de', k), errorText: () => '', timeZone: 'Europe/Berlin', setTimeZone: () => {} });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('de'); // German is the default
  const [timeZone, setTimeZone] = useState('Europe/Berlin');
  useEffect(() => {
    storage.get('lang').then((v) => {
      if (v === 'de' || v === 'en') setLangState(v);
    });
  }, []);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    storage.set('lang', l);
  }, []);
  const value = useMemo<I18n>(() => {
    const t = (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars);
    const errorText = (e: unknown) => {
      if (e instanceof ApiError) {
        const k = `err.${e.code}` as Key;
        if (k in de) return t(k);
        if (lang === 'de') return e.message;
        return e.message;
      }
      return t('common.errorTitle');
    };
    return { lang, setLang, t, errorText, timeZone, setTimeZone };
  }, [lang, setLang, timeZone]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;
