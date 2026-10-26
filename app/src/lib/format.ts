import type { Lang } from './types';

/** Convert an ISO-8601 UTC timestamp (as stored by the server) to the student's local time zone. */
export function formatDateTime(iso: string | null | undefined, lang: Lang, timeZone: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(d);
  } catch {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  }
}

export function formatDate(iso: string | null | undefined, lang: Lang, timeZone: string): string | null {
  if (!iso) return null;
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'de-DE', { dateStyle: 'medium', timeZone: iso.length === 10 ? 'UTC' : timeZone }).format(d);
  } catch {
    return iso;
  }
}

export function formatWeekday(isoDate: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'de-DE', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(isoDate + 'T12:00:00Z'));
}

export function formatDuration(seconds: number, lang: Lang): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return lang === 'en' ? `${m} min` : `${m} Min.`;
  const h = Math.floor(m / 60);
  return lang === 'en' ? `${h} h ${m % 60} min` : `${h} Std. ${m % 60} Min.`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
