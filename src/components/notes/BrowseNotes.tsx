import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { MarkdownContent } from '@/components/topic-chat/MarkdownContent';
import { Badge, Button, Card, SectionHeader } from '@/components/ui/primitives';
import { DesignTokens } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useAppTheme } from '@/contexts/theme-context';
import { sqlLearningCategories } from '@/data/sqlLearningContent';
import {
  filterNotes,
  getCategoryOptions,
  getLocationLabel,
} from '@/lib/notes-utils';
import { deleteUserNote, listUserNotes, updateUserNote } from '@/lib/supabase-notes';
import type { Note } from '@/types/notes';

type FilterOption = { label: string; value: string };

export function BrowseNotes() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [categoryId, setCategoryId] = useState('all');
  const [moduleId, setModuleId] = useState('all');
  const [topicId, setTopicId] = useState('all');
  const [subtopicId, setSubtopicId] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reloadNotes = useCallback(async () => {
    if (!user) {
      setNotes([]);
      setError('Sign in to browse your saved notes.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setNotes(await listUserNotes(user.id));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Notes could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void Promise.resolve().then(reloadNotes);
  }, [reloadNotes]);

  const categoryOptions = useMemo<FilterOption[]>(
    () => [{ label: 'All Categories', value: 'all' }, ...getCategoryOptions()],
    [],
  );
  const moduleOptions = useMemo<FilterOption[]>(() => {
    const categories = categoryId === 'all'
      ? sqlLearningCategories
      : sqlLearningCategories.filter((category) => category.id === categoryId);
    return [
      { label: 'All Modules', value: 'all' },
      ...categories.flatMap((category) =>
        category.modules.map((module) => ({ label: module.title, value: module.id })),
      ),
    ];
  }, [categoryId]);
  const topicOptions = useMemo<FilterOption[]>(() => {
    const modules = sqlLearningCategories
      .filter((category) => categoryId === 'all' || category.id === categoryId)
      .flatMap((category) => category.modules)
      .filter((module) => moduleId === 'all' || module.id === moduleId);
    return [
      { label: 'All Topics', value: 'all' },
      ...modules.flatMap((module) =>
        module.topics.map((topic) => ({ label: topic.title, value: topic.id })),
      ),
    ];
  }, [categoryId, moduleId]);
  const subtopicOptions = useMemo<FilterOption[]>(() => {
    const topics = sqlLearningCategories
      .filter((category) => categoryId === 'all' || category.id === categoryId)
      .flatMap((category) => category.modules)
      .filter((module) => moduleId === 'all' || module.id === moduleId)
      .flatMap((module) => module.topics)
      .filter((topic) => topicId === 'all' || topic.id === topicId);
    return [
      { label: 'All Subtopics', value: 'all' },
      ...topics.flatMap((topic) =>
        topic.subtopics.map((subtopic) => ({ label: subtopic.title, value: subtopic.id })),
      ),
    ];
  }, [categoryId, moduleId, topicId]);
  const filteredNotes = useMemo(
    () => filterNotes(notes, { categoryId, moduleId, topicId, subtopicId, search }),
    [categoryId, moduleId, notes, search, subtopicId, topicId],
  );

  const openNote = (note: Note) => {
    setSelectedNote(note);
    setEditTitle(note.title);
    setEditContent(note.content);
  };

  const saveEdit = async () => {
    if (!selectedNote || !user) {
      return;
    }
    if (!editTitle.trim()) {
      setError('Enter a title for this note.');
      return;
    }
    if (!editContent.trim()) {
      setError('Enter some content for this note.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await updateUserNote(selectedNote.id, {
        user_id: user.id,
        title: editTitle.trim(),
        content: editContent.trim(),
      });
      setNotes((current) => current.map((note) => (note.id === updated.id ? updated : note)));
      setSelectedNote(updated);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'The note could not be updated.');
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = (note: Note) => {
    const confirmDelete = async () => {
      setSaving(true);
      setError('');
      try {
        await deleteUserNote(note.id, user?.id);
        setNotes((current) => current.filter((item) => item.id !== note.id));
        setSelectedNote(null);
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : 'The note could not be deleted.');
      } finally {
        setSaving(false);
      }
    };
    Alert.alert('Delete note?', `“${note.title}” will be removed from your notes.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void confirmDelete() },
    ]);
  };

  return (
    <View style={styles.content}>
      <SectionHeader title="Browse Notes" subtitle="Browse your saved notes by their Learning Path location." />
      <Card style={styles.panel}>
        <TextInput
          placeholder="Search your notes or taxonomy"
          value={search}
          onChangeText={setSearch}
          placeholderTextColor={colors.secondaryText}
          style={[
            styles.searchInput,
            { color: colors.primaryText, borderColor: colors.border, backgroundColor: colors.elevatedSurface },
          ]}
        />
        <View style={styles.selectorGrid}>
          <SelectorGroup
            label="Category"
            value={categoryId}
            options={categoryOptions}
            onChange={(value) => {
              setCategoryId(value);
              setModuleId('all');
              setTopicId('all');
              setSubtopicId('all');
            }}
          />
          <SelectorGroup
            label="Module"
            value={moduleId}
            options={moduleOptions}
            onChange={(value) => {
              setModuleId(value);
              setTopicId('all');
              setSubtopicId('all');
            }}
          />
          <SelectorGroup
            label="Topic"
            value={topicId}
            options={topicOptions}
            onChange={(value) => {
              setTopicId(value);
              setSubtopicId('all');
            }}
          />
          <SelectorGroup label="Subtopic" value={subtopicId} options={subtopicOptions} onChange={setSubtopicId} />
        </View>
      </Card>

      {loading ? <ActivityIndicator accessibilityLabel="Loading saved notes" color={colors.primary} /> : null}
      {error ? (
        <Card>
          <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.danger }]}>{error}</Text>
          <Button variant="secondary" onPress={() => void reloadNotes()}>Retry</Button>
        </Card>
      ) : null}
      {!loading && !error && filteredNotes.length === 0 ? (
        <Card style={styles.emptyState}>
          <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
            {notes.length === 0 ? 'No Learning Path Notes yet.' : 'No notes match this filter.'}
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.secondaryText }]}>
            {notes.length === 0
              ? 'Create a note or approve an imported note to see it here.'
              : 'Try a different category, topic, or search term.'}
          </Text>
        </Card>
      ) : null}

      {selectedNote ? (
        <Card style={styles.noteCard}>
          <SectionHeader title="Note details" subtitle={getLocationLabel({
            categoryId: selectedNote.category_id,
            moduleId: selectedNote.module_id,
            topicId: selectedNote.topic_id,
            subtopicId: selectedNote.subtopic_id,
          })} />
          <TextInput value={editTitle} onChangeText={setEditTitle} style={[styles.searchInput, { color: colors.primaryText, borderColor: colors.border, backgroundColor: colors.elevatedSurface }]} />
          <TextInput
            value={editContent}
            onChangeText={setEditContent}
            multiline
            style={[styles.editContent, { color: colors.primaryText, borderColor: colors.border, backgroundColor: colors.elevatedSurface }]}
          />
          <SectionHeader title="Preview" />
          <MarkdownContent content={editContent} compactContent />
          <View style={styles.actionRow}>
            <Button disabled={saving} onPress={() => void saveEdit()}>{saving ? 'Saving…' : 'Save changes'}</Button>
            <Button variant="secondary" disabled={saving} onPress={() => deleteNote(selectedNote)}>Delete</Button>
            <Button variant="secondary" disabled={saving} onPress={() => setSelectedNote(null)}>Close</Button>
          </View>
        </Card>
      ) : null}

      <View style={styles.noteList}>
        {filteredNotes.map((note) => (
          <Pressable key={note.id} accessibilityRole="button" onPress={() => openNote(note)}>
            <Card style={styles.noteCard}>
              <View style={styles.cardHeader}>
                <View style={styles.headerText}>
                  <Text style={[styles.noteTitle, { color: colors.primaryText }]}>{note.title}</Text>
                  <Text style={[styles.noteMeta, { color: colors.secondaryText }]}>
                    {getLocationLabel({
                      categoryId: note.category_id,
                      moduleId: note.module_id,
                      topicId: note.topic_id,
                      subtopicId: note.subtopic_id,
                    })}
                  </Text>
                </View>
                <Badge tone={note.source_type === 'Imported' ? 'cyan' : note.source_type === 'Official' ? 'blue' : 'green'}>
                  {note.source_type}
                </Badge>
              </View>
              <MarkdownContent content={note.content} compactContent />
              <Text style={[styles.footerText, { color: colors.secondaryText }]}>
                Created {formatDate(note.created_at)} · Updated {formatDate(note.updated_at)}
              </Text>
            </Card>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function SelectorGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.optionGroup}>
      <Text style={[styles.optionLabel, { color: colors.secondaryText }]}>{label}</Text>
      <View style={styles.optionRow}>
        {options.map((option) => (
          <Button
            key={option.value}
            variant={value === option.value ? 'primary' : 'secondary'}
            accessibilityState={{ selected: value === option.value }}
            style={styles.inlineButton}
            onPress={() => onChange(option.value)}>
            {option.label}
          </Button>
        ))}
      </View>
    </View>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'unknown'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

const styles = StyleSheet.create({
  content: { gap: 16, paddingBottom: 32 },
  panel: { gap: 12 },
  searchInput: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.small,
    paddingHorizontal: DesignTokens.spacing.regular,
    paddingVertical: DesignTokens.spacing.medium,
  },
  selectorGrid: { gap: 12 },
  optionGroup: { gap: 8 },
  optionLabel: { fontSize: 12, fontWeight: '700' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inlineButton: { minHeight: 36, paddingHorizontal: 12 },
  noteList: { gap: 16 },
  noteCard: { gap: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' },
  headerText: { flex: 1, gap: 6 },
  noteTitle: { fontSize: 18, fontWeight: '700' },
  noteMeta: { fontSize: 12 },
  footerText: { fontSize: 12 },
  emptyState: { alignItems: 'center', gap: 8, paddingVertical: 28 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySubtitle: { textAlign: 'center', fontSize: 14, lineHeight: 22 },
  editContent: {
    minHeight: 200,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.small,
    padding: DesignTokens.spacing.regular,
    textAlignVertical: 'top',
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  errorText: { fontSize: 14 },
});
