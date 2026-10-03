import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MarkdownContent } from '@/components/topic-chat/MarkdownContent';
import { Badge, Button, Card, SectionHeader } from '@/components/ui/primitives';
import { DesignTokens } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useAppTheme } from '@/contexts/theme-context';
import { sqlLearningCategories } from '@/data/sqlLearningContent';
import { supabase } from '@/lib/supabase';
import { filterPracticedSets, getPracticeQuestionReview } from '@/lib/sql-practice-notes';
import type {
  PracticeConversationMessage,
  PracticeQuestionRecord,
  SqlPracticeDifficulty,
  SqlPracticeQuestionType,
  SqlPracticeStatus,
} from '@/types/sql-practice';

type PracticeConfiguration = {
  categoryId: string;
  moduleId: string;
  topicId: string;
  subtopicId: string;
  difficulty: SqlPracticeDifficulty;
  questionType: SqlPracticeQuestionType;
  count: number;
};

type PracticeSet = {
  id: string;
  config: PracticeConfiguration;
  set_number: number;
  title: string;
  bookmarked: boolean;
  created_at: string;
  updated_at: string;
  questions: PracticeQuestionRecord[];
};

type PracticeAttempt = {
  question_id: string;
  sql: string;
  created_at: string;
};

type PracticeNoteData = {
  sets: PracticeSet[];
  attempts: PracticeAttempt[];
  messages: PracticeConversationMessage[];
};

type FilterOption = { label: string; value: string };

