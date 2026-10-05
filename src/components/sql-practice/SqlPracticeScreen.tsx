import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { PageHeader } from '@/components/PageHeader';
import { useAppShellScrollToTopControl } from '@/components/app-shell/AppShell';
import { Badge, Button, Card, SectionHeader } from '@/components/ui/primitives';
import { DesignTokens } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useAppTheme } from '@/contexts/theme-context';
import { sqlLearningCategories } from '@/data/sqlLearningContent';
import {
  generatePracticeQuestions,
  runPracticeSql,
} from '@/lib/api';
import {
  getPracticeEvaluatorExecution,
  getPracticeEvaluatorRoute,
  getQuestionIndex,
  updatePracticeQuestionDraft,
} from '@/lib/sql-practice-notes';
import { supabase } from '@/lib/supabase';
import type {
  PracticeQuestionRecord,
  SqlPracticeDifficulty,
  SqlPracticeExecutionResult,
  SqlPracticeQuestionType,
  SqlPracticeStatus,
} from '@/types/sql-practice';

type PracticeSetRecord = {
  id: string;
  user_id: string;
  config: PracticeConfiguration;
  set_number: number;
  title: string;
  current_question_index: number;
  bookmarked: boolean;
  created_at: string;
  updated_at: string;
  questions: PracticeQuestionRecord[];
};

type PracticeConfiguration = {
  categoryId: string;
  topicId: string;
  subtopicId: string;
  difficulty: SqlPracticeDifficulty;
  questionType: SqlPracticeQuestionType;
  count: number;
};

type PracticeAttemptRecord = {
  id: string;
  question_id: string;
  sql: string;
  execution_result: SqlPracticeExecutionResult | null;
  created_at: string;
};

type PageView = 'generate' | 'workspace';

const difficulties: SqlPracticeDifficulty[] = ['Beginner', 'Intermediate', 'Advanced'];

