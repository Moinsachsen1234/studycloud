import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api';
import { qk, useCapabilities, useConversation, useConversations } from '@/lib/queries';
import { useI18n } from '@/lib/i18n';
import { Button, Chip, ErrorNotice, Icon, InfoNotice, Row, Text } from '@/components/ui';
import { Sheet, ToggleRow } from '@/components/forms';
import { Cloudy } from '@/components/Cloudy';
import { ProvenanceRow } from '@/components/sources';
import { MathText } from '@/components/MathText';
import { useTheme } from '@/theme/ThemeProvider';
import { MIN_TARGET, radius, spacing } from '@/theme/tokens';
import type { SourceRef, TutorMessage } from '@/lib/types';

type Scope = 'all' | 'lesson' | 'program' | 'document';

export default function Tutor() {
  const params = useLocalSearchParams<{ lessonId?: string; programId?: string; documentId?: string; subjectId?: string }>();
  const { t, errorText } = useI18n();
  const { colors } = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const caps = useCapabilities();
  const history = useConversations();
  const [convId, setConvId] = useState<string | null>(null);
  const conv = useConversation(convId);
  const [local, setLocal] = useState<TutorMessage[]>([]);
  const [input, setInput] = useState('');
  const [scope, setScope] = useState<Scope>(params.lessonId ? 'lesson' : params.programId ? 'program' : params.documentId ? 'document' : 'all');
  const [research, setResearch] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const scroller = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    if (params.lessonId) setScope('lesson');
    else if (params.programId) setScope('program');
    else if (params.documentId) setScope('document');
  }, [params.lessonId, params.programId, params.documentId]);

  const messages: TutorMessage[] = [...(conv.data?.messages ?? []), ...local];
  useEffect(() => { setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 50); }, [messages.length, sending]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || sending) return;
    setInput('');
    setError(null);
    setSending(true);
    setLocal((l) => [...l, { id: `l-${Date.now()}`, role: 'user', content: q, provenance: [] }]);
    try {
      const scopeBody = scope === 'lesson' ? { lessonId: params.lessonId, programId: params.programId } : scope === 'program' ? { programId: params.programId } : scope === 'document' ? { documentId: params.documentId } : {};
      const body = { conversationId: convId ?? undefined, question: q, withResearch: research, scope: { ...scopeBody, subjectId: params.subjectId } };
      const r = await api<{ conversationId: string; message: TutorMessage }>('/api/tutor/messages', { method: 'POST', body });
      setConvId(r.conversationId);
      setLocal([]);
      await qc.invalidateQueries({ queryKey: qk.conversation(r.conversationId) });
      await qc.invalidateQueries({ queryKey: qk.conversations });
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', t('common.errorTitle')));
    } finally {
      setSending(false);
    }
  }

  const scopes: { id: Scope; label: string; show: boolean }[] = [
    { id: 'all', label: t('tutor.scope.all'), show: true },
    { id: 'lesson', label: t('tutor.scope.lesson'), show: !!params.lessonId },
    { id: 'program', label: t('tutor.scope.program'), show: !!params.programId },
    { id: 'document', label: t('tutor.scope.document'), show: !!params.documentId },
  ];
  const aiOff = caps.data && !caps.data.ai.configured;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={{ width: '100%', maxWidth: 760, alignSelf: 'center', flex: 1 }}>
          <Row style={{ padding: spacing.lg, paddingBottom: spacing.sm, justifyContent: 'space-between' }}>
            <Row>
              <Cloudy state={sending ? 'thinking' : 'neutral'} size={48} />
              <Text variant="title" accessibilityRole="header">{t('tutor.title')}</Text>
            </Row>
            <Row gap={0}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('tutor.history')} onPress={() => setShowHistory(true)} style={{ width: MIN_TARGET, height: MIN_TARGET, alignItems: 'center', justifyContent: 'center' }}><Icon name="time-outline" size={26} /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={t('tutor.new')} onPress={() => { setConvId(null); setLocal([]); router.setParams({ lessonId: undefined, programId: undefined, documentId: undefined }); setScope('all'); }} style={{ width: MIN_TARGET, height: MIN_TARGET, alignItems: 'center', justifyContent: 'center' }}><Icon name="create-outline" size={26} /></Pressable>
            </Row>
          </Row>

          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
            {aiOff ? <InfoNotice tone="warning" message={t('tutor.aiOff')} /> : null}
            <Text variant="label" muted>{t('tutor.scope')}</Text>
            <Row wrap gap={8}>
              {scopes.filter((s) => s.show).map((s) => <Chip key={s.id} label={s.label} selected={scope === s.id} onPress={() => setScope(s.id)} />)}
            </Row>
            <ToggleRow label={t('tutor.research')} description={t('tutor.researchHint')} value={research && !!caps.data?.research.configured} onChange={(v) => caps.data?.research.configured && setResearch(v)} />
          </View>

          <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }} keyboardShouldPersistTaps="handled">
            {messages.length === 0 ? (
              <View style={{ gap: spacing.md }}>
                <View style={{ backgroundColor: colors.surfaceAlt, padding: spacing.lg, borderRadius: radius.lg }}>
                  <Text>{t('tutor.empty')}</Text>
                </View>
                <Row wrap gap={8}>
                  {(['tutor.suggest1', 'tutor.suggest2', 'tutor.suggest3'] as const).map((k) => <Chip key={k} label={t(k)} onPress={() => setInput(t(k))} />)}
                </Row>
              </View>
            ) : null}
            {messages.map((m) => (
              <View key={m.id} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
                <View accessible accessibilityLabel={`${m.role === 'user' ? '' : 'Cloudy: '}${m.content}`} style={{ backgroundColor: m.role === 'user' ? colors.primary : colors.surface, borderWidth: m.role === 'user' ? 0 : 1, borderColor: colors.border, padding: spacing.md, borderRadius: radius.lg, borderBottomRightRadius: m.role === 'user' ? 4 : radius.lg, borderBottomLeftRadius: m.role === 'user' ? radius.lg : 4 }}>
                  {m.role === 'user' ? <Text style={{ color: colors.onPrimary }}>{m.content}</Text> : <MathText size={16}>{m.content}</MathText>}
                </View>
                {m.role === 'assistant' ? <ProvenanceRow provenance={m.provenance as SourceRef[]} /> : null}
              </View>
            ))}
            {sending ? (
              <Row><Cloudy state="thinking" size={40} /><Text muted>{t('tutor.thinking')}</Text></Row>
            ) : null}
            {error ? (
              <View style={{ gap: spacing.sm }}>
                <ErrorNotice message={errorText(error)} />
                {error.code === 'AI_CONSENT_REQUIRED' ? <Button small variant="secondary" title={t('gen.goSettings')} onPress={() => router.push('/settings')} /> : null}
              </View>
            ) : null}
          </ScrollView>

          <Row style={{ padding: spacing.lg, paddingTop: spacing.sm, alignItems: 'flex-end' }}>
            <TextInput
              accessibilityLabel={t('tutor.placeholder')}
              placeholder={t('tutor.placeholder')}
              placeholderTextColor={colors.textMuted}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={2000}
              onSubmitEditing={() => send(input)}
              style={[{ flex: 1, minHeight: MIN_TARGET, maxHeight: 140, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, color: colors.text, backgroundColor: colors.surface, fontSize: 16 }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
            />
            <Button icon="send" title={t('tutor.send')} disabled={!input.trim() || sending || !!aiOff} onPress={() => send(input)} />
          </Row>
        </View>
      </KeyboardAvoidingView>

      <Sheet visible={showHistory} onClose={() => setShowHistory(false)} title={t('tutor.history')}>
        {history.data?.conversations.map((c) => (
          <Chip key={c.id} label={c.title} selected={c.id === convId} onPress={() => { setConvId(c.id); setLocal([]); setShowHistory(false); }} />
        ))}
        {history.data && !history.data.conversations.length ? <Text muted>–</Text> : null}
      </Sheet>
    </SafeAreaView>
  );
}