export function SqlPracticedNotes() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const [data, setData] = useState<PracticeNoteData>({ sets: [], attempts: [], messages: [] });
  const [categoryId, setCategoryId] = useState('all');
  const [topicId, setTopicId] = useState('all');
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadNotes = async () => {
      if (!user || !supabase) {
        setData({ sets: [], attempts: [], messages: [] });
        setError(user ? 'Practice storage is not configured.' : 'Sign in to view your practiced notes.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      try {
        const setsResult = await supabase
          .from('practice_sets')
          .select('id,config,set_number,title,bookmarked,created_at,updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });
        if (setsResult.error) {
          throw setsResult.error;
        }
        const savedSets = (setsResult.data ?? []) as unknown as Omit<PracticeSet, 'questions'>[];
        const setIds = savedSets.map((set) => set.id);
        let questions: PracticeQuestionRecord[] = [];
        if (setIds.length > 0) {
          const questionsResult = await supabase
            .from('practice_questions')
            .select('*')
            .in('set_id', setIds)
            .order('position', { ascending: true });
          if (questionsResult.error) {
            throw questionsResult.error;
          }
          questions = (questionsResult.data ?? []) as unknown as PracticeQuestionRecord[];
        }
        const questionIds = questions.map((question) => question.id);
        let attempts: PracticeAttempt[] = [];
        let messages: PracticeConversationMessage[] = [];
        if (questionIds.length > 0) {
          const [attemptsResult, messagesResult] = await Promise.all([
            supabase
              .from('practice_attempts')
              .select('question_id,sql,created_at')
              .in('question_id', questionIds)
              .order('created_at', { ascending: false }),
            supabase
              .from('practice_evaluator_messages')
              .select('*')
              .in('question_id', questionIds)
              .order('created_at', { ascending: true }),
          ]);
          if (attemptsResult.error) {
            throw attemptsResult.error;
          }
          if (messagesResult.error) {
            throw messagesResult.error;
          }
          attempts = (attemptsResult.data ?? []) as PracticeAttempt[];
          messages = (messagesResult.data ?? []) as unknown as PracticeConversationMessage[];
        }
        if (!active) {
          return;
        }
        setData({
          sets: savedSets.map((set) => ({
            ...set,
            questions: questions.filter((question) => question.set_id === set.id),
          })),
          attempts,
          messages,
        });
      } catch (loadError) {
        if (active) {
          setError(getErrorMessage(loadError, 'SQL Practiced Notes could not be loaded.'));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void loadNotes();
    return () => {
      active = false;
    };
  }, [user]);

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
    const uniqueTopics = new Map<string, string>();
    categories.forEach((category) =>
      category.modules.forEach((module) =>
        module.topics.forEach((topic) => uniqueTopics.set(topic.id, topic.title)),
      ),
    );
    return [
      { label: 'All Topics', value: 'all' },
      ...Array.from(uniqueTopics, ([value, label]) => ({ value, label })),
    ];
  }, [categoryId]);
  const filteredSets = useMemo(
    () => filterPracticedSets(data.sets, categoryId, topicId),
    [categoryId, data.sets, topicId],
  );
  const selectedSet = data.sets.find((set) => set.id === selectedSetId) ?? null;
  const selectedQuestion =
    selectedSet?.questions.find((question) => question.id === selectedQuestionId) ?? null;
  const review = selectedQuestion
    ? getPracticeQuestionReview(
        selectedQuestion,
        data.attempts.filter((attempt) => attempt.question_id === selectedQuestion.id),
        data.messages.filter((message) => message.question_id === selectedQuestion.id),
      )
    : null;

  if (selectedQuestion && selectedSet && review) {
    const category = findCategory(selectedSet.config.categoryId);
    const topic = findTopic(selectedSet.config.topicId);
    return (
      <View style={styles.screen}>
        <Button variant="secondary" onPress={() => setSelectedQuestionId(null)}>
          Back to questions
        </Button>
        <SectionHeader
          title={`Question ${selectedQuestion.position + 1}`}
          subtitle={`${category} · ${topic} · Set ${selectedSet.set_number}`}
        />
        <Card style={styles.detailCard}>
          <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>Question</Text>
          <Text style={[styles.questionText, { color: colors.primaryText }]}>
            {selectedQuestion.content.prompt}
          </Text>
          <Text style={[styles.contextText, { color: colors.secondaryText }]}>
            {selectedQuestion.content.explanation}
          </Text>
        </Card>
        <ReviewCodeCard
          title="Correct Answer"
          content={
            review.correctAnswer ||
            'A correct SQL answer was not stored for this older practice question.'
          }
        />
        <ReviewCodeCard
          title="Attempted Answer"
          content={review.attemptedAnswer || 'No SQL attempt or draft has been saved yet.'}
        />
        <Card style={styles.detailCard}>
          <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>AI Notes</Text>
          {review.aiMessages.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
              No evaluator conversation was saved for this question.
            </Text>
          ) : (
            <View style={styles.aiNotes}>
              {review.aiMessages.map((message) => (
                <View
                  key={message.id}
                  style={[
                    styles.aiNote,
                    { backgroundColor: message.role === 'user' ? colors.primarySoft : colors.surfaceMuted },
                  ]}>
                  <Text style={[styles.noteRole, { color: colors.secondaryText }]}>
                    {message.role === 'user' ? 'You asked' : 'AI explained'}
                  </Text>
                  {message.role === 'assistant' ? (
                    <MarkdownContent content={message.content} compactContent />
                  ) : (
                    <Text style={[styles.questionText, { color: colors.primaryText }]}>
                      {message.content}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </Card>
      </View>
    );
  }

  if (selectedSet) {
    const category = findCategory(selectedSet.config.categoryId);
    const topic = findTopic(selectedSet.config.topicId);
    return (
      <View style={styles.screen}>
        <Button variant="secondary" onPress={() => setSelectedSetId(null)}>
          Back to practiced sets
        </Button>
        <SectionHeader
          title={`${category} · ${topic}`}
          subtitle={`Practice Set ${selectedSet.set_number} · ${selectedSet.config.difficulty}`}
        />
        <View style={styles.questionList}>
          {selectedSet.questions.map((question) => (
            <Pressable
              key={question.id}
              accessibilityRole="button"
              onPress={() => setSelectedQuestionId(question.id)}
              style={({ pressed }) => [
                styles.questionCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && styles.pressed,
              ]}>
              <View style={styles.cardCopy}>
                <Text style={[styles.cardTitle, { color: colors.primaryText }]}>
                  Question {question.position + 1}
                </Text>
                <Text style={[styles.cardSubtitle, { color: colors.secondaryText }]} numberOfLines={2}>
                  {question.content.title}
                </Text>
              </View>
              <Badge tone={statusTone(question.status)}>{statusLabel(question.status)}</Badge>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <SectionHeader
        title="SQL Practiced Notes"
        subtitle="Review your saved practice questions, SQL attempts, and evaluator guidance."
      />
      <View style={styles.filters}>
        <FilterField
          label="Category"
          value={categoryId}
          options={categoryOptions}
          onChange={(value) => {
            setCategoryId(value);
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
      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
      {!loading && !error && filteredSets.length === 0 ? (
        <Card style={styles.detailCard}>
          <Text style={[styles.cardTitle, { color: colors.primaryText }]}>
            No practiced sets match these filters.
          </Text>
          <Text style={[styles.cardSubtitle, { color: colors.secondaryText }]}>
            Practice sets you create will appear here automatically.
          </Text>
        </Card>
      ) : null}
      <View style={styles.setList}>
        {filteredSets.map((set) => {
          const status = getSetStatus(set);
          return (
            <Pressable
              key={set.id}
              accessibilityRole="button"
              onPress={() => setSelectedSetId(set.id)}
              style={({ pressed }) => [
                styles.setCard,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && styles.pressed,
              ]}>
              <View style={styles.cardCopy}>
                <Text style={[styles.cardTitle, { color: colors.primaryText }]}>
                  {findCategory(set.config.categoryId)} · {findTopic(set.config.topicId)}
                </Text>
                <Text style={[styles.cardSubtitle, { color: colors.secondaryText }]}>
                  Practice Set {set.set_number} · {set.questions.length} questions ·{' '}
                  {set.config.difficulty}
                </Text>
                <Text style={[styles.cardFootnote, { color: colors.mutedText }]}>
                  Last practiced {formatDate(set.updated_at)}
                </Text>
              </View>
              <View style={styles.cardStatus}>
                {set.bookmarked ? <Badge tone="neutral">Bookmarked</Badge> : null}
                <Badge tone={statusTone(status)}>{status}</Badge>
              </View>
            </Pressable>
          );
        })}
      </View>
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
    <View style={styles.filterField}>
      <Text style={[styles.filterLabel, { color: colors.primaryText }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${selectedOption?.label ?? options[0]?.label ?? ''}`}
        onPress={() => setOpen((current) => !current)}
        style={[styles.filterButton, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.filterValue, { color: colors.primaryText }]} numberOfLines={1}>
          {selectedOption?.label ?? options[0]?.label}
        </Text>
        <Text style={{ color: colors.secondaryText }}>{open ? '−' : '+'}</Text>
      </Pressable>
      {open ? (
        <View style={[styles.filterOptions, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ScrollView nestedScrollEnabled style={styles.optionScroll}>
            {options.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={styles.option}>
                <Text style={[styles.optionText, { color: colors.primaryText }]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function ReviewCodeCard({ title, content }: { title: string; content: string }) {
  const { colors } = useAppTheme();
  return (
    <Card style={styles.detailCard}>
      <Text style={[styles.sectionTitle, { color: colors.primaryText }]}>{title}</Text>
      {content.startsWith('A correct SQL') || content.startsWith('No SQL') ? (
        <Text style={[styles.emptyText, { color: colors.secondaryText }]}>{content}</Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator style={styles.codeScroll}>
          <Text selectable style={[styles.code, { color: colors.codeText }]}>
            {content}
          </Text>
        </ScrollView>
      )}
    </Card>
  );
}

function findCategory(id: string) {
  return sqlLearningCategories.find((category) => category.id === id)?.title ?? 'SQL';
}

function findTopic(id: string) {
  for (const category of sqlLearningCategories) {
    for (const module of category.modules) {
      const topic = module.topics.find((item) => item.id === id);
      if (topic) {
        return topic.title;
      }
    }
  }
  return id;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message
  ) {
    return error.message;
  }
  return fallback;
}

function getSetStatus(set: PracticeSet) {
  if (set.questions.some((question) => question.status === 'needs_review')) {
    return 'Needs Review';
  }
  if (set.questions.length > 0 && set.questions.every((question) => question.status === 'completed')) {
    return 'Completed';
  }
  return 'In Progress';
}

function statusLabel(status: SqlPracticeStatus) {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'needs_review':
      return 'Needs Review';
    default:
      return 'In Progress';
  }
}

function statusTone(status: SqlPracticeStatus | string): 'blue' | 'green' | 'amber' | 'neutral' {
  if (status === 'completed' || status === 'Completed') {
    return 'green';
  }
  if (status === 'needs_review' || status === 'Needs Review') {
    return 'amber';
  }
  if (status === 'Bookmarked') {
    return 'neutral';
  }
  return 'blue';
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'unknown'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

const styles = StyleSheet.create({
  screen: {
    minWidth: 0,
    gap: 16,
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
  },
  optionScroll: {
    maxHeight: 210,
  },
  option: {
    minHeight: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  optionText: {
    fontSize: 13,
  },
  setList: {
    gap: 10,
  },
  setCard: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.medium,
    padding: 15,
  },
  cardCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  cardSubtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  cardFootnote: {
    fontSize: 11,
  },
  cardStatus: {
    alignItems: 'flex-end',
    gap: 6,
  },
  questionList: {
    gap: 10,
  },
  questionCard: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderRadius: DesignTokens.radius.medium,
    padding: 14,
  },
  detailCard: {
    minWidth: 0,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  questionText: {
    fontSize: 14,
    lineHeight: 22,
  },
  contextText: {
    fontSize: 13,
    lineHeight: 20,
  },
  codeScroll: {
    maxWidth: '100%',
  },
  code: {
    fontFamily: DesignTokens.typography.mono,
    fontSize: 13,
    lineHeight: 21,
  },
  aiNotes: {
    gap: 10,
  },
  aiNote: {
    minWidth: 0,
    gap: 5,
    borderRadius: DesignTokens.radius.small,
    padding: 10,
    overflow: 'hidden',
  },
  noteRole: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
  },
  error: {
    fontSize: 13,
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.76,
  },
});
