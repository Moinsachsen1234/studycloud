import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n, type Key } from '@/lib/i18n';
import { useSchools, useSubjects } from '@/lib/queries';
import { Button, Chip, ErrorNotice, Icon, InfoNotice, ProgressBar, Row, Skeleton, Text } from '@/components/ui';
import { Input, Screen } from '@/components/forms';
import { Cloudy, type CloudyState } from '@/components/Cloudy';
import { useTheme } from '@/theme/ThemeProvider';
import { subjectColor } from '@/theme/tokens';
import { spacing } from '@/theme/tokens';
import type { Lang } from '@/lib/types';

const STEPS = ['name', 'grade', 'state', 'school', 'subjects', 'goals', 'lang'] as const;
const CLOUDY: Record<(typeof STEPS)[number], CloudyState> = { name: 'happy', grade: 'neutral', state: 'explaining', school: 'thinking', subjects: 'happy', goals: 'encouraging', lang: 'explaining' };
const GOALS: { id: string; key: Key }[] = [
  { id: 'exam', key: 'onb.goal.exam' },
  { id: 'grades', key: 'onb.goal.grades' },
  { id: 'understand', key: 'onb.goal.understand' },
  { id: 'abitur', key: 'onb.goal.abitur' },
  { id: 'catchup', key: 'onb.goal.catchup' },
  { id: 'homework', key: 'onb.goal.homework' },
];

