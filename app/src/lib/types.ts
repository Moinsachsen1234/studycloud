export type Lang = 'de' | 'en';

export interface Me {
  id: string;
  email: string;
  birthYear: number;
  onboardingCompleted: boolean;
  profile: null | { displayName: string; grade: number; uiLanguage: Lang; timeZone: string; learningGoals: string[]; federalState: string | null; schoolType: string | null };
  subjectIds: string[];
  consents: { aiProcessing: boolean; guardian: boolean };
}

export interface Capabilities {
  ai: { configured: boolean; provider: string | null; model: string | null };
  ocr: { configured: boolean };
  research: { configured: boolean; providers: string[] };
  maxUploadBytes: number;
  digitalConsentAge: number;
  privacyVersion: string;
}

export interface SchoolType { id: string; name: string; typicalGrades: [number, number] }
export interface FederalState { id: string; name: string; schoolTypes: SchoolType[] }

export interface Subject { id: string; nameDe: string; nameEn: string; icon: string; color: string; objectives: string[]; studyLanguage: string | null; isCustom: boolean; selected: boolean; documentCount: number; programCount: number }

export type JobStatus = 'queued' | 'uploading' | 'processing' | 'analyzing' | 'completed' | 'failed';
export interface Job { id: string; status: JobStatus; analysisState: 'pending' | 'done' | 'skipped' | 'failed'; analysisNote: string | null; errorCode: string | null; errorMessage: string | null; attempt: number; startedAt: string | null; finishedAt: string | null }
export interface Doc { id: string; name: string; originalFilename: string; mimeType: string; sizeBytes: number; subjectId: string | null; topicId: string | null; collectionId: string | null; pageCount: number | null; createdAt: string; job: Job | null }
export interface DocDetail extends Doc { concepts: { id: string; kind: string; name: string; description: string | null }[]; objectives: { id: string; text: string }[]; programs: { id: string; title: string }[] }

export interface ExternalSource {
  id: string; title: string; publisher: string | null; author: string | null; url: string; permalink: string; sourceType: string; language: string | null;
  publishedAt: string | null; updatedAt: string | null; retrievedAt: string; lastUsedAt: string | null;
  license: { id: string; url: string | null; holder: string | null } | null; rightsStatus: string; verificationStatus: 'unverified' | 'verified' | 'failed'; verifiedAt: string | null;
  usedFor?: string[]; permissions?: { intended_use: string; permission_status: string; restriction_details: string | null }[];
}
export type SourceRef =
  | { kind: 'external'; source: ExternalSource; location?: string | null; support?: string }
  | { kind: 'document'; documentId: string; documentName: string; page: number | null; location?: string | null; support?: string }
  | { kind: 'ai_generated' };

export interface ProgramSources { myMaterials: { documentId: string; name: string; usedFor: string[] }[]; verifiedExternal: ExternalSource[]; licensedResources: ExternalSource[]; unverifiedExternal: ExternalSource[] }

export interface ProgramSummary { id: string; title: string; description: string; subject_id: string | null; estimated_minutes: number; source_mode: string; lesson_count: number; completed_count: number }
export interface ProgramDetail {
  id: string; title: string; description: string; subjectId: string | null; gradeMin: number; gradeMax: number; estimatedMinutes: number; sourceMode: 'materials_only' | 'materials_plus_research';
  warnings: string[]; generation: { provider?: string; model?: string; generated_at?: string; research_status?: string; dropped_blocks?: number };
  lessons: { id: string; ordinal: number; title: string; estimatedMinutes: number; status: 'not_started' | 'in_progress' | 'completed' }[];
  objectives: { id: string; objective_key: string; text: string }[]; documents: { id: string; name: string }[]; sources: ProgramSources; progress: { completed: number; total: number };
}

export type BlockType = 'explanation' | 'definition' | 'formula' | 'worked_example' | 'common_mistake' | 'summary' | 'revision_activity';
export interface LessonBlock { id: string; type: BlockType; title: string | null; text: string; origin: 'material' | 'external' | 'ai_explanation'; mathChecked: boolean | null; claimIds: string[] }
export interface Lesson {
  id: string; programId: string; programTitle: string; subjectId: string | null; ordinal: number; title: string; estimatedMinutes: number; blocks: LessonBlock[];
  claims: Record<string, { text: string; status: string; sources: SourceRef[] }>; prevLessonId: string | null; nextLessonId: string | null; progress: { status: string; completedAt: string | null };
}

export interface PlanItem { id: string; kind: 'lesson' | 'revision'; title: string; subjectId: string | null; lessonId: string | null; examId: string | null; scheduledFor: string; minutes: number; status: 'planned' | 'done' | 'skipped'; completedAt: string | null; rescheduledFrom: string | null }
export interface Exam { id: string; subjectId: string; title: string; examDate: string; goal: string | null }

export interface Progress { lessonsCompleted: number; programsStarted: number; programsCompleted: number; studySeconds: number; topicsReviewed: number; planItemsDone: number; planItemsDue: number }
export interface Dashboard {
  displayName: string | null; today: string;
  continueLearning: { lessonId: string; title: string; programId: string; programTitle: string } | null;
  subjects: { id: string; nameDe: string; nameEn: string; icon: string; color: string; documents: number; lessons: number; completed: number }[];
  upcomingExams: { id: string; subjectId: string; title: string; examDate: string; daysLeft: number }[];
  todayPlan: PlanItem[];
  recentDocuments: { id: string; name: string; subject_id: string | null; created_at: string; status: JobStatus | null }[];
  progress: Progress;
}

export interface TutorMessage { id: string; role: 'user' | 'assistant'; content: string; provenance: SourceRef[]; createdAt?: string; researchUsed?: boolean }
