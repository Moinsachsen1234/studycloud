import { describe, expect, it } from 'vitest';
import { addDays, buildPlan, weekdayOf } from '../src/services/planner';
import { checkArithmetic, evalArithmetic } from '../src/ai/math';
import { validateUpload } from '../src/documents/validate';

describe('planner', () => {
  const lessons = (n: number, minutes = 30) => Array.from({ length: n }, (_, i) => ({ id: `l${i}`, subjectId: 'physics', title: `L${i}`, minutes }));
  const base = { today: '2026-10-26', availability: [60, 60, 60, 60, 60, 0, 0] }; // 2026-10-26 is a Monday

  it('date helpers', () => {
    expect(weekdayOf('2026-10-26')).toBe(0);
    expect(weekdayOf('2026-11-01')).toBe(6);
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
  it('schedules every lesson before the exam within daily capacity, skipping unavailable days', () => {
    const r = buildPlan({ ...base, exams: [{ id: 'e1', subjectId: 'physics', title: 'Arbeit', examDate: '2026-11-04' }], lessons: lessons(6) });
    const ls = r.items.filter((i) => i.kind === 'lesson');
    expect(ls).toHaveLength(6);
    expect(r.unscheduledLessons).toHaveLength(0);
    expect(r.items.every((i) => i.scheduledFor < '2026-11-04')).toBe(true);
    expect(r.items.some((i) => weekdayOf(i.scheduledFor) >= 5)).toBe(false); // Sat/Sun have 0 minutes
    const perDay = new Map<string, number>();
    r.items.forEach((i) => perDay.set(i.scheduledFor, (perDay.get(i.scheduledFor) ?? 0) + i.minutes));
    expect([...perDay.values()].every((m) => m <= 60)).toBe(true);
  });
  it('reports lessons that do not fit instead of pretending they do', () => {
    const r = buildPlan({ ...base, exams: [{ id: 'e1', subjectId: 'physics', title: 'Arbeit', examDate: '2026-10-28' }], lessons: lessons(10) });
    expect(r.unscheduledLessons.length).toBeGreaterThan(0);
    expect(r.items.filter((i) => i.kind === 'lesson').length + r.unscheduledLessons.length).toBe(10);
  });
  it('ignores exams in the past or today, only plans matching subjects, shares capacity between exams', () => {
    const r = buildPlan({
      ...base,
      exams: [
        { id: 'past', subjectId: 'physics', title: 'alt', examDate: '2026-10-20' },
        { id: 'today', subjectId: 'physics', title: 'heute', examDate: '2026-10-26' },
        { id: 'm', subjectId: 'math', title: 'Mathe', examDate: '2026-10-30' },
        { id: 'p', subjectId: 'physics', title: 'Physik', examDate: '2026-10-30' },
      ],
      lessons: [...lessons(2), { id: 'm1', subjectId: 'math', title: 'M1', minutes: 40 }],
    });
    expect(r.examsInPast.sort()).toEqual(['past', 'today']);
    expect(r.items.filter((i) => i.examId === 'm' && i.kind === 'lesson').map((i) => i.lessonId)).toEqual(['m1']);
    expect(r.items.filter((i) => i.examId === 'p' && i.kind === 'lesson')).toHaveLength(2);
    const perDay = new Map<string, number>();
    r.items.forEach((i) => perDay.set(i.scheduledFor, (perDay.get(i.scheduledFor) ?? 0) + i.minutes));
    expect([...perDay.values()].every((m) => m <= 60)).toBe(true); // capacity is global, not per exam
  });
  it('adds revision sessions in the last days using leftover time', () => {
    const r = buildPlan({ ...base, exams: [{ id: 'e', subjectId: 'physics', title: 'Arbeit', examDate: '2026-11-03' }], lessons: lessons(1, 20) });
    const rev = r.items.filter((i) => i.kind === 'revision');
    expect(rev.length).toBeGreaterThan(0);
    expect(rev.every((i) => i.scheduledFor >= '2026-10-31')).toBe(true);
  });
});

describe('arithmetic checker (no eval)', () => {
  it('evaluates correctly with precedence, powers and decimal commas', () => {
    expect(evalArithmetic('2 + 3 * 4')).toBe(14);
    expect(evalArithmetic('(2 + 3) * 4')).toBe(20);
    expect(evalArithmetic('2^3^2')).toBe(512);
    expect(evalArithmetic('1,5 · 4')).toBe(6);
    expect(evalArithmetic('-3 + 10 / 4')).toBe(-0.5);
  });
  it('rejects code, identifiers and division by zero', () => {
    for (const bad of ['process.exit()', '2 + a', 'constructor', '1/0', '(((', '2 +', '`x`', '1; 2']) expect(checkArithmetic(bad, 0).ok, bad).toBe(false);
  });
  it('compares with tolerance', () => {
    expect(checkArithmetic('1/3', 0.3333333333).ok).toBe(true);
    expect(checkArithmetic('2*3', 7).ok).toBe(false);
  });
});

describe('upload validation', () => {
  const max = 1_000_000;
  it('accepts correct magic bytes only', () => {
    expect(validateUpload('a.png', 'image/png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]), max).ok).toBe(true);
    expect(validateUpload('a.jpg', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), max).ok).toBe(true);
    expect(validateUpload('a.png', 'image/png', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), max).ok).toBe(false); // jpeg named png
    expect(validateUpload('a.txt', 'text/plain', Buffer.from([0xff, 0xfe, 0xfd]), max).ok).toBe(false); // invalid UTF-8
    expect(validateUpload('a.docx', 'x', Buffer.from('PK\x03\x04not really a zip'), max).ok).toBe(false);
  });
});