export default function Onboarding() {
  const { t, lang, setLang, errorText } = useI18n();
  const { colors, scheme } = useTheme();
  const { refreshMe, signOut } = useAuth();
  const schools = useSchools();
  const subjects = useSubjects();
  const [i, setI] = useState(0);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState<number | null>(null);
  const [stateId, setStateId] = useState<string | null>(null);
  const [schoolType, setSchoolType] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [goals, setGoals] = useState<string[]>([]);
  const [customGoal, setCustomGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[i];
  const state = schools.data?.federalStates.find((s) => s.id === stateId);
  const school = state?.schoolTypes.find((s) => s.id === schoolType);
  const subjectIds = picked ?? subjects.data?.subjects.filter((s) => ['math', 'german', 'english'].includes(s.id)).map((s) => s.id) ?? [];
  const gradeHint = school && grade && (grade < school.typicalGrades[0] || grade > school.typicalGrades[1]) ? t('onb.school.hint', { a: school.typicalGrades[0], b: school.typicalGrades[1] }) : null;

  const canNext = useMemo(() => {
    switch (step) {
      case 'name': return name.trim().length > 0;
      case 'grade': return grade !== null;
      case 'state': return !!stateId;
      case 'school': return !!schoolType;
      case 'subjects': return subjectIds.length > 0;
      default: return true;
    }
  }, [step, name, grade, stateId, schoolType, subjectIds.length]);

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin';
      const goalTexts = [...goals.map((g) => t(GOALS.find((x) => x.id === g)!.key)), ...(customGoal.trim() ? [customGoal.trim().slice(0, 80)] : [])];
      await api('/api/me/profile', { method: 'PUT', body: { displayName: name.trim(), grade, uiLanguage: lang, timeZone: tz, learningGoals: goalTexts, federalState: stateId, schoolType, subjectIds } });
      await refreshMe();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const next = () => (i < STEPS.length - 1 ? setI(i + 1) : finish());

  const question: Record<(typeof STEPS)[number], Key> = { name: 'onb.name.q', grade: 'onb.grade.q', state: 'onb.state.q', school: 'onb.school.q', subjects: 'onb.subjects.q', goals: 'onb.goals.q', lang: 'onb.lang.q' };

  return (
    <Screen
      maxWidth={560}
      footer={
        <View style={{ padding: spacing.lg, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'center' }}>
          <View style={{ width: '100%', maxWidth: 560 }}>
            <Button full title={i === STEPS.length - 1 ? t('onb.finish') : t('common.next')} loading={busy} disabled={!canNext} onPress={next} />
          </View>
        </View>
      }
    >
      <Row>
        <Pressable accessibilityRole="button" accessibilityLabel={i === 0 ? t('auth.logout') : t('common.back')} onPress={() => (i === 0 ? signOut() : setI(i - 1))} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={i === 0 ? 'log-out-outline' : 'arrow-back'} size={24} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <ProgressBar value={(i + 1) / STEPS.length} label={t('onb.step', { n: i + 1, total: STEPS.length })} />
        </View>
      </Row>
      <Text variant="caption" muted>
        {t('onb.step', { n: i + 1, total: STEPS.length })}
      </Text>
      <Row gap={spacing.md} style={{ alignItems: 'flex-start' }}>
        <Cloudy state={CLOUDY[step]} size={84} />
        <View style={{ flex: 1, backgroundColor: colors.surfaceAlt, padding: spacing.lg, borderRadius: 16 }}>
          <Text variant="heading" accessibilityRole="header">
            {t(question[step])}
          </Text>
        </View>
      </Row>

      {step === 'name' && <Input label={t('onb.name.ph')} value={name} onChangeText={setName} maxLength={40} autoFocus onSubmitEditing={() => canNext && next()} />}
      {step === 'grade' && (
        <Row wrap gap={spacing.sm}>
          {Array.from({ length: 13 }, (_, k) => k + 1).map((g) => (
            <Chip key={g} label={String(g)} selected={grade === g} onPress={() => setGrade(g)} />
          ))}
        </Row>
      )}
      {step === 'state' &&
        (schools.isPending ? <Skeleton height={200} /> : (
          <View style={{ gap: spacing.sm }}>
            {schools.data?.federalStates.map((s) => (
              <Chip key={s.id} label={s.name} selected={stateId === s.id} onPress={() => { setStateId(s.id); if (!s.schoolTypes.some((x) => x.id === schoolType)) setSchoolType(null); }} />
            ))}
          </View>
        ))}
      {step === 'school' && (
        <View style={{ gap: spacing.sm }}>
          {state?.schoolTypes.map((s) => (
            <Chip key={s.id} label={s.name} selected={schoolType === s.id} onPress={() => setSchoolType(s.id)} />
          ))}
          {gradeHint ? <InfoNotice message={gradeHint} /> : null}
        </View>
      )}
      {step === 'subjects' && (
        <View style={{ gap: spacing.sm }}>
          <Text variant="caption" muted>{t('onb.subjects.hint')}</Text>
          {subjects.data?.subjects.map((s) => (
            <Chip
              key={s.id}
              icon={s.icon}
              color={subjectColor(s.color, scheme)}
              label={lang === 'en' ? s.nameEn : s.nameDe}
              selected={subjectIds.includes(s.id)}
              onPress={() => setPicked(subjectIds.includes(s.id) ? subjectIds.filter((x) => x !== s.id) : [...subjectIds, s.id])}
            />
          ))}
        </View>
      )}
      {step === 'goals' && (
        <View style={{ gap: spacing.sm }}>
          {GOALS.map((g) => (
            <Chip key={g.id} label={t(g.key)} selected={goals.includes(g.id)} onPress={() => setGoals(goals.includes(g.id) ? goals.filter((x) => x !== g.id) : [...goals, g.id])} />
          ))}
          <Input label={t('onb.goals.custom')} value={customGoal} onChangeText={setCustomGoal} maxLength={80} />
        </View>
      )}
      {step === 'lang' && (
        <View style={{ gap: spacing.sm }}>
          {(['de', 'en'] as Lang[]).map((l) => (
            <Chip key={l} label={l === 'de' ? 'Deutsch' : 'English'} selected={lang === l} onPress={() => setLang(l)} />
          ))}
          <Text variant="caption" muted>{t('onb.lang.hint')}</Text>
        </View>
      )}
      {error ? <ErrorNotice message={error} /> : null}
    </Screen>
  );
}