export default function SqlPracticeScreen() {
  const { restoreSetId, restoreQuestionId } = useLocalSearchParams<{
    restoreSetId?: string;
    restoreQuestionId?: string;
  }>();
  const { colors } = useAppTheme();
  const { user, session } = useAuth();
  const setScrollControlsVisible = useAppShellScrollToTopControl();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DesignTokens.layout.desktopBreakpoint;
  const [sets, setSets] = useState<PracticeSetRecord[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [view, setView] = useState<PageView>('generate');
  const [selectedCategoryId, setSelectedCategoryId] = useState(sqlLearningCategories[0]?.id ?? '');
  const [selectedTopicId, setSelectedTopicId] = useState(
    sqlLearningCategories[0]?.topics[0]?.id ?? '',
  );
  const [selectedSubtopicId, setSelectedSubtopicId] = useState(
    sqlLearningCategories[0]?.topics[0]?.subtopics[0]?.id ?? '',
  );
  const [difficulty, setDifficulty] = useState<SqlPracticeDifficulty>('Beginner');
  const questionType: SqlPracticeQuestionType = 'SELECT';
  const [questionCount, setQuestionCount] = useState(3);
  const [attempts, setAttempts] = useState<PracticeAttemptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [setToDelete, setSetToDelete] = useState<PracticeSetRecord | null>(null);
  const [deleteSetError, setDeleteSetError] = useState('');
  const [deletingSet, setDeletingSet] = useState(false);
  const pendingDraft = useRef<{ questionId: string; sql: string } | null>(null);
  const { styles } = usePracticeStyles();

  useEffect(() => {
    setScrollControlsVisible(true);
    return () => setScrollControlsVisible(false);
  }, [setScrollControlsVisible]);

  const category = useMemo(
    () => sqlLearningCategories.find((item) => item.id === selectedCategoryId) ?? null,
    [selectedCategoryId],
  );
  const topic = useMemo(
    () => category?.topics.find((item) => item.id === selectedTopicId) ?? null,
    [category, selectedTopicId],
  );
  const subtopic = useMemo(
    () => topic?.subtopics.find((item) => item.id === selectedSubtopicId) ?? null,
    [selectedSubtopicId, topic],
  );

  const activeSet = sets.find((set) => set.id === activeSetId) ?? null;
  const latestMatchingSet = sets.find(
    (set) =>
      set.config.categoryId === category?.id &&
      set.config.topicId === topic?.id &&
      set.config.subtopicId === subtopic?.id &&
      set.config.difficulty === difficulty &&
      set.config.questionType === questionType &&
      set.config.count === questionCount,
  );
  const currentQuestion = activeSet?.questions[activeSet.current_question_index] ?? null;
  const attemptQuestionId = currentQuestion?.id;

  const deletePracticeSet = async () => {
    if (!setToDelete || !user || !supabase) {
      setDeleteSetError('Sign in before deleting a practice set.');
      return;
    }
    setDeletingSet(true);
    setDeleteSetError('');
    try {
      const { error: deleteError } = await supabase
        .from('practice_sets')
        .delete()
        .eq('id', setToDelete.id)
        .eq('user_id', user.id);
      if (deleteError) {
        throw deleteError;
      }
      setSets((current) => current.filter((set) => set.id !== setToDelete.id));
      if (activeSetId === setToDelete.id) {
        setActiveSetId(null);
        setView('generate');
      }
      setSetToDelete(null);
    } catch (deleteError) {
      setDeleteSetError(
        deleteError instanceof Error ? deleteError.message : 'The selected practice set could not be deleted.',
      );
    } finally {
      setDeletingSet(false);
    }
  };

  const loadPracticeSets = useCallback(async () => {
    if (!user || !supabase) {
      setSets([]);
      setLoading(false);
      setError(
        user
          ? 'Practice storage is not configured. Check Supabase and apply the SQL Practice migration.'
          : 'Sign in to save and continue SQL practice.',
      );
      return;
    }

    const client = supabase;
    setLoading(true);
    setError('');
    try {
      const setsResult = await client
        .from('practice_sets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (setsResult.error) {
        throw setsResult.error;
      }
      const setRows = (setsResult.data ?? []) as unknown as Omit<PracticeSetRecord, 'questions'>[];
      const ids = setRows.map((row) => row.id);
      let questionRows: PracticeQuestionRecord[] = [];
      if (ids.length) {
        const questionsResult = await client
          .from('practice_questions')
          .select('*')
          .in('set_id', ids)
          .order('position', { ascending: true });
        if (questionsResult.error) {
          throw questionsResult.error;
        }
        questionRows = (questionsResult.data ?? []) as unknown as PracticeQuestionRecord[];
      }
      const questionsBySet = new Map<string, PracticeQuestionRecord[]>();
      questionRows.forEach((question) => {
        const group = questionsBySet.get(question.set_id) ?? [];
        group.push(question);
        questionsBySet.set(question.set_id, group);
      });
      setStorageError('');
      const loadedSets = setRows.map((row) => ({
          ...row,
          questions: questionsBySet.get(row.id) ?? [],
        }));
      if (restoreSetId && restoreQuestionId) {
        const restoredSet = loadedSets.find((set) => set.id === restoreSetId);
        const restoredQuestionIndex =
          restoredSet?.questions.findIndex((question) => question.id === restoreQuestionId) ?? -1;
        if (!restoredSet || restoredQuestionIndex < 0) {
          throw new Error('The evaluator question could not be restored to its saved practice set.');
        }
        if (restoredSet.current_question_index !== restoredQuestionIndex) {
          const restoreResult = await client
            .from('practice_sets')
            .update({
              current_question_index: restoredQuestionIndex,
              updated_at: new Date().toISOString(),
            })
            .eq('id', restoredSet.id);
          if (restoreResult.error) {
            setStorageError(`Question position could not be restored: ${restoreResult.error.message}`);
          } else {
            setStorageError('');
          }
          restoredSet.current_question_index = restoredQuestionIndex;
        }
        setActiveSetId(restoredSet.id);
        setView('workspace');
      }
      setSets(loadedSets);
    } catch (loadError) {
      setError(
        getErrorMessage(
          loadError,
          'Practice sets could not be loaded. Check the Supabase migration and your connection.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [restoreQuestionId, restoreSetId, user]);

  useEffect(() => {
    // The request synchronizes the saved practice sets and loading indicator.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPracticeSets();
  }, [loadPracticeSets]);

  useEffect(() => {
    if (!currentQuestion || !activeSet || !supabase || !user) {
      return;
    }
    const client = supabase;
    const questionId = currentQuestion.id;
    const sql = currentQuestion.draft_sql;
    const timeout = setTimeout(() => {
      void client
        .from('practice_questions')
        .update({ draft_sql: sql, updated_at: new Date().toISOString() })
        .eq('id', questionId)
        .then(({ error: saveError }) => {
          if (saveError) {
            setStorageError(`SQL draft could not be saved: ${saveError.message}`);
          } else {
            setStorageError('');
            if (
              pendingDraft.current?.questionId === questionId &&
              pendingDraft.current.sql === sql
            ) {
              pendingDraft.current = null;
            }
          }
        });
    }, 450);
    return () => clearTimeout(timeout);
  }, [activeSet, currentQuestion, user]);

  useEffect(() => {
    if (!attemptQuestionId || !supabase) {
      // Avoid showing attempt history from the previous question.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAttempts([]);
      return;
    }
    const questionId = attemptQuestionId;
    let active = true;
    setAttempts([]);
    void supabase
      .from('practice_attempts')
      .select('*')
      .eq('question_id', questionId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data, error: attemptsError }) => {
        if (!active) {
          return;
        }
        if (attemptsError) {
          setStorageError(`Attempt history could not be loaded: ${attemptsError.message}`);
        } else {
          setAttempts((data ?? []) as unknown as PracticeAttemptRecord[]);
        }
      });
    return () => {
      active = false;
    };
  }, [attemptQuestionId]);

  useEffect(
    () => () => {
      const draft = pendingDraft.current;
      if (!draft || !supabase) {
        return;
      }
      void supabase
        .from('practice_questions')
        .update({ draft_sql: draft.sql, updated_at: new Date().toISOString() })
        .eq('id', draft.questionId)
        .then(({ error: saveError }) => {
          if (saveError) {
            console.error('[SQL Practice] Unable to flush the final SQL draft.', saveError);
          }
        });
    },
    [],
  );

  const updateActiveSetLocally = (updater: (set: PracticeSetRecord) => PracticeSetRecord) => {
    if (!activeSetId) {
      return;
    }
    setSets((current) => current.map((set) => (set.id === activeSetId ? updater(set) : set)));
  };

  const generateSet = async () => {
    if (!user || !session?.access_token || !supabase || !category || !topic || !subtopic) {
      setError('Sign in and choose a complete topic path before generating a practice set.');
      return;
    }

    setGenerating(true);
    setError('');
    try {
      const config: PracticeConfiguration = {
        categoryId: category.id,
        topicId: topic.id,
        subtopicId: subtopic.id,
        difficulty,
        questionType,
        count: questionCount,
      };
      const learningContext = [
        `Canonical curriculum IDs: category_id=${category.id}, topic_id=${topic.id}, subtopic_id=${subtopic.id}`,
        `Topic summary: ${topic.summary}`,
        `Topic learning material: ${JSON.stringify({
          explanation: topic.explanation,
          keyPoints: topic.keyPoints,
          commonMistakes: topic.commonMistakes,
          examples: topic.examples,
        })}`,
        `Subtopic context: ${JSON.stringify({
          title: subtopic.title,
          explanation: subtopic.explanation,
          keyPoints: subtopic.keyPoints,
          examples: subtopic.examples,
        })}`,
      ].join('\n');
      const questionContents = await generatePracticeQuestions({
        accessToken: session.access_token,
        categoryId: category.id,
        topicId: topic.id,
        subtopicId: subtopic.id,
        category: category.title,
        topic: topic.title,
        subtopic: subtopic.title,
        difficulty,
        questionType,
        count: questionCount,
        learningContext,
      });
      if (questionContents.length !== questionCount) {
        throw new Error('The practice generator did not return the requested number of questions.');
      }

      const created = await supabase.rpc('create_practice_set', {
        p_config: config,
        p_title: `${topic.title} · ${difficulty}`,
        p_questions: questionContents,
      });
      if (created.error) {
        throw created.error;
      }
      const createdSet = Array.isArray(created.data) ? created.data[0] : created.data;
      if (
        !createdSet ||
        typeof createdSet !== 'object' ||
        !('created_set_id' in createdSet) ||
        typeof createdSet.created_set_id !== 'string'
      ) {
        throw new Error('Supabase did not return the created practice set.');
      }

      await loadPracticeSets();
      setActiveSetId(createdSet.created_set_id);
      setView('generate');
      setSaveMessage('');
    } catch (generationError) {
      setError(
        getErrorMessage(
          generationError,
          'Practice could not be generated or saved. Verify the Render service and Supabase migration.',
        ),
      );
    } finally {
      setGenerating(false);
    }
  };

  const openSet = (set: PracticeSetRecord) => {
    setActiveSetId(set.id);
    setView('workspace');
    setError('');
  };

  const navigateQuestion = async (direction: -1 | 1) => {
    if (!activeSet || !supabase) {
      return;
    }
    const nextIndex = getQuestionIndex(
      activeSet.current_question_index,
      activeSet.questions.length,
      direction,
    );
    if (nextIndex === activeSet.current_question_index) {
      return;
    }
    if (currentQuestion) {
      const draftSave = await supabase
        .from('practice_questions')
        .update({
          draft_sql: currentQuestion.draft_sql,
          updated_at: new Date().toISOString(),
        })
        .eq('id', currentQuestion.id);
      if (draftSave.error) {
        setStorageError(`SQL draft could not be saved: ${draftSave.error.message}`);
        return;
      }
      pendingDraft.current = null;
    }
    const { error: saveError } = await supabase
      .from('practice_sets')
      .update({ current_question_index: nextIndex, updated_at: new Date().toISOString() })
      .eq('id', activeSet.id);
    if (saveError) {
      setStorageError(`Practice progress could not be saved: ${saveError.message}`);
      return;
    }
    setStorageError('');
    updateActiveSetLocally((set) => ({ ...set, current_question_index: nextIndex }));
  };

  const executeQuery = async () => {
    if (!currentQuestion || !session?.access_token || !supabase || executing) {
      return;
    }
    setExecuting(true);
    setError('');
    try {
      const result = await runPracticeSql(
        session.access_token,
        currentQuestion.content,
        currentQuestion.draft_sql,
      );
      const savedAt = new Date().toISOString();
      const nextStatus: SqlPracticeStatus =
        result.ok && result.rows.length > 0 ? 'needs_review' : 'in_progress';
      updateActiveSetLocally((set) => ({
        ...set,
        questions: set.questions.map((question) =>
          question.id === currentQuestion.id
            ? { ...question, latest_result: result, status: nextStatus, updated_at: savedAt }
            : question,
        ),
      }));
      const questionUpdate = await supabase
        .from('practice_questions')
        .update({
          latest_result: result,
          status: nextStatus,
          updated_at: savedAt,
        })
        .eq('id', currentQuestion.id);
      if (questionUpdate.error) {
        throw questionUpdate.error;
      }
      const attempt = await supabase.from('practice_attempts').insert({
        question_id: currentQuestion.id,
        sql: currentQuestion.draft_sql,
        execution_result: result,
      }).select('*').single();
      if (attempt.error) {
        throw attempt.error;
      }
      setAttempts((current) => [attempt.data as PracticeAttemptRecord, ...current].slice(0, 10));
      setStorageError('');
    } catch (executionError) {
      setError(
        getErrorMessage(
          executionError,
          'The SQL engine could not run this query. Check the API connection and try again.',
        ),
      );
    } finally {
      setExecuting(false);
    }
  };

  const openEvaluator = async () => {
    if (!currentQuestion || !activeSet || !supabase) {
      return;
    }
    const draftSave = await supabase
      .from('practice_questions')
      .update({
        draft_sql: currentQuestion.draft_sql,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentQuestion.id);
    if (draftSave.error) {
      setStorageError(
        `SQL draft could not be saved before opening the evaluator: ${draftSave.error.message}`,
      );
      return;
    }
    pendingDraft.current = null;
    const latestAttempt = await supabase
      .from('practice_attempts')
      .select('id,question_id,sql,execution_result,created_at')
      .eq('question_id', currentQuestion.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestAttempt.error) {
      setStorageError(`Latest SQL attempt could not be loaded: ${latestAttempt.error.message}`);
      return;
    }
    setStorageError('');
    const execution = getPracticeEvaluatorExecution(
      currentQuestion.id,
      currentQuestion.draft_sql,
      latestAttempt.data as PracticeAttemptRecord | null,
    );
    router.push(getPracticeEvaluatorRoute(activeSet.id, currentQuestion.id, execution));
  };

  const saveCurrentWork = async () => {
    if (!currentQuestion || !supabase) {
      setStorageError('Practice storage is not configured.');
      return;
    }
    setSaving(true);
    setSaveMessage('');
    const { error: saveError } = await supabase
      .from('practice_questions')
      .update({ draft_sql: currentQuestion.draft_sql, updated_at: new Date().toISOString() })
      .eq('id', currentQuestion.id);
    if (saveError) {
      setStorageError(`Practice work could not be saved: ${saveError.message}`);
    } else {
      pendingDraft.current = null;
      setStorageError('');
      setSaveMessage('Saved');
    }
    setSaving(false);
  };

  const changeCategory = (id: string) => {
    const nextCategory = sqlLearningCategories.find((item) => item.id === id);
    setSelectedCategoryId(id);
    setSelectedTopicId(nextCategory?.topics[0]?.id ?? '');
    setSelectedSubtopicId(nextCategory?.topics[0]?.subtopics[0]?.id ?? '');
  };
  const changeTopic = (id: string) => {
    const nextTopic = category?.topics.find((item) => item.id === id);
    setSelectedTopicId(id);
    setSelectedSubtopicId(nextTopic?.subtopics[0]?.id ?? '');
  };

  return (
    <View style={styles.screen}>
      <PageHeader
        eyebrow="PRACTICE LAB"
        title="SQL Practice"
        subtitle="Practice real SQL problems, execute your queries, and learn from every attempt."
      />

      {view === 'workspace' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to SQL Practice"
          onPress={() => setView('generate')}
          style={({ pressed }) => [
            styles.backButton,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && styles.pressed,
          ]}>
          <ChevronLeft color={colors.primary} size={20} strokeWidth={2.5} />
          <Text style={[styles.backButtonText, { color: colors.primaryText }]}>Back to SQL Practice</Text>
        </Pressable>
      ) : null}

      {error ? (
        <View style={[styles.notice, { borderColor: colors.danger, backgroundColor: colors.dangerSoft }]}>
          <Text style={[styles.noticeText, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}
      {storageError ? (
        <View style={[styles.notice, { borderColor: colors.warning, backgroundColor: colors.warningSoft }]}>
          <Text style={[styles.noticeText, { color: colors.warning }]}>{storageError}</Text>
        </View>
      ) : null}

      {view === 'generate' ? (
        <Card style={styles.panel}>
          <SectionHeader title="Practice setup" subtitle="Choose a topic and generate a question set." />
          <View style={styles.formGrid}>
            <SelectField
              label="Category"
              value={category?.title ?? ''}
              options={sqlLearningCategories.map((item) => ({ label: item.title, value: item.id }))}
              onChange={changeCategory}
            />
            <SelectField
              label="Topic"
              value={topic?.title ?? ''}
              options={(category?.topics ?? []).map((item) => ({
                label: item.title,
                value: item.id,
              }))}
              onChange={changeTopic}
            />
            <SelectField
              label="Subtopic"
              value={subtopic?.title ?? ''}
              options={(topic?.subtopics ?? []).map((item) => ({
                label: item.title,
                value: item.id,
              }))}
              onChange={setSelectedSubtopicId}
            />
            <SelectField
              label="Difficulty"
              value={difficulty}
              options={difficulties.map((item) => ({ label: item, value: item }))}
              onChange={(value) => setDifficulty(value as SqlPracticeDifficulty)}
            />
            <SelectField
              label="Number of Questions"
              value={String(questionCount)}
              options={Array.from({ length: 10 }, (_, index) => ({
                label: String(index + 1),
                value: String(index + 1),
              }))}
              onChange={(value) => setQuestionCount(Number(value))}
            />
          </View>
          <Button
            disabled={generating || loading || !user}
            onPress={() => void generateSet()}
            style={styles.generateButton}>
            {generating ? (
              <View style={styles.buttonContent}>
                <ActivityIndicator color={colors.white} />
                <Text style={[styles.buttonText, { color: colors.white }]}>Generating set…</Text>
              </View>
            ) : (
              'Generate Set'
            )}
          </Button>
          <Text style={[styles.helperText, { color: colors.secondaryText }]}>
            Your set number is saved and continues for this topic and difficulty.
          </Text>
          {deleteSetError ? (
            <Text accessibilityRole="alert" style={[styles.errorText, { color: colors.danger }]}>
              {deleteSetError}
            </Text>
          ) : null}
          {setToDelete ? (
            <Card style={styles.panel}>
              <Text style={[styles.questionTitle, { color: colors.primaryText }]}>
                Delete Set {setToDelete.set_number}?
              </Text>
              <Text style={[styles.helperText, { color: colors.secondaryText }]}>
                This permanently deletes only this set and its saved questions, attempts, and evaluator messages.
              </Text>
              <View style={styles.buttonRow}>
                <Button disabled={deletingSet} variant="secondary" onPress={() => setSetToDelete(null)}>
                  Cancel
                </Button>
                <Button
                  disabled={deletingSet}
                  onPress={() => void deletePracticeSet()}
                  style={{ backgroundColor: colors.danger }}>
                  {deletingSet ? 'Deleting…' : 'Delete Set'}
                </Button>
              </View>
            </Card>
          ) : null}
          <PracticeSetList
            sets={latestMatchingSet ? [latestMatchingSet] : []}
            onOpen={openSet}
            onDelete={(set) => {
              setDeleteSetError('');
              setSetToDelete(set);
            }}
            colors={colors}
            loading={loading}
          />
        </Card>
      ) : null}

      {view === 'workspace' && activeSet && currentQuestion ? (
        <View style={[styles.workspace, isDesktop && styles.desktopWorkspace]}>
          <View style={isDesktop ? styles.sqlColumn : undefined}>
          <Card style={styles.panel}>
            <View style={styles.workspaceHeading}>
              <View style={styles.headingCopy}>
                <Text style={[styles.eyebrow, { color: colors.primary }]}>
                  SET {activeSet.set_number} · {activeSet.title}
                </Text>
                <Text style={[styles.questionTitle, { color: colors.primaryText }]}>
                  {currentQuestion.content.title}
                </Text>
              </View>
              <Badge tone={statusTone(currentQuestion.status)}>
                {statusLabel(currentQuestion.status)}
              </Badge>
            </View>
            <Text style={[styles.promptText, { color: colors.secondaryText }]}>
              {currentQuestion.content.prompt}
            </Text>
            <Text style={[styles.contextText, { color: colors.secondaryText }]}>
              {currentQuestion.content.explanation}
            </Text>

            <View style={styles.tablePreview}>
              {currentQuestion.content.tables.map((table) => (
                <View key={table.name} style={styles.tablePreviewBlock}>
                  <Text style={[styles.tableTitle, { color: colors.primaryText }]}>
                    Table: {table.name}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator>
                    <View>
                      <View style={styles.tableRow}>
                        {table.columns.map((column) => (
                          <Text
                            key={column.name}
                            style={[
                              styles.tableCell,
                              styles.tableHeaderCell,
                              { color: colors.primaryText, borderColor: colors.border },
                            ]}>
                            {column.name}
                          </Text>
                        ))}
                      </View>
                      {table.rows.slice(0, 5).map((row, rowIndex) => (
                        <View key={`${table.name}-${rowIndex}`} style={styles.tableRow}>
                          {table.columns.map((column) => (
                            <Text
                              key={column.name}
                              style={[
                                styles.tableCell,
                                { color: colors.secondaryText, borderColor: colors.border },
                              ]}>
                              {String(row[column.name] ?? 'NULL')}
                            </Text>
                          ))}
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              ))}
            </View>

            <View style={styles.questionNavigation}>
              <Button
                variant="secondary"
                disabled={activeSet.current_question_index === 0}
                onPress={() => void navigateQuestion(-1)}>
                Previous
              </Button>
              <Text style={[styles.questionCount, { color: colors.secondaryText }]}>
                Question {activeSet.current_question_index + 1} of {activeSet.questions.length}
              </Text>
              <Button
                variant="secondary"
                disabled={activeSet.current_question_index >= activeSet.questions.length - 1}
                onPress={() => void navigateQuestion(1)}>
                Next
              </Button>
            </View>

            <View style={[styles.editorShell, { borderColor: colors.border, backgroundColor: colors.codeBackground }]}>
              <View style={[styles.editorHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.editorLabel, { color: colors.primaryText }]}>SQL Editor</Text>
                <Text style={[styles.editorHint, { color: colors.secondaryText }]}>Autosaves as you type</Text>
              </View>
              <TextInput
                accessibilityLabel="SQL editor"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10_000}
                multiline
                value={currentQuestion.draft_sql}
                onChangeText={(draft) => {
                  pendingDraft.current = { questionId: currentQuestion.id, sql: draft };
                  setSets((current) =>
                    updatePracticeQuestionDraft(
                      current,
                      activeSet.id,
                      currentQuestion.id,
                      draft,
                    ),
                  );
                }}
                placeholder="SELECT name FROM customers;"
                placeholderTextColor={colors.mutedText}
                selectionColor={colors.primary}
                spellCheck={false}
                textAlignVertical="top"
                style={[
                  styles.editor,
                  { backgroundColor: colors.codeBackground, color: colors.codeText },
                ]}
              />
            </View>

            <View style={styles.workspaceActions}>
              <Button disabled={executing} onPress={() => void executeQuery()}>
                {executing ? 'Running SQL…' : 'Run SQL'}
              </Button>
              <Button variant="secondary" onPress={() => void openEvaluator()}>
                AI Evaluate
              </Button>
              <Button disabled={saving} variant="secondary" onPress={() => void saveCurrentWork()}>
                {saving ? 'Saving…' : saveMessage || 'Save'}
              </Button>
            </View>
          </Card>

          <ResultCard
            result={currentQuestion.latest_result}
            colors={colors}
          />
          <AttemptHistory
            attempts={attempts}
            colors={colors}
            onRestore={(attempt) => {
              pendingDraft.current = {
                questionId: currentQuestion.id,
                sql: attempt.sql,
              };
              setSets((current) =>
                updatePracticeQuestionDraft(
                  current,
                  activeSet.id,
                  currentQuestion.id,
                  attempt.sql,
                ),
              );
              void supabase
                ?.from('practice_questions')
                .update({
                  draft_sql: attempt.sql,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', currentQuestion.id)
                .then(({ error: restoreError }) => {
                  setStorageError(
                    restoreError ? `Attempt SQL could not be restored: ${restoreError.message}` : '',
                  );
                });
            }}
          />
          </View>

        </View>
      ) : view === 'workspace' ? (
        <Card style={styles.panel}>
          <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
            This practice set has no questions.
          </Text>
          <Button variant="secondary" onPress={() => setView('generate')}>
            Back to Generate Practice
          </Button>
        </Card>
      ) : null}
    </View>
  );
}

function PracticeSetList({
  sets,
  onOpen,
  onDelete,
  colors,
  loading,
}: {
  sets: PracticeSetRecord[];
  onOpen: (set: PracticeSetRecord) => void;
  onDelete: (set: PracticeSetRecord) => void;
  colors: ReturnType<typeof import('@/constants/theme').getThemeColors>;
  loading: boolean;
}) {
  const styles = usePracticeStyles().styles;
  if (loading && sets.length === 0) {
    return <ActivityIndicator color={colors.primary} />;
  }
  if (sets.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
        No sets in this view yet. Generate a practice set to begin.
      </Text>
    );
  }
  return (
    <View style={styles.setList}>
      {sets.map((set) => (
        <View
          key={set.id}
          style={[
            styles.setCard,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          ]}>
          <Text style={[styles.setTitle, { color: colors.primaryText }]}>Set {set.set_number}</Text>
          <Text style={[styles.setMeta, { color: colors.secondaryText }]}>
            Category: {findCategory(set.config.categoryId)}
          </Text>
          <Text style={[styles.setMeta, { color: colors.secondaryText }]}>
            Topic: {findTopic(set.config.topicId)}
          </Text>
          <Text style={[styles.setMeta, { color: colors.secondaryText }]}>
            Difficulty: {set.config.difficulty}
          </Text>
          <Text style={[styles.setMeta, { color: colors.secondaryText }]}>
            Questions: {set.questions.length}
          </Text>
          <View style={styles.buttonRow}>
            <Button onPress={() => onOpen(set)}>Start</Button>
            <Button variant="secondary" onPress={() => onDelete(set)}>Delete</Button>
          </View>
        </View>
      ))}
    </View>
  );
}

function ResultCard({
  result,
  colors,
}: {
  result: SqlPracticeExecutionResult | null;
  colors: ReturnType<typeof import('@/constants/theme').getThemeColors>;
}) {
  const styles = usePracticeStyles().styles;
  return (
    <Card style={styles.panel}>
      <SectionHeader
        title="SQL Engine Result"
        subtitle="Output from the isolated SQL engine for this practice dataset."
      />
      {!result ? (
        <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
          Run your SQL to see the actual result or execution error.
        </Text>
      ) : result.error ? (
        <View style={[styles.sqlError, { backgroundColor: colors.dangerSoft }]}>
          <Text style={[styles.noticeText, { color: colors.danger }]}>{result.error}</Text>
        </View>
      ) : (
        <>
          <Text style={[styles.resultSummary, { color: colors.success }]}>
            Query ran successfully · {result.rows.length}
            {result.truncated ? '+' : ''} row(s)
          </Text>
          {result.rows.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.secondaryText }]}>No rows returned.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View>
                <View style={styles.tableRow}>
                  {result.columns.map((column) => (
                    <Text
                      key={column}
                      style={[
                        styles.tableCell,
                        styles.tableHeaderCell,
                        { color: colors.primaryText, borderColor: colors.border },
                      ]}>
                      {column}
                    </Text>
                  ))}
                </View>
                {result.rows.map((row, index) => (
                  <View key={`result-${index}`} style={styles.tableRow}>
                    {result.columns.map((column) => (
                      <Text
                        key={`${index}-${column}`}
                        style={[
                          styles.tableCell,
                          { color: colors.secondaryText, borderColor: colors.border },
                        ]}>
                        {String(row[column] ?? 'NULL')}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
          {result.truncated ? (
            <Text style={[styles.helperText, { color: colors.secondaryText }]}>
              Display capped at {result.rowLimit} rows.
            </Text>
          ) : null}
        </>
      )}
    </Card>
  );
}

function AttemptHistory({
  attempts,
  colors,
  onRestore,
}: {
  attempts: PracticeAttemptRecord[];
  colors: ReturnType<typeof import('@/constants/theme').getThemeColors>;
  onRestore: (attempt: PracticeAttemptRecord) => void;
}) {
  const { styles } = usePracticeStyles();
  return (
    <Card style={styles.panel}>
      <SectionHeader title="Attempt History" subtitle="Review previous runs or restore an earlier SQL draft." />
      {attempts.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
          Your SQL runs for this question will be saved here.
        </Text>
      ) : (
        <View style={styles.attemptList}>
          {attempts.map((attempt, index) => (
            <View
              key={attempt.id}
              style={[
                styles.attemptCard,
                { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
              ]}>
              <View style={styles.setTitleRow}>
                <Text style={[styles.attemptTitle, { color: colors.primaryText }]}>
                  Attempt {attempts.length - index}
                </Text>
                <Text
                  style={[
                    styles.attemptOutcome,
                    { color: attempt.execution_result?.ok ? colors.success : colors.danger },
                  ]}>
                  {attempt.execution_result?.ok ? 'Executed' : 'SQL error'}
                </Text>
              </View>
              <Text style={[styles.setMeta, { color: colors.secondaryText }]}>
                {new Date(attempt.created_at).toLocaleString()}
              </Text>
              <Text selectable style={[styles.attemptSql, { color: colors.codeText }]}>
                {attempt.sql || '(empty SQL)'}
              </Text>
              <Button variant="secondary" onPress={() => onRestore(attempt)}>
                Restore SQL
              </Button>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function SelectField({
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
  const { styles, colors } = usePracticeStyles();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.primaryText }]}>{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}. Choose ${label}`}
        onPress={() => setOpen((current) => !current)}
        style={({ pressed }) => [
          styles.selectButton,
          { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.selectText, { color: colors.primaryText }]} numberOfLines={1}>
          {value || `Select ${label.toLowerCase()}`}
        </Text>
        <Text style={[styles.selectChevron, { color: colors.secondaryText }]}>
          {open ? '−' : '+'}
        </Text>
      </Pressable>
      {open ? (
        <View style={[styles.selectOptions, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ScrollView nestedScrollEnabled style={styles.optionsScroll}>
            {options.map((option) => (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [
                  styles.option,
                  pressed && { backgroundColor: colors.primarySoft },
                ]}>
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

function usePracticeStyles() {
  const { colors } = useAppTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, minWidth: 0, gap: 18 },
        backButton: {
          minHeight: 44,
          alignSelf: 'flex-start',
          borderWidth: 1,
          borderRadius: DesignTokens.radius.pill,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 14,
        },
        backButtonText: { fontSize: 13, fontWeight: '700' },
        topActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
        topActionButton: { flexGrow: 1, minWidth: 160 },
        metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
        metricCard: { flex: 1, minWidth: 150, padding: 16 },
        metricValue: { fontSize: 25, fontWeight: '800' },
        metricLabel: { fontSize: 12, lineHeight: 18, marginTop: 4 },
        panel: { padding: 18, gap: 16 },
        formGrid: { gap: 14 },
        fieldGroup: { gap: 7, zIndex: 2 },
        fieldLabel: { fontSize: 12, fontWeight: '700' },
        selectButton: {
          minHeight: 46,
          borderRadius: DesignTokens.radius.small,
          borderWidth: 1,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        },
        selectText: { flex: 1, fontSize: 14 },
        selectChevron: { fontSize: 17, fontWeight: '800' },
        selectOptions: {
          borderWidth: 1,
          borderRadius: DesignTokens.radius.small,
          maxHeight: 220,
          overflow: 'hidden',
          ...DesignTokens.elevation.card,
        },
        optionsScroll: { maxHeight: 220 },
        option: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12 },
        optionText: { fontSize: 14 },
        pressed: { opacity: 0.72 },
        generateButton: { alignSelf: 'flex-start', minWidth: 160 },
        buttonContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
        buttonText: { fontSize: 14, fontWeight: '700' },
        helperText: { fontSize: 12, lineHeight: 18 },
        errorText: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
        buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
        notice: {
          borderWidth: 1,
          borderRadius: DesignTokens.radius.small,
          padding: 12,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
        },
        noticeText: { flex: 1, minWidth: 180, fontSize: 13, lineHeight: 20 },
        filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        choicePill: {
          borderWidth: 1,
          borderRadius: DesignTokens.radius.pill,
          paddingHorizontal: 12,
          paddingVertical: 8,
        },
        choiceText: { fontSize: 12, fontWeight: '700' },
        setList: { gap: 10 },
        setCard: {
          borderWidth: 1,
          borderRadius: DesignTokens.radius.small,
          gap: 6,
          padding: 13,
        },
        setOpenButton: { flex: 1, minWidth: 0, gap: 6, padding: 13 },
        setTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
        setTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
        setMeta: { fontSize: 12, lineHeight: 17 },
        attemptList: { gap: 10 },
        attemptCard: {
          borderWidth: 1,
          borderRadius: DesignTokens.radius.small,
          padding: 12,
          gap: 9,
        },
        attemptTitle: { fontSize: 13, fontWeight: '800' },
        attemptOutcome: { fontSize: 11, fontWeight: '800' },
        attemptSql: {
          fontFamily: DesignTokens.typography.mono,
          fontSize: 12,
          lineHeight: 19,
        },
        bookmarkButton: { minWidth: 46, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
        bookmarkText: { fontSize: 24, fontWeight: '700' },
        emptyText: { fontSize: 14, lineHeight: 21 },
        emptyTitle: { fontSize: 17, fontWeight: '700' },
        workspace: { gap: 16 },
        desktopWorkspace: { flexDirection: 'row', alignItems: 'flex-start' },
        sqlColumn: { flex: 1, minWidth: 0, gap: 16 },
        workspaceHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
        headingCopy: { flex: 1, gap: 8 },
        eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
        questionTitle: { fontSize: 20, lineHeight: 27, fontWeight: '800' },
        promptText: { fontSize: 15, lineHeight: 23, fontWeight: '600' },
        contextText: { fontSize: 13, lineHeight: 20 },
        tablePreview: { gap: 12 },
        tablePreviewBlock: { gap: 6 },
        tableTitle: { fontSize: 12, fontWeight: '700' },
        tableRow: { flexDirection: 'row' },
        tableCell: {
          minWidth: 105,
          maxWidth: 220,
          paddingHorizontal: 9,
          paddingVertical: 8,
          borderWidth: StyleSheet.hairlineWidth,
          fontSize: 12,
        },
        tableHeaderCell: { fontWeight: '800', backgroundColor: colors.surfaceMuted },
        questionNavigation: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        },
        questionCount: { fontSize: 12, fontWeight: '700' },
        editorShell: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
        editorHeader: {
          minHeight: 40,
          borderBottomWidth: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
        },
        editorLabel: { fontSize: 12, fontWeight: '800' },
        editorHint: { fontSize: 11 },
        editor: {
          width: '100%',
          minHeight: 190,
          padding: 14,
          fontFamily: DesignTokens.typography.mono,
          fontSize: 14,
          lineHeight: 22,
        },
        workspaceActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
        resultSummary: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
        sqlError: { borderRadius: 9, padding: 12 },
      }),
    [colors],
  );
  return { styles, colors };
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

function findCategory(id: string) {
  return sqlLearningCategories.find((categoryItem) => categoryItem.id === id)?.title ?? 'SQL';
}

function findTopic(id: string) {
  for (const categoryItem of sqlLearningCategories) {
    const topicItem = categoryItem.topics.find((candidate) => candidate.id === id);
    if (topicItem) {
      return topicItem.title;
    }
  }
  return id;
}

function statusTone(status: SqlPracticeStatus): 'blue' | 'green' | 'amber' {
  if (status === 'completed') {
    return 'green';
  }
  if (status === 'needs_review') {
    return 'amber';
  }
  return 'blue';
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
