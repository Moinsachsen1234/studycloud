import React, { useEffect, useMemo, useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, uploadDocument, type PickedFile } from '@/lib/api';
import { qk, useCapabilities, useDocuments, useSubjects } from '@/lib/queries';
import { useI18n } from '@/lib/i18n';
import { formatBytes } from '@/lib/format';
import { Button, Card, Chip, ErrorNotice, Icon, InfoNotice, ProgressBar, Row, SkeletonCard, Text } from '@/components/ui';
import { CheckRow, EmptyState, Input, Screen, SectionHeader, SelectField } from '@/components/forms';
import { DocCard, TopBar } from '@/components/common';
import { spacing } from '@/theme/tokens';

const ALLOWED = ['pdf', 'png', 'jpg', 'jpeg', 'heic', 'heif', 'txt', 'docx'];

export default function Upload() {
  const { t, lang, errorText } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const caps = useCapabilities();
  const subjects = useSubjects();
  const [file, setFile] = useState<PickedFile | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [ack, setAck] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filterSubject, setFilterSubject] = useState<string | undefined>();
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  useEffect(() => {
    const h = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(h);
  }, [search]);
  const docs = useDocuments({ query: debounced || undefined, subjectId: filterSubject, status: filterStatus });

  const subjectOptions = useMemo(() => (subjects.data?.subjects ?? []).filter((s) => s.selected).map((s) => ({ value: s.id, label: lang === 'en' ? s.nameEn : s.nameDe })), [subjects.data, lang]);
  const subjectName = (id: string | null) => subjects.data?.subjects.find((s) => s.id === id);
  useEffect(() => {
    if (!subjectId && subjectOptions.length) setSubjectId(subjectOptions[0].value);
  }, [subjectOptions, subjectId]);

  function accept(f: PickedFile): boolean {
    const ext = f.name.toLowerCase().split('.').pop() ?? '';
    if (!ALLOWED.includes(ext)) {
      setError(t('err.UNSUPPORTED_TYPE'));
      return false;
    }
    if (f.size && caps.data && f.size > caps.data.maxUploadBytes) {
      setError(t('err.FILE_TOO_LARGE'));
      return false;
    }
    setError(null);
    setFile(f);
    setName(f.name.replace(/\.[^.]+$/, ''));
    return true;
  }

  async function pickFile() {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    accept({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? 'application/octet-stream', size: a.size, file: (a as any).file });
  }
  async function pickPhoto(camera: boolean) {
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
    }
    const r = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ mediaTypes: ['images'], quality: 0.9 });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const mime = a.mimeType ?? 'image/jpeg';
    accept({ uri: a.uri, name: a.fileName ?? `foto-${Date.now()}.${mime.includes('png') ? 'png' : 'jpg'}`, mimeType: mime, size: a.fileSize, file: (a as any).file });
  }

  async function start() {
    if (!file || !subjectId) return;
    setProgress(0);
    setError(null);
    try {
      const doc = await uploadDocument(file, { subjectId, rightsAck: 'true', name: name.trim() }, setProgress);
      setFile(null);
      setAck(false);
      setName('');
      await Promise.all([qc.invalidateQueries({ queryKey: ['documents'] }), qc.invalidateQueries({ queryKey: qk.dashboard }), qc.invalidateQueries({ queryKey: qk.subjects })]);
      router.push(`/document/${doc.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? errorText(e) : t('common.errorTitle'));
    } finally {
      setProgress(null);
    }
  }

  const isImage = file?.mimeType.startsWith('image/');
  return (
    <Screen>
      <TopBar title={t('upload.title')} />
      <Text muted>{t('upload.intro')}</Text>
      {caps.data && !caps.data.ai.configured ? <InfoNotice tone="warning" message={t('upload.aiOff')} /> : null}
      {caps.data && !caps.data.ocr.configured ? <InfoNotice tone="warning" message={t('upload.ocrOff')} icon="image-outline" /> : null}

      <Card>
        <Row wrap>
          <Button icon="document-attach-outline" title={t('upload.pickFile')} onPress={pickFile} />
          <Button variant="secondary" icon="image-outline" title={t('upload.pickPhoto')} onPress={() => pickPhoto(false)} />
          {Platform.OS !== 'web' ? <Button variant="secondary" icon="camera-outline" title={t('upload.takePhoto')} onPress={() => pickPhoto(true)} /> : null}
        </Row>
        <Text variant="caption" muted>
          {t('upload.formats', { mb: Math.round((caps.data?.maxUploadBytes ?? 20 * 1024 * 1024) / 1024 / 1024) })}
        </Text>

        {file ? (
          <View style={{ gap: spacing.md }}>
            <Text variant="label" muted>
              {t('upload.preview')}
            </Text>
            <Row style={{ alignItems: 'flex-start' }}>
              {isImage ? <Image source={{ uri: file.uri }} accessibilityLabel={file.name} style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: '#0001' }} resizeMode="cover" /> : <Icon name="document-text-outline" size={40} />}
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong" numberOfLines={2}>
                  {file.name}
                </Text>
                <Text variant="caption" muted>
                  {file.size ? formatBytes(file.size) : ''}
                </Text>
              </View>
            </Row>
            <Input label={t('upload.name')} value={name} onChangeText={setName} maxLength={150} />
            <SelectField label={t('upload.subject')} value={subjectId} options={subjectOptions} onChange={setSubjectId} />
            <CheckRow checked={ack} onChange={setAck} label={t('upload.rights')} />
            {progress !== null ? (
              <View style={{ gap: 6 }}>
                <ProgressBar value={progress} label={t('upload.uploading', { p: Math.round(progress * 100) })} />
                <Text variant="caption" muted>
                  {t('upload.uploading', { p: Math.round(progress * 100) })}
                </Text>
              </View>
            ) : null}
            <Row>
              <Button title={t('upload.start')} icon="cloud-upload" loading={progress !== null} disabled={!ack || !subjectId} onPress={start} />
              <Button variant="ghost" title={t('common.cancel')} disabled={progress !== null} onPress={() => setFile(null)} />
            </Row>
          </View>
        ) : null}
        {error ? <ErrorNotice message={error} /> : null}
      </Card>

      <View style={{ gap: spacing.sm }}>
        <SectionHeader title={t('upload.library')} />
        <Input label={t('upload.searchPh')} value={search} onChangeText={setSearch} returnKeyType="search" autoCapitalize="none" />
        <Row wrap gap={8}>
          <Chip label={t('upload.filterAll')} selected={!filterSubject && !filterStatus} onPress={() => { setFilterSubject(undefined); setFilterStatus(undefined); }} />
          {(subjects.data?.subjects ?? []).filter((s) => s.selected).map((s) => (
            <Chip key={s.id} label={lang === 'en' ? s.nameEn : s.nameDe} selected={filterSubject === s.id} onPress={() => setFilterSubject(filterSubject === s.id ? undefined : s.id)} />
          ))}
          <Chip label={t('doc.status.completed')} selected={filterStatus === 'completed'} onPress={() => setFilterStatus(filterStatus === 'completed' ? undefined : 'completed')} />
          <Chip label={t('doc.status.failed')} selected={filterStatus === 'failed'} onPress={() => setFilterStatus(filterStatus === 'failed' ? undefined : 'failed')} />
        </Row>
        {docs.isPending ? <SkeletonCard /> : null}
        {docs.isError ? <ErrorNotice message={errorText(docs.error)} onRetry={() => docs.refetch()} retryLabel={t('common.retry')} /> : null}
        {docs.data && docs.data.documents.length === 0 ? <EmptyState title={t('upload.library')} text={t('upload.libraryEmpty')} /> : null}
        {docs.data?.documents.map((d) => {
          const s = subjectName(d.subjectId);
          return <DocCard key={d.id} doc={d} subjectName={s ? (lang === 'en' ? s.nameEn : s.nameDe) : undefined} onPress={() => router.push(`/document/${d.id}`)} />;
        })}
      </View>
    </Screen>
  );
}
