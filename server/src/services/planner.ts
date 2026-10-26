/** Deterministic study-plan builder. Pure function → easy to test. Dates are 'YYYY-MM-DD' (no time zones). */
export interface PlanExam {
  id: string;
  subjectId: string;
  title: string;
  examDate: string;
}
export interface PlanLesson {
  id: string;
  subjectId: string;
  title: string;
  minutes: number;
}
export interface PlanDraftItem {
  examId: string;
  subjectId: string;
  lessonId: string | null;
  kind: 'lesson' | 'revision';
  title: string;
  scheduledFor: string;
  minutes: number;
}
export interface PlanResult {
  items: PlanDraftItem[];
  unscheduledLessons: { lessonId: string; examId: string }[];
  examsInPast: string[];
}

export const addDays = (d: string, n: number) => {
  const t = new Date(d + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
/** Monday = 0 */
export const weekdayOf = (d: string) => (new Date(d + 'T00:00:00Z').getUTCDay() + 6) % 7;

export function buildPlan(args: { exams: PlanExam[]; lessons: PlanLesson[]; availability: number[]; today: string; revisionMinutes?: number; revisionDaysBeforeExam?: number }): PlanResult {
  const revMin = args.revisionMinutes ?? 30;
  const revDays = args.revisionDaysBeforeExam ?? 3;
  const remaining = new Map<string, number>(); // date → minutes left
  const cap = (d: string) => (remaining.has(d) ? remaining.get(d)! : args.availability[weekdayOf(d)] ?? 0);
  const take = (d: string, m: number) => remaining.set(d, cap(d) - m);
  const items: PlanDraftItem[] = [];
  const unscheduled: PlanResult['unscheduledLessons'] = [];
  const past: string[] = [];

  const exams = [...args.exams].sort((a, b) => a.examDate.localeCompare(b.examDate));
  for (const ex of exams) {
    if (ex.examDate <= args.today) {
      past.push(ex.id);
      continue;
    }
    const days: string[] = [];
    for (let d = args.today; d < ex.examDate; d = addDays(d, 1)) days.push(d);
    const lessons = args.lessons.filter((l) => l.subjectId === ex.subjectId);
    for (const l of lessons) {
      const day = days.find((d) => cap(d) >= l.minutes);
      if (!day) {
        unscheduled.push({ lessonId: l.id, examId: ex.id });
        continue;
      }
      take(day, l.minutes);
      items.push({ examId: ex.id, subjectId: ex.subjectId, lessonId: l.id, kind: 'lesson', title: l.title, scheduledFor: day, minutes: l.minutes });
    }
    // revision in the last days before the exam, using leftover capacity
    for (const d of days.slice(-revDays)) {
      if (cap(d) >= revMin) {
        take(d, revMin);
        items.push({ examId: ex.id, subjectId: ex.subjectId, lessonId: null, kind: 'revision', title: `Wiederholung: ${ex.title}`, scheduledFor: d, minutes: revMin });
      }
    }
  }
  items.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor) || a.minutes - b.minutes);
  return { items, unscheduledLessons: unscheduled, examsInPast: past };
}
