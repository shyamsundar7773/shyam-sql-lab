import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { usePathname } from 'expo-router';

import { MarkdownContent } from '@/components/topic-chat/MarkdownContent';
import { SqlPracticedNotes } from '@/components/sql-practice/SqlPracticedNotes';
import { Badge, Button, Card, SectionHeader } from '@/components/ui/primitives';
import { useAppShellScrollToTopControl } from '@/components/app-shell/AppShell';
import { DesignTokens } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useAppTheme } from '@/contexts/theme-context';
import { sqlLearningCategories } from '@/data/sqlLearningContent';
import { getLocationLabel } from '@/lib/notes-utils';
import { listUserNotes } from '@/lib/supabase-notes';
import type { Note } from '@/types/notes';

type FilterOption = { label: string; value: string };

export default function MyNotesScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const pathname = usePathname();
  const setScrollToTopVisible = useAppShellScrollToTopControl();
  const [activeSection, setActiveSection] = useState<'learning' | 'practice'>('learning');
  const [notes, setNotes] = useState<Note[]>([]);
  const [categoryId, setCategoryId] = useState('all');
  const [topicId, setTopicId] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  useEffect(() => {
    if (pathname !== '/my-notes') {
      setScrollToTopVisible(false);
      return;
    }
    setScrollToTopVisible(true);
    return () => setScrollToTopVisible(false);
  }, [pathname, setScrollToTopVisible]);

  const loadNotes = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    if (!user) {
      setNotes([]);
      setError('Sign in to view your learning path notes.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const savedNotes = await listUserNotes(user.id, { categoryId, topicId });
      if (currentRequestId === requestId.current) {
        setNotes(savedNotes);
      }
    } catch (loadError) {
      if (currentRequestId === requestId.current) {
        setNotes([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Learning path notes could not be loaded.',
        );
      }
    } finally {
      if (currentRequestId === requestId.current) {
        setLoading(false);
      }
    }
  }, [categoryId, topicId, user]);

  useEffect(() => {
    if (pathname === '/my-notes') {
      void Promise.resolve().then(loadNotes);
    }
  }, [loadNotes, pathname]);

  const categoryOptions = useMemo<FilterOption[]>(
    () => [
      { label: 'All Categories', value: 'all' },
      ...sqlLearningCategories.map((category) => ({
        label: category.title,
        value: category.id,
      })),
    ],
    [],
  );
  const topicOptions = useMemo<FilterOption[]>(() => {
    const categories =
      categoryId === 'all'
        ? sqlLearningCategories
        : sqlLearningCategories.filter((category) => category.id === categoryId);
    const topics = new Map<string, string>();
    categories.forEach((category) =>
      category.modules.forEach((module) =>
        module.topics.forEach((topic) => topics.set(topic.id, topic.title)),
      ),
    );
    return [
      { label: 'All Topics', value: 'all' },
      ...Array.from(topics, ([value, label]) => ({ value, label })),
    ];
  }, [categoryId]);
  const filteredNotes = notes;

  return (
    <View style={styles.screen}>
      <SectionHeader
        title="My Notes"
        subtitle="Your saved learning notes and SQL practice reviews, organized separately."
      />
      <View style={[styles.toggle, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
        <Button
          variant={activeSection === 'learning' ? 'primary' : 'secondary'}
          style={styles.tabButton}
          accessibilityState={{ selected: activeSection === 'learning' }}
          onPress={() => setActiveSection('learning')}>
          Learning Path Notes
        </Button>
        <Button
          variant={activeSection === 'practice' ? 'primary' : 'secondary'}
          style={styles.tabButton}
          accessibilityState={{ selected: activeSection === 'practice' }}
          onPress={() => setActiveSection('practice')}>
          SQL Practiced Notes
        </Button>
      </View>

      {activeSection === 'learning' ? (
        <View style={styles.learningSection}>
          <View style={styles.filters}>
            <FilterField
              label="Category"
              value={categoryId}
              options={categoryOptions}
              onChange={(nextCategoryId) => {
                setCategoryId(nextCategoryId);
                setTopicId('all');
              }}
            />
            <FilterField
              label="Topic"
              value={topicId}
              options={topicOptions}
              onChange={setTopicId}
            />
          </View>

          {loading ? <ActivityIndicator accessibilityLabel="Loading learning path notes" color={colors.primary} /> : null}
          {error ? (
            <Card>
              <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.danger }]}>
                {error}
              </Text>
              <Button
                variant="secondary"
                onPress={() => void loadNotes()}>
                Retry
              </Button>
            </Card>
          ) : null}
          {!loading && !error && filteredNotes.length === 0 ? (
            <Card style={styles.emptyCard}>
              <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
                {notes.length === 0 ? 'No Learning Path Notes yet.' : 'No notes match these filters.'}
              </Text>
              <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
                {notes.length === 0
                  ? 'Add and save a learning note to see it here.'
                  : 'Choose another category or topic to see more notes.'}
              </Text>
            </Card>
          ) : null}
          {filteredNotes.map((note) => (
            <Card key={note.id} style={styles.noteCard}>
              <View style={styles.chatHeader}>
                <View style={[styles.noteAvatar, { backgroundColor: colors.primarySoft }]}>
                  <Text style={[styles.avatarText, { color: colors.primary }]}>N</Text>
                </View>
                <View style={styles.noteHeading}>
                  <Text style={[styles.noteTitle, { color: colors.primaryText }]}>{note.title}</Text>
                  <View style={styles.metadata}>
                    <Badge tone={note.source_type === 'Imported' ? 'cyan' : 'green'}>
                      {note.source_type}
                    </Badge>
                    <Text style={[styles.updatedText, { color: colors.secondaryText }]}>
                      Updated {formatNoteDate(note.updated_at)}
                    </Text>
                  </View>
                </View>
              </View>
              <View style={[styles.noteBubble, { backgroundColor: colors.surfaceMuted }]}>
                <MarkdownContent content={note.content} compactContent />
              </View>
              <Text style={[styles.noteLocation, { color: colors.secondaryText }]}>
                {getLocationLabel({
                  categoryId: note.category_id,
                  moduleId: note.module_id,
                  topicId: note.topic_id,
                  subtopicId: note.subtopic_id,
                })}
              </Text>
            </Card>
          ))}
        </View>
      ) : (
        <SqlPracticedNotes />
      )}
    </View>
  );
}

