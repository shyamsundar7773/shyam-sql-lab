import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Card, SectionHeader } from '@/components/ui/primitives';
import { DesignTokens } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useAppTheme } from '@/contexts/theme-context';
import {
  getCategoryOptions,
  getModuleOptions,
  getSubtopicOptions,
  getTopicOptions,
} from '@/lib/notes-utils';
import {
  approveUserImportItem,
  rejectUserImportItem,
  updateImportItem,
} from '@/lib/supabase-notes';
import type { NoteImportItem, NoteProcessingStatus } from '@/types/notes';

export function ContentReview({
  initialItems,
  onSourceStatusChange,
}: {
  initialItems: NoteImportItem[];
  onSourceStatusChange: (status: NoteProcessingStatus) => void;
}) {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [items, setItems] = useState(initialItems);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (items.length === 0) {
      return;
    }
    const approved = items.filter((item) => item.review_status === 'Approved').length;
    const rejected = items.filter((item) => item.review_status === 'Rejected').length;
    const pending = items.length - approved - rejected;
    onSourceStatusChange(
      pending > 0
        ? approved + rejected > 0
          ? 'Partially Approved'
          : 'Ready for Review'
        : approved > 0
          ? rejected > 0
            ? 'Partially Approved'
            : 'Approved'
          : 'Rejected',
    );
  }, [items, onSourceStatusChange]);

  const saveCandidate = async (item: NoteImportItem, changes: Partial<NoteImportItem>) => {
    setSavingId(item.id);
    setError('');
    try {
      const updated = await updateImportItem(item.id, changes);
      setItems((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save the review changes.');
    } finally {
      setSavingId(null);
    }
  };

  const approve = async (item: NoteImportItem, keepDuplicate = false): Promise<boolean> => {
    if (!user) {
      setError('Sign in before approving imported notes.');
      return false;
    }
    if (item.duplicate_detected && !keepDuplicate) {
      setError('This item may be a duplicate. Choose Keep Both & Approve or reject it.');
      return false;
    }
    if (!item.final_category_id || !item.final_module_id || !item.final_topic_id || !item.final_subtopic_id) {
      setError('Choose a valid Category, Module, Topic, and Subtopic before approval.');
      return false;
    }
    setSavingId(item.id);
    setError('');
    try {
      await approveUserImportItem(item.id);
      setItems((current) => current.map((candidate) =>
        candidate.id === item.id
          ? { ...candidate, review_status: 'Approved', approved_by: user.id, approved_at: new Date().toISOString() }
          : candidate,
      ));
      return true;
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : 'Could not approve this note.');
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const reject = async (item: NoteImportItem) => {
    setSavingId(item.id);
    setError('');
    try {
      await rejectUserImportItem(item.id);
      setItems((current) => current.map((candidate) =>
        candidate.id === item.id ? { ...candidate, review_status: 'Rejected' } : candidate,
      ));
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : 'Could not reject this note.');
    } finally {
      setSavingId(null);
    }
  };

  const approveAll = async () => {
    const pending = items.filter((item) => item.review_status === 'Pending' && !item.duplicate_detected);
    if (pending.length === 0) {
      setError('There are no non-duplicate pending candidates to approve.');
      return;
    }
    for (const item of pending) {
      const approved = await approve(item);
      if (!approved) {
        return;
      }
    }
  };

  return (
    <View style={styles.content}>
      <SectionHeader title="Content Review" subtitle="Nothing is added to Learning Path Notes until you approve it." />
      {error ? <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      {items.map((item) => (
        <ReviewCard
          key={`${item.id}-${item.updated_at ?? ''}`}
          item={item}
          busy={savingId === item.id}
          onSave={(changes) => void saveCandidate(item, changes)}
          onApprove={(keepDuplicate) => void approve(item, keepDuplicate)}
          onReject={() => void reject(item)}
        />
      ))}
      <Button onPress={() => void approveAll()} disabled={savingId !== null}>
        Approve all non-duplicates
      </Button>
    </View>
  );
}

function ReviewCard({
  item,
  busy,
  onSave,
  onApprove,
  onReject,
}: {
  item: NoteImportItem;
  busy: boolean;
  onSave: (changes: Partial<NoteImportItem>) => void;
  onApprove: (keepDuplicate?: boolean) => void;
  onReject: () => void;
}) {
  const { colors } = useAppTheme();
  const [title, setTitle] = useState(item.proposed_title);
  const [content, setContent] = useState(item.content ?? item.raw_chunk);
  const [categoryId, setCategoryId] = useState(item.final_category_id ?? item.proposed_category_id);
  const [moduleId, setModuleId] = useState(item.final_module_id ?? item.proposed_module_id);
  const [topicId, setTopicId] = useState(item.final_topic_id ?? item.proposed_topic_id);
  const [subtopicId, setSubtopicId] = useState(item.final_subtopic_id ?? item.proposed_subtopic_id);
  const [locationConfirmed, setLocationConfirmed] = useState(item.review_status !== 'Needs Decision');

  const categories = getCategoryOptions();
  const modules = getModuleOptions(categoryId);
  const topics = getTopicOptions(moduleId);
  const subtopics = getSubtopicOptions(topicId);
  const locationValid = modules.some((option) => option.value === moduleId)
    && topics.some((option) => option.value === topicId)
    && subtopics.some((option) => option.value === subtopicId);
  const locationSaved =
    item.final_category_id === categoryId &&
    item.final_module_id === moduleId &&
    item.final_topic_id === topicId &&
    item.final_subtopic_id === subtopicId;
  const contentSaved = item.proposed_title === title && (item.content ?? item.raw_chunk) === content;
  const approvalReady =
    locationValid &&
    locationSaved &&
    contentSaved &&
    item.final_category_id !== null &&
    item.final_module_id !== null &&
    item.final_topic_id !== null &&
    item.final_subtopic_id !== null &&
    item.review_status !== 'Needs Decision';

  const changeCategory = (next: string) => {
    const nextModule = getModuleOptions(next)[0]?.value ?? '';
    const nextTopic = getTopicOptions(nextModule)[0]?.value ?? '';
    const nextSubtopic = getSubtopicOptions(nextTopic)[0]?.value ?? '';
    setCategoryId(next);
    setModuleId(nextModule);
    setTopicId(nextTopic);
    setSubtopicId(nextSubtopic);
    setLocationConfirmed(true);
  };
  const changeModule = (next: string) => {
    const nextTopic = getTopicOptions(next)[0]?.value ?? '';
    setModuleId(next);
    setTopicId(nextTopic);
    setSubtopicId(getSubtopicOptions(nextTopic)[0]?.value ?? '');
    setLocationConfirmed(true);
  };
  const changeTopic = (next: string) => {
    setTopicId(next);
    setSubtopicId(getSubtopicOptions(next)[0]?.value ?? '');
    setLocationConfirmed(true);
  };

  return (
    <Card style={styles.card}>
      <Text style={[styles.title, { color: colors.primaryText }]}>{item.proposed_title}</Text>
      <Text style={[styles.meta, { color: colors.secondaryText }]}>Raw source chunk: {item.raw_chunk}</Text>
      <Text style={[styles.meta, { color: colors.secondaryText }]}>
        Confidence: {(item.confidence * 100).toFixed(0)}% · {item.review_status}
      </Text>
      <Text style={[styles.meta, { color: colors.secondaryText }]}>{item.mapping_reason}</Text>
      {item.duplicate_detected ? (
        <Text style={[styles.duplicate, { color: colors.danger }]}>Possible Duplicate — review before deciding to keep or reject.</Text>
      ) : null}
      {item.review_status === 'Needs Decision' ? (
        <Text style={[styles.duplicate, { color: colors.warning }]}>Needs Decision — select an existing Learning Path location or reject this item.</Text>
      ) : null}

      <TextInput value={title} onChangeText={setTitle} placeholder="Candidate title" style={[styles.input, { color: colors.primaryText, borderColor: colors.border, backgroundColor: colors.elevatedSurface }]} />
      <TextInput value={content} onChangeText={setContent} multiline style={[styles.textArea, { color: colors.primaryText, borderColor: colors.border, backgroundColor: colors.elevatedSurface }]} />

      <LocationSelector label="Category" value={categoryId} options={categories} onChange={changeCategory} />
      <LocationSelector label="Module" value={moduleId} options={modules} onChange={changeModule} />
      <LocationSelector label="Topic" value={topicId} options={topics} onChange={changeTopic} />
      <LocationSelector
        label="Subtopic"
        value={subtopicId}
        options={subtopics}
        onChange={(next) => {
          setSubtopicId(next);
          setLocationConfirmed(true);
        }}
      />

      <View style={styles.actions}>
        <Button variant="secondary" disabled={busy} onPress={() => onSave({
          proposed_title: title.trim(),
          content: content.trim(),
          final_category_id: locationValid && locationConfirmed ? categoryId : null,
          final_module_id: locationValid && locationConfirmed ? moduleId : null,
          final_topic_id: locationValid && locationConfirmed ? topicId : null,
          final_subtopic_id: locationValid && locationConfirmed ? subtopicId : null,
          review_status: locationValid && locationConfirmed ? 'Pending' : 'Needs Decision',
        })}>Save edits/location</Button>
        <Button disabled={busy || !approvalReady} onPress={() => onApprove(item.duplicate_detected)}>{busy ? 'Saving…' : item.duplicate_detected ? 'Keep Both & Approve' : 'Approve'}</Button>
        <Button variant="secondary" disabled={busy} onPress={onReject}>{busy ? 'Saving…' : 'Reject / Skip duplicate'}</Button>
      </View>
    </Card>
  );
}

function LocationSelector({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.selector}>
      <Text style={[styles.label, { color: colors.secondaryText }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.optionRow}>
        {options.map((option) => (
          <Button
            key={option.value}
            variant={value === option.value ? 'primary' : 'secondary'}
            accessibilityState={{ selected: value === option.value }}
            style={styles.optionButton}
            onPress={() => onChange(option.value)}>
            {option.label}
          </Button>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  card: { gap: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  meta: { fontSize: 13, lineHeight: 20 },
  duplicate: { fontSize: 13, fontWeight: '700' },
  input: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.small,
    paddingHorizontal: 14,
  },
  textArea: {
    minHeight: 120,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.small,
    padding: 14,
    textAlignVertical: 'top',
  },
  selector: { gap: 6 },
  label: { fontSize: 12, fontWeight: '700' },
  optionRow: { flexDirection: 'row', gap: 8 },
  optionButton: { minHeight: 36, paddingHorizontal: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  error: { fontSize: 14, fontWeight: '600' },
});
