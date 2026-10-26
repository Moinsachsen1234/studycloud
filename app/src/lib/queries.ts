import { useQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { api } from './api';
import type { Capabilities, Dashboard, Doc, DocDetail, Exam, FederalState, Lesson, PlanItem, ProgramDetail, ProgramSummary, Progress, Subject, TutorMessage } from './types';

export const qk = {
  me: ['me'] as const,
  caps: ['capabilities'] as const,
  schools: ['schools'] as const,
  dashboard: ['dashboard'] as const,
  subjects: ['subjects'] as const,
  subject: (id: string) => ['subject', id] as const,
  documents: (p?: object) => ['documents', p ?? {}] as const,
  document: (id: string) => ['document', id] as const,
  programs: ['programs'] as const,
  program: (id: string) => ['program', id] as const,
  lesson: (id: string) => ['lesson', id] as const,
  exams: ['exams'] as const,
  availability: ['availability'] as const,
  plan: ['plan'] as const,
  progress: ['progress'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversation', id] as const,
};

export const useCapabilities = () => useQuery({ queryKey: qk.caps, queryFn: () => api<Capabilities>('/api/capabilities', { auth: false }), staleTime: 60_000 });
export const useSchools = () => useQuery({ queryKey: qk.schools, queryFn: () => api<{ federalStates: FederalState[] }>('/api/reference/schools', { auth: false }), staleTime: Infinity });
export const useDashboard = () => useQuery({ queryKey: qk.dashboard, queryFn: () => api<Dashboard>('/api/dashboard') });
export const useSubjects = () => useQuery({ queryKey: qk.subjects, queryFn: () => api<{ subjects: Subject[] }>('/api/subjects') });
export const useProgress = () => useQuery({ queryKey: qk.progress, queryFn: () => api<Progress>('/api/progress') });

/** Documents; polls while any document is still being processed (real status, no simulation). */
export const useDocuments = (params: { query?: string; subjectId?: string; status?: string } = {}) =>
  useQuery({
    queryKey: qk.documents(params),
    queryFn: () => api<{ documents: Doc[] }>('/api/documents', { query: params }),
    refetchInterval: (q) => (q.state.data?.documents.some((d) => d.job && ['queued', 'uploading', 'processing', 'analyzing'].includes(d.job.status)) ? 1500 : false),
  });

export const useDocument = (id: string) =>
  useQuery({
    queryKey: qk.document(id),
    queryFn: () => api<DocDetail>(`/api/documents/${id}`),
    refetchInterval: (q) => (q.state.data?.job && ['queued', 'uploading', 'processing', 'analyzing'].includes(q.state.data.job.status) ? 1500 : false),
  });

export const usePrograms = () => useQuery({ queryKey: qk.programs, queryFn: () => api<{ programs: ProgramSummary[] }>('/api/programs') });
export const useProgram = (id: string) => useQuery({ queryKey: qk.program(id), queryFn: () => api<ProgramDetail>(`/api/programs/${id}`) });
export const useLesson = (id: string) => useQuery({ queryKey: qk.lesson(id), queryFn: () => api<Lesson>(`/api/lessons/${id}`) });
export const useExams = () => useQuery({ queryKey: qk.exams, queryFn: () => api<{ exams: Exam[] }>('/api/exams') });
export const useAvailability = () => useQuery({ queryKey: qk.availability, queryFn: () => api<{ configured: boolean; minutes: number[] }>('/api/plan/availability') });
export const usePlan = () => useQuery({ queryKey: qk.plan, queryFn: () => api<{ today: string; items: PlanItem[] }>('/api/plan') });
export const useConversations = () => useQuery({ queryKey: qk.conversations, queryFn: () => api<{ conversations: { id: string; title: string; created_at: string }[] }>('/api/tutor/conversations') });
export const useConversation = (id: string | null) =>
  useQuery({ queryKey: qk.conversation(id ?? 'none'), enabled: !!id, queryFn: () => api<{ conversation: { id: string; title: string }; messages: TutorMessage[] }>(`/api/tutor/conversations/${id}`) });

/** Mutation helper that invalidates the given query keys on success. */
export function useApiMutation<TVars, TRes>(fn: (v: TVars) => Promise<TRes>, invalidate: QueryKey[] = []) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));
    },
  });
}
