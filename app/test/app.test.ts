import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast, darkColors, lightColors, subjectColor } from '../src/theme/tokens';
import { de, en } from '../src/lib/dictionary';
import { splitMath, texToUnicode } from '../src/lib/mathText';
import { addDaysIso, formatDate, formatDateTime, formatDuration } from '../src/lib/format';

describe('accessibility: WCAG contrast of the real design tokens', () => {
  for (const [name, c] of [['light', lightColors], ['dark', darkColors]] as const) {
    it(`${name}: text pairs ≥ 4.5:1`, () => {
      const pairs: [string, string, string][] = [
        ['text/bg', c.text, c.bg], ['text/surface', c.text, c.surface], ['muted/bg', c.textMuted, c.bg], ['muted/surface', c.textMuted, c.surface], ['muted/lavender', c.textMuted, c.surfaceAlt],
        ['onPrimary/primary', c.onPrimary, c.primary], ['accentText/bg', c.accentText, c.bg], ['accentText/surface', c.accentText, c.surface], ['accentText/lavender', c.accentText, c.surfaceAlt],
        ['success/surface', c.success, c.surface], ['warning/surface', c.warning, c.surface], ['danger/surface', c.danger, c.surface], ['info/surface', c.info, c.surface],
        ['danger/bg', c.danger, c.bg], ['warning/bg', c.warning, c.bg],
      ];
      for (const [label, fg, bg] of pairs) expect(contrast(fg, bg), `${name} ${label}`).toBeGreaterThanOrEqual(4.5);
    });
    it(`${name}: input outlines and focus ring ≥ 3:1 (non-text contrast)`, () => {
      expect(contrast(c.borderStrong, c.bg)).toBeGreaterThanOrEqual(3);
      expect(contrast(c.borderStrong, c.surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(c.focus, c.bg)).toBeGreaterThanOrEqual(3);
    });
  }
  it('documents why the suggested brand violet is not used for filled buttons', () => {
    expect(contrast('#FFFFFF', '#7A61E8')).toBeLessThan(4.5); // 4.47:1 — just under AA
    expect(contrast('#FFFFFF', lightColors.primary)).toBeGreaterThanOrEqual(4.5);
  });
  it('subject colors keep ≥ 3:1 against white (light) and the dark surface (dark)', () => {
    for (const hex of ['#6A50D8', '#1F6FDB', '#D2432E', '#238A5B', '#A35F00', '#B83D78', '#0E8499']) {
      expect(contrast(hex, '#FFFFFF'), hex).toBeGreaterThanOrEqual(3);
      expect(contrast(subjectColor(hex, 'dark'), darkColors.surface), hex + ' dark').toBeGreaterThanOrEqual(3);
    }
  });
});

describe('i18n', () => {
  it('English has exactly the German keys and no empty strings', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort());
    for (const [k, v] of Object.entries({ ...de })) expect(v.length, `de ${k}`).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(en)) expect(v.length, `en ${k}`).toBeGreaterThan(0);
  });
  it('placeholders match between languages', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const k of Object.keys(de) as (keyof typeof de)[]) expect(ph(en[k]), k).toBe(ph(de[k]));
  });
  it('every statically referenced t(...) key in the source exists', () => {
    const files: string[] = [];
    const walk = (d: string) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) && files.push(path.join(d, e.name))));
    walk(path.join(__dirname, '../src'));
    const missing: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([\w.]+)'/g)) if (!m[1].endsWith('.') && !(m[1] in de)) missing.push(`${path.basename(f)}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });
  it('dynamic key families are complete', () => {
    for (const s of ['queued', 'uploading', 'processing', 'analyzing', 'completed', 'failed']) expect(`doc.status.${s}` in de, s).toBe(true);
    for (const s of ['done', 'skipped', 'failed', 'pending']) expect(`doc.analysis.${s}` in de, s).toBe(true);
    for (const s of ['explanation', 'definition', 'formula', 'worked_example', 'common_mistake', 'summary', 'revision_activity']) expect(`lesson.type.${s}` in de, s).toBe(true);
    for (const s of ['material', 'external', 'ai_explanation']) expect(`lesson.origin.${s}` in de, s).toBe(true);
    for (const s of ['not_started', 'in_progress', 'completed']) expect(`program.status.${s}` in de, s).toBe(true);
    for (const s of ['system', 'light', 'dark']) expect(`settings.theme.${s}` in de, s).toBe(true);
  });
  it('every server error code that the UI may receive has a translation', () => {
    for (const c of ['NETWORK', 'AI_NOT_CONFIGURED', 'AI_CONSENT_REQUIRED', 'AI_QUOTA_EXCEEDED', 'RATE_LIMITED', 'FILE_TOO_LARGE', 'INVALID_CREDENTIALS', 'EMAIL_TAKEN', 'GUARDIAN_CONSENT_REQUIRED', 'INSUFFICIENT_MATERIAL', 'VALIDATION_FAILED', 'INVALID_MODEL_OUTPUT', 'RESEARCH_NOT_AVAILABLE', 'DOCUMENT_NOT_READY', 'AVAILABILITY_REQUIRED', 'NO_EXAMS', 'DATE_IN_PAST']) expect(`err.${c}` in de, c).toBe(true);
  });
});