function FilterField({
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
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value);

  return (
    <View style={[styles.filterField, open && styles.filterFieldOpen]}>
      <Text style={[styles.filterLabel, { color: colors.primaryText }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedOption?.label ?? options[0]?.label ?? ''}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((current) => !current)}
        style={[
          styles.filterButton,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        <Text style={[styles.filterValue, { color: colors.primaryText }]} numberOfLines={1}>
          {selectedOption?.label ?? options[0]?.label}
        </Text>
        <Text style={{ color: colors.secondaryText }}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open ? (
        <View
          style={[
            styles.filterOptions,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}>
          <ScrollView nestedScrollEnabled style={styles.optionScroll}>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    { backgroundColor: selected || pressed ? colors.primarySoft : colors.surface },
                  ]}>
                  <Text
                    style={[
                      styles.optionText,
                      { color: selected ? colors.primary : colors.primaryText },
                    ]}>
                    {option.label}
                  </Text>
                  {selected ? (
                    <Text accessibilityElementsHidden style={{ color: colors.primary, fontWeight: '800' }}>
                      ✓
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function formatNoteDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'unknown'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minWidth: 0,
    gap: 16,
  },
  learningSection: {
    gap: 12,
    paddingBottom: 28,
  },
  toggle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: 5,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.medium,
  },
  tabButton: {
    flex: 1,
    minWidth: 150,
    minHeight: 42,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    zIndex: 2,
  },
  filterField: {
    flex: 1,
    minWidth: 145,
    gap: 6,
  },
  filterFieldOpen: {
    zIndex: 10,
    elevation: 8,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  filterButton: {
    minHeight: 46,
    borderRadius: DesignTokens.radius.small,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  filterValue: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
  },
  filterOptions: {
    borderWidth: 1,
    borderRadius: DesignTokens.radius.small,
    maxHeight: 210,
    overflow: 'hidden',
    ...DesignTokens.elevation.card,
  },
  optionScroll: {
    maxHeight: 210,
  },
  option: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
  },
  optionText: {
    fontSize: 13,
  },
  noteCard: {
    gap: 12,
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noteAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
  },
  noteHeading: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  metadata: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  updatedText: {
    fontSize: 11,
  },
  noteBubble: {
    borderRadius: DesignTokens.radius.medium,
    padding: 14,
  },
  noteLocation: {
    fontSize: 12,
    lineHeight: 18,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
  },
});
