import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';

import { Badge, Button, Card, SectionHeader } from '@/components/ui/primitives';
import { DesignTokens } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useAppTheme } from '@/contexts/theme-context';
import {
  buildImportCandidates,
  createNoteSourceRecord,
  detectDuplicateNote,
} from '@/lib/notes-utils';
import {
  createUserImportItems,
  createUserNoteSource,
  listUserImportItems,
  listUserNotes,
  listUserNoteSources,
  updateUserNoteSourceStatus,
} from '@/lib/supabase-notes';
import type { NoteImportItem, NoteProcessingStatus, NoteSource } from '@/types/notes';

import { ContentReview } from './ContentReview';

const maximumTextLength = 2_000_000;
const statuses: NoteProcessingStatus[] = [
  'Draft',
  'Analyzing',
  'Ready for Review',
  'Approved',
  'Rejected',
  'Partially Approved',
];

export function BulkImport() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [sourceName, setSourceName] = useState('');
  const [sourceType, setSourceType] = useState<'TXT' | 'Paste'>('Paste');
  const [rawText, setRawText] = useState('');
  const [source, setSource] = useState<NoteSource | null>(null);
  const [items, setItems] = useState<NoteImportItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState('');

  const characterCount = useMemo(() => rawText.length, [rawText]);

  useEffect(() => {
    let active = true;
    const loadLatestSource = async () => {
      if (!user) {
        setLoadingHistory(false);
        setError('Sign in to create or review import sources.');
        return;
      }
      try {
        const sources = await listUserNoteSources(user.id);
        const latestSource = sources[0];
        if (!latestSource) {
          return;
        }
        const sourceItems = await listUserImportItems(user.id, latestSource.id);
        if (active) {
          setSource(latestSource);
          setItems(sourceItems);
          setSourceName(latestSource.source_name);
          setSourceType(latestSource.source_type);
          setRawText(latestSource.raw_content);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : 'Import history could not be loaded.');
        }
      } finally {
        if (active) {
          setLoadingHistory(false);
        }
      }
    };
    void loadLatestSource();
    return () => {
      active = false;
    };
  }, [user]);

  const selectTextFile = async () => {
    setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) {
        return;
      }
      const asset = result.assets[0];
      if (!asset || !asset.name.toLowerCase().endsWith('.txt')) {
        setError('Choose a .txt file to import.');
        return;
      }
      if (asset.size !== undefined && asset.size > maximumTextLength) {
        setError('This TXT file is larger than the 2 MB import limit. Split the file and import it in parts.');
        return;
      }
      let text: string;
      if (Platform.OS === 'web') {
        if (!asset.file) {
          throw new Error('The browser did not provide access to the selected TXT file.');
        }
        text = await asset.file.text();
      } else {
        const { File } = await import('expo-file-system');
        text = await new File(asset.uri).text();
      }
      if (!text.trim()) {
        setError('The selected TXT file is empty.');
        return;
      }
      if (text.length > maximumTextLength) {
        setError('This TXT file is larger than the 2 MB import limit. Split the file and import it in parts.');
        return;
      }
      setSourceName(asset.name);
      setSourceType('TXT');
      setRawText(text);
    } catch (pickerError) {
      setError(pickerError instanceof Error ? pickerError.message : 'The TXT file could not be read.');
    }
  };

  const handleAnalyze = async () => {
    if (!user) {
      setError('Sign in before importing notes.');
      return;
    }
    if (!sourceName.trim()) {
      setError('Enter a source name or choose a TXT file.');
      return;
    }
    if (!rawText.trim()) {
      setError('Paste text or select a non-empty TXT file before analyzing.');
      return;
    }
    if (rawText.length > maximumTextLength) {
      setError('This source is larger than the 2 MB import limit.');
      return;
    }
    setBusy(true);
    setError('');
    let savedSource: NoteSource | null = null;
    try {
      const draftSource = createNoteSourceRecord({
        userId: user.id,
        sourceName,
        rawContent: rawText,
        sourceType,
        processingStatus: 'Analyzing',
      });
      savedSource = await createUserNoteSource(draftSource);
      const existingNotes = await listUserNotes(user.id);
      const candidates = buildImportCandidates(rawText, savedSource.id).map((candidate) => {
        const duplicate = detectDuplicateNote(existingNotes, {
          title: candidate.proposed_title,
          content: candidate.content ?? candidate.raw_chunk,
          category_id: candidate.proposed_category_id,
          module_id: candidate.proposed_module_id,
          topic_id: candidate.proposed_topic_id,
          subtopic_id: candidate.proposed_subtopic_id,
        });
        return duplicate
          ? {
              ...candidate,
              duplicate_detected: true,
              mapping_reason: `${candidate.mapping_reason ?? ''} Similar saved note already exists.`,
            }
          : candidate;
      });
      const savedCandidates = await createUserImportItems(candidates);
      await updateUserNoteSourceStatus(savedSource.id, 'Ready for Review');
      setSource({ ...savedSource, processing_status: 'Ready for Review' });
      setItems(savedCandidates);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : 'The source could not be analyzed.');
      if (savedSource) {
        try {
          await updateUserNoteSourceStatus(savedSource.id, 'Failed');
          setSource({ ...savedSource, processing_status: 'Failed' });
        } catch (statusError) {
          setError(
            `${analysisError instanceof Error ? analysisError.message : 'The source could not be analyzed.'} ${
              statusError instanceof Error ? statusError.message : 'The source status could not be updated.'
            }`,
          );
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const currentSourceId = source?.id;
  const changeSourceStatus = useCallback(async (status: NoteProcessingStatus) => {
    if (!currentSourceId) {
      return;
    }
    try {
      await updateUserNoteSourceStatus(currentSourceId, status);
      setSource((current) =>
        current && current.id === currentSourceId && current.processing_status !== status
          ? { ...current, processing_status: status }
          : current,
      );
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'The source status could not be updated.');
    }
  }, [currentSourceId]);

  return (
    <View style={styles.content}>
      <SectionHeader title="Bulk Import" subtitle="Raw source text is saved for review; candidates never publish automatically." />
      {error ? <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.danger }]}>{error}</Text> : null}
      {loadingHistory ? <ActivityIndicator accessibilityLabel="Loading import history" color={colors.primary} /> : null}
      <Card style={styles.card}>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.primaryText }]}>Source name</Text>
          <TextInput
            value={sourceName}
            onChangeText={setSourceName}
            placeholder="Name this TXT source"
            placeholderTextColor={colors.secondaryText}
            style={[styles.input, { color: colors.primaryText, borderColor: colors.border, backgroundColor: colors.elevatedSurface }]}
          />
        </View>
        <Button variant="secondary" disabled={busy} onPress={() => void selectTextFile()}>
          Choose .txt file
        </Button>
        <Text style={[styles.meta, { color: colors.secondaryText }]}>
          TXT upload or paste · Maximum 2 MB · {characterCount.toLocaleString()} characters
        </Text>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.primaryText }]}>Paste raw text</Text>
          <TextInput
            value={rawText}
            onChangeText={setRawText}
            multiline
            placeholder="Paste notes here, preserving the original structure."
            placeholderTextColor={colors.secondaryText}
            style={[styles.textArea, { color: colors.primaryText, borderColor: colors.border, backgroundColor: colors.elevatedSurface }]}
          />
        </View>
        <Button disabled={busy || loadingHistory} onPress={() => void handleAnalyze()}>
          {busy ? 'Saving source and organizing…' : 'Analyze & organize'}
        </Button>
      </Card>

      {source ? (
        <>
          <Card style={styles.card}>
            <Text style={[styles.sourceTitle, { color: colors.primaryText }]}>{source.source_name}</Text>
            <Text style={[styles.meta, { color: colors.secondaryText }]}>
              {source.source_type} · {new Date(source.upload_date).toLocaleDateString()} · {source.processing_status}
            </Text>
            <Text style={[styles.rawText, { color: colors.primaryText }]}>{source.raw_content}</Text>
          </Card>
          <ContentReview
            key={source.id}
            initialItems={items}
            onSourceStatusChange={changeSourceStatus}
          />
        </>
      ) : null}
      {source && statuses.includes(source.processing_status) ? (
        <View style={styles.statuses}>
          {statuses.map((status) => (
            <Badge key={status} tone={source.processing_status === status ? 'green' : 'neutral'}>
              {status}
            </Badge>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 32 },
  card: { gap: 14 },
  field: { gap: 8 },
  label: { fontSize: 12, fontWeight: '700' },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.small,
    paddingHorizontal: DesignTokens.spacing.regular,
    paddingVertical: DesignTokens.spacing.medium,
  },
  textArea: {
    minHeight: 220,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.small,
    paddingHorizontal: DesignTokens.spacing.regular,
    paddingVertical: DesignTokens.spacing.medium,
    textAlignVertical: 'top',
  },
  sourceTitle: { fontSize: 18, fontWeight: '700' },
  meta: { fontSize: 12, lineHeight: 18 },
  rawText: { lineHeight: 22 },
  statuses: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  errorText: { fontSize: 14, fontWeight: '600' },
});