describe('math notation', () => {
  it('converts a LaTeX subset to readable Unicode and leaves unknown commands visible', () => {
    expect(texToUnicode('F = m \\cdot a')).toBe('F = m · a');
    expect(texToUnicode('v = \\frac{s}{t}')).toBe('v = s⁄t');
    expect(texToUnicode('E = mc^2')).toBe('E = mc²');
    expect(texToUnicode('H_2O')).toBe('H₂O');
    expect(texToUnicode('x^{10}')).toBe('x¹⁰');
    expect(texToUnicode('\\frac{a+b}{c}')).toBe('(a+b)⁄c');
    expect(texToUnicode('\\sqrt{16} = 4')).toBe('√16 = 4');
    expect(texToUnicode('\\unknowncmd')).toBe('\\unknowncmd');
  });
  it('splits text into plain and math parts; unbalanced $ stays plain', () => {
    const p = splitMath('Es gilt $F = m \\cdot a$ und $$v = \\frac{s}{t}$$ fertig.');
    expect(p.map((x) => x.math)).toEqual([false, true, false, true, false]);
    expect(p[3].display).toBe(true);
    expect(splitMath('Das kostet 5$ und mehr')).toEqual([{ text: 'Das kostet 5$ und mehr', math: false }]);
  });
});

describe('time formatting for source metadata', () => {
  it('converts a UTC retrieval timestamp to the student’s time zone', () => {
    const iso = '2026-10-26T18:58:23.089Z';
    expect(formatDateTime(iso, 'de', 'Europe/Berlin')).toMatch(/26\.10\.2026.*19:58/); // CET (UTC+1) after DST ended
    expect(formatDateTime(iso, 'de', 'America/New_York')).toMatch(/26\.10\.2026.*14:58/);
    expect(formatDateTime('2026-07-01T12:00:00Z', 'de', 'Europe/Berlin')).toMatch(/14:00/); // CEST (UTC+2)
  });
  it('shows nothing (so the UI can say "not available") instead of inventing a date', () => {
    expect(formatDateTime(null, 'de', 'Europe/Berlin')).toBeNull();
    expect(formatDate(undefined, 'de', 'Europe/Berlin')).toBeNull();
    expect(formatDateTime('not-a-date', 'de', 'Europe/Berlin')).toBeNull();
  });
  it('date helpers', () => {
    expect(addDaysIso('2026-10-31', 1)).toBe('2026-11-01');
    expect(formatDuration(5400, 'en')).toBe('1 h 30 min');
    expect(formatDuration(600, 'de')).toBe('10 Min.');
  });
});
