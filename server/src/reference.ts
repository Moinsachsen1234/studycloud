/**
 * Reference data: German federal states and school types.
 * NOTE: School systems change; this table is configuration, not law. Review against current KMK/Land
 * publications before relying on it (see docs/privacy-and-security.md "assumptions requiring review").
 * Grade ranges are *typical* and only used for soft hints — the data model accepts grades 1–13 everywhere.
 */
export interface SchoolType {
  id: string;
  name: string;
  typicalGrades: [number, number];
}

export const FEDERAL_STATES = [
  { id: 'BW', name: 'Baden-Württemberg' },
  { id: 'BY', name: 'Bayern' },
  { id: 'BE', name: 'Berlin' },
  { id: 'BB', name: 'Brandenburg' },
  { id: 'HB', name: 'Bremen' },
  { id: 'HH', name: 'Hamburg' },
  { id: 'HE', name: 'Hessen' },
  { id: 'MV', name: 'Mecklenburg-Vorpommern' },
  { id: 'NI', name: 'Niedersachsen' },
  { id: 'NW', name: 'Nordrhein-Westfalen' },
  { id: 'RP', name: 'Rheinland-Pfalz' },
  { id: 'SL', name: 'Saarland' },
  { id: 'SN', name: 'Sachsen' },
  { id: 'ST', name: 'Sachsen-Anhalt' },
  { id: 'SH', name: 'Schleswig-Holstein' },
  { id: 'TH', name: 'Thüringen' },
] as const;

const t = (id: string, name: string, a: number, b: number): SchoolType => ({ id, name, typicalGrades: [a, b] });
const GS4 = t('grundschule', 'Grundschule', 1, 4);
const GS6 = t('grundschule', 'Grundschule', 1, 6);
const GYM = t('gymnasium', 'Gymnasium', 5, 13);
const GYM7 = t('gymnasium', 'Gymnasium', 7, 13);
const REAL = t('realschule', 'Realschule', 5, 10);
const HAUPT = t('hauptschule', 'Hauptschule', 5, 9);
const GESAMT = t('gesamtschule', 'Gesamtschule', 5, 13);
const GEMEIN = t('gemeinschaftsschule', 'Gemeinschaftsschule', 1, 13);
const OBER = t('oberschule', 'Oberschule', 5, 10);
const SEK = t('sekundarschule', 'Sekundarschule', 5, 10);
const FOERDER = t('foerderschule', 'Förderschule', 1, 13);
const BERUF = t('berufliche_schule', 'Berufliche Schule / Berufskolleg', 10, 13);
const OTHER = t('andere', 'Andere / weiß ich nicht', 1, 13);

export const SCHOOL_TYPES_BY_STATE: Record<string, SchoolType[]> = {
  BW: [GS4, t('werkrealschule', 'Werkrealschule / Hauptschule', 5, 10), REAL, GEMEIN, GYM, BERUF],
  BY: [GS4, t('mittelschule', 'Mittelschule', 5, 10), REAL, GYM, t('wirtschaftsschule', 'Wirtschaftsschule', 7, 10), BERUF],
  BE: [GS6, t('integrierte_sekundarschule', 'Integrierte Sekundarschule', 7, 13), GYM7, GEMEIN, BERUF],
  BB: [GS6, OBER, GESAMT, GYM7, BERUF],
  HB: [GS4, OBER, GYM, BERUF],
  HH: [GS4, t('stadtteilschule', 'Stadtteilschule', 5, 13), GYM, BERUF],
  HE: [GS4, HAUPT, REAL, GYM, t('integrierte_gesamtschule', 'Integrierte Gesamtschule', 5, 13), t('kooperative_gesamtschule', 'Kooperative Gesamtschule', 5, 13), BERUF],
  MV: [GS4, t('regionale_schule', 'Regionale Schule', 5, 10), GESAMT, GYM, BERUF],
  NI: [GS4, HAUPT, REAL, OBER, GESAMT, GYM, BERUF],
  NW: [GS4, HAUPT, REAL, SEK, GESAMT, GYM, BERUF],
  RP: [GS4, t('realschule_plus', 'Realschule plus', 5, 10), t('integrierte_gesamtschule', 'Integrierte Gesamtschule', 5, 13), GYM, BERUF],
  SL: [GS4, GEMEIN, GYM, BERUF],
  SN: [GS4, OBER, GYM, BERUF],
  ST: [GS4, SEK, GEMEIN, GESAMT, GYM, BERUF],
  SH: [GS4, GEMEIN, GYM, BERUF],
  TH: [GS4, t('regelschule', 'Regelschule', 5, 10), GEMEIN, GESAMT, GYM, BERUF],
};

export function schoolTypesFor(stateId: string): SchoolType[] {
  const list = SCHOOL_TYPES_BY_STATE[stateId];
  if (!list) return [];
  return [...list, FOERDER, OTHER];
}

export function isValidSchool(stateId: string, schoolTypeId: string): boolean {
  return schoolTypesFor(stateId).some((s) => s.id === schoolTypeId);
}

/** System subjects (configuration, seeded into the DB — never hard-coded in the UI). */
export const SYSTEM_SUBJECTS = [
  { id: 'math', name_de: 'Mathematik', name_en: 'Mathematics', icon: 'calculator-outline', color: '#6A50D8', sort_order: 10, objectives: ['Rechenwege sicher beherrschen', 'Mathematische Probleme strukturiert lösen'] },
  { id: 'physics', name_de: 'Physik', name_en: 'Physics', icon: 'planet-outline', color: '#1F6FDB', sort_order: 20, objectives: ['Naturphänomene mit Modellen erklären', 'Formeln anwenden und Einheiten prüfen'] },
  { id: 'chemistry', name_de: 'Chemie', name_en: 'Chemistry', icon: 'flask-outline', color: '#D2432E', sort_order: 30, objectives: ['Stoffe und Reaktionen verstehen', 'Reaktionsgleichungen aufstellen'] },
  { id: 'biology', name_de: 'Biologie', name_en: 'Biology', icon: 'leaf-outline', color: '#238A5B', sort_order: 40, objectives: ['Lebewesen und Zusammenhänge verstehen', 'Experimente auswerten'] },
  { id: 'sachunterricht', name_de: 'Sachunterricht', name_en: 'Elementary Science', icon: 'bulb-outline', color: '#A35F00', sort_order: 50, objectives: ['Die Umwelt beobachten und erklären'] },
  { id: 'german', name_de: 'Deutsch', name_en: 'German', icon: 'book-outline', color: '#B83D78', sort_order: 60, objectives: ['Texte verstehen und verfassen', 'Grammatik und Rechtschreibung sicher anwenden'], study_language: 'de' },
  { id: 'english', name_de: 'Englisch', name_en: 'English', icon: 'language-outline', color: '#0E8499', sort_order: 70, objectives: ['Wortschatz und Grammatik festigen', 'Sicher kommunizieren'], study_language: 'en' },
] as const;
