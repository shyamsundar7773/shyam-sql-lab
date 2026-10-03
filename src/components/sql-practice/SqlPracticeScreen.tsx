import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
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
import { MarkdownContent } from '@/components/topic-chat/MarkdownContent';
import { Badge, Button, Card, SectionHeader } from '@/components/ui/primitives';
import { DesignTokens } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useAppTheme } from '@/contexts/theme-context';
import { sqlLearningCategories } from '@/data/sqlLearningContent';
import {
  askPracticeEvaluator,
  generatePracticeQuestions,
  runPracticeSql,
  type PracticeChatMessage,
} from '@/lib/api';
import { getQuestionIndex, updatePracticeQuestionDraft } from '@/lib/sql-practice-notes';
import { supabase } from '@/lib/supabase';
import type {
  PracticeConversationMessage,
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
  moduleId: string;
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

type SetFilter = 'All' | 'In Progress' | 'Completed' | 'Needs Review' | 'Bookmarked';
type PageView = 'generate' | 'my-practice' | 'workspace';

const difficulties: SqlPracticeDifficulty[] = ['Beginner', 'Intermediate', 'Advanced'];
const questionTypes: SqlPracticeQuestionType[] = ['SELECT', 'WHERE', 'JOIN', 'GROUP BY', 'AGGREGATION'];
const setFilters: SetFilter[] = ['All', 'In Progress', 'Completed', 'Needs Review', 'Bookmarked'];

export default function SqlPracticeScreen() {
  const { colors } = useAppTheme();
  const { user, session } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= DesignTokens.layout.desktopBreakpoint;
  const [sets, setSets] = useState<PracticeSetRecord[]>([]);
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [view, setView] = useState<PageView>('generate');
  const [filter, setFilter] = useState<SetFilter>('All');
  const [selectedCategoryId, setSelectedCategoryId] = useState(sqlLearningCategories[0]?.id ?? '');
  const [selectedModuleId, setSelectedModuleId] = useState(
    sqlLearningCategories[0]?.modules[0]?.id ?? '',
  );
  const [selectedTopicId, setSelectedTopicId] = useState(
    sqlLearningCategories[0]?.modules[0]?.topics[0]?.id ?? '',
  );
  const [selectedSubtopicId, setSelectedSubtopicId] = useState(
    sqlLearningCategories[0]?.modules[0]?.topics[0]?.subtopics[0]?.id ?? '',
  );
  const [difficulty, setDifficulty] = useState<SqlPracticeDifficulty>('Beginner');
  const [questionType, setQuestionType] = useState<SqlPracticeQuestionType>('SELECT');
  const [questionCount, setQuestionCount] = useState(3);
  const [messages, setMessages] = useState<PracticeConversationMessage[]>([]);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [attempts, setAttempts] = useState<PracticeAttemptRecord[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [evaluatorOpen, setEvaluatorOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const sendLock = useRef(false);
  const pendingDraft = useRef<{ questionId: string; sql: string } | null>(null);
  const evaluatorMessagesRef = useRef<ScrollView>(null);
  const isAtLatestMessage = useRef(true);
  const { styles } = usePracticeStyles();

  const scrollToLatestMessage = () => {
    isAtLatestMessage.current = true;
    setShowJumpToLatest(false);
    evaluatorMessagesRef.current?.scrollToEnd({ animated: true });
  };

  const category = useMemo(
    () => sqlLearningCategories.find((item) => item.id === selectedCategoryId) ?? null,
    [selectedCategoryId],
  );
  const module = useMemo(
    () => category?.modules.find((item) => item.id === selectedModuleId) ?? null,
    [category, selectedModuleId],
  );
  const topic = useMemo(
    () => module?.topics.find((item) => item.id === selectedTopicId) ?? null,
    [module, selectedTopicId],
  );
  const subtopic = useMemo(
    () => topic?.subtopics.find((item) => item.id === selectedSubtopicId) ?? null,
    [selectedSubtopicId, topic],
  );

  const activeSet = sets.find((set) => set.id === activeSetId) ?? null;
  const currentQuestion = activeSet?.questions[activeSet.current_question_index] ?? null;

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
      setSets(
        setRows.map((row) => ({
          ...row,
          questions: questionsBySet.get(row.id) ?? [],
        })),
      );
      setStorageError('');
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
  }, [user]);

  useEffect(() => {
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
    if (!currentQuestion || !supabase) {
      setAttempts([]);
      return;
    }
    const questionId = currentQuestion.id;
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
  }, [currentQuestion?.id]);

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

  const questionSummary = useMemo(() => {
    const allQuestions = sets.flatMap((set) => set.questions);
    return {
      activeSets: sets.filter((set) => getSetStatus(set) === 'In Progress').length,
      toContinue: allQuestions.filter((question) => question.status === 'in_progress').length,
      completed: allQuestions.filter((question) => question.status === 'completed').length,
      needsReview: allQuestions.filter((question) => question.status === 'needs_review').length,
    };
  }, [sets]);

  const filteredSets = useMemo(
    () =>
      sets.filter((set) =>
        filter === 'All'
          ? true
          : filter === 'Bookmarked'
            ? set.bookmarked
            : getSetStatus(set) === filter,
      ),
    [filter, sets],
  );

  const updateActiveSetLocally = (updater: (set: PracticeSetRecord) => PracticeSetRecord) => {
    if (!activeSetId) {
      return;
    }
    setSets((current) => current.map((set) => (set.id === activeSetId ? updater(set) : set)));
  };

  const generateSet = async () => {
    if (!user || !session?.access_token || !supabase || !category || !module || !topic || !subtopic) {
      setError('Sign in and choose a complete topic path before generating a practice set.');
      return;
    }

    setGenerating(true);
    setError('');
    try {
      const config: PracticeConfiguration = {
        categoryId: category.id,
        moduleId: module.id,
        topicId: topic.id,
        subtopicId: subtopic.id,
        difficulty,
        questionType,
        count: questionCount,
      };
      const learningContext = [
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
        category: category.title,
        module: module.title,
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
      setView('workspace');
      setEvaluatorOpen(false);
      setMessages([]);
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
    setEvaluatorOpen(false);
    setError('');
    setMessages([]);
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
    setMessages([]);
    setEvaluatorOpen(false);
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

  const sendEvaluatorMessage = async (
    message: string,
    history: PracticeConversationMessage[] = messages,
  ) => {
    if (
      sendLock.current ||
      !currentQuestion ||
      !session?.access_token ||
      !supabase ||
      !message.trim()
    ) {
      return;
    }
    sendLock.current = true;
    setSendingMessage(true);
    setError('');
    try {
      const insertedUser = await supabase
        .from('practice_evaluator_messages')
        .insert({
          question_id: currentQuestion.id,
          role: 'user',
          content: message.trim(),
        })
        .select('*')
        .single();
      if (insertedUser.error) {
        throw insertedUser.error;
      }
      setMessages((current) => [...current, insertedUser.data as PracticeConversationMessage]);
      setMessageDraft('');
      const reply = await askPracticeEvaluator({
        accessToken: session.access_token,
        question: currentQuestion.content,
        sql: currentQuestion.draft_sql,
        result: currentQuestion.latest_result,
        history: history
          .slice(-20)
          .map(({ role, content }): PracticeChatMessage => ({ role, content })),
        message: message.trim(),
      });
      const insertedAssistant = await supabase
        .from('practice_evaluator_messages')
        .insert({
          question_id: currentQuestion.id,
          role: 'assistant',
          content: reply,
        })
        .select('*')
        .single();
      if (insertedAssistant.error) {
        throw new Error(`The AI response was received but could not be saved: ${insertedAssistant.error.message}`);
      }
      setMessages((current) => [...current, insertedAssistant.data as PracticeConversationMessage]);
    } catch (chatError) {
      setError(
        getErrorMessage(
          chatError,
          'The evaluator could not respond. Your question is saved; retry or ask again.',
        ),
      );
    } finally {
      sendLock.current = false;
      setSendingMessage(false);
    }
  };

  const openEvaluator = async () => {
    if (!currentQuestion || !supabase) {
      return;
    }
    if (!isDesktop) {
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
      router.push({
        pathname: '/sql-practice-evaluator',
        params: { setId: activeSetId ?? '', questionId: currentQuestion.id },
      });
      return;
    }
    setEvaluatorOpen(true);
    setLoadingMessages(true);
    setError('');
    try {
      const result = await supabase
        .from('practice_evaluator_messages')
        .select('*')
        .eq('question_id', currentQuestion.id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (result.error) {
        throw result.error;
      }
      const savedMessages = (result.data ?? []) as unknown as PracticeConversationMessage[];
      setMessages(savedMessages);
      if (savedMessages.length === 0) {
        const initialMessage = 'Please review my current SQL approach for this question. Explain what is correct, what could improve, and why.';
        await sendEvaluatorMessage(initialMessage, []);
      }
    } catch (chatError) {
      setError(
        getErrorMessage(
          chatError,
          'The saved evaluator conversation could not be loaded. Apply the SQL Practice migration and retry.',
        ),
      );
    } finally {
      setLoadingMessages(false);
    }
  };

  const markCompleted = async () => {
    if (!activeSet || !currentQuestion || !supabase) {
      return;
    }
    const { error: updateError } = await supabase
      .from('practice_questions')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', currentQuestion.id);
    if (updateError) {
      setStorageError(`Completion state could not be saved: ${updateError.message}`);
      return;
    }
    setStorageError('');
    updateActiveSetLocally((set) => ({
      ...set,
      questions: set.questions.map((question) =>
        question.id === currentQuestion.id
          ? { ...question, status: 'completed' }
          : question,
      ),
    }));
  };

  const toggleBookmark = async (set: PracticeSetRecord) => {
    if (!supabase) {
      return;
    }
    const bookmarked = !set.bookmarked;
    const { error: updateError } = await supabase
      .from('practice_sets')
      .update({ bookmarked, updated_at: new Date().toISOString() })
      .eq('id', set.id);
    if (updateError) {
      setError(`Bookmark state could not be saved: ${updateError.message}`);
      return;
    }
    setSets((current) =>
      current.map((item) => (item.id === set.id ? { ...item, bookmarked } : item)),
    );
  };

  const changeCategory = (id: string) => {
    const nextCategory = sqlLearningCategories.find((item) => item.id === id);
    setSelectedCategoryId(id);
    setSelectedModuleId(nextCategory?.modules[0]?.id ?? '');
    setSelectedTopicId(nextCategory?.modules[0]?.topics[0]?.id ?? '');
    setSelectedSubtopicId(nextCategory?.modules[0]?.topics[0]?.subtopics[0]?.id ?? '');
  };
  const changeModule = (id: string) => {
    const nextModule = category?.modules.find((item) => item.id === id);
    setSelectedModuleId(id);
    setSelectedTopicId(nextModule?.topics[0]?.id ?? '');
    setSelectedSubtopicId(nextModule?.topics[0]?.subtopics[0]?.id ?? '');
  };
  const changeTopic = (id: string) => {
    const nextTopic = module?.topics.find((item) => item.id === id);
    setSelectedTopicId(id);
    setSelectedSubtopicId(nextTopic?.subtopics[0]?.id ?? '');
  };

  const statusCounts = [
    { label: 'Active Sets', value: questionSummary.activeSets },
    { label: 'Questions to Continue', value: questionSummary.toContinue },
    { label: 'Completed Questions', value: questionSummary.completed },
    { label: 'Needs Review', value: questionSummary.needsReview },
  ];

  return (
    <View style={styles.screen}>
      <PageHeader
        eyebrow="PRACTICE LAB"
        title="SQL Practice"
        subtitle="Practice real SQL problems, execute your queries, and learn from every attempt."
      />

      <View style={styles.topActions}>
        <Button onPress={() => setView('generate')} style={styles.topActionButton}>
          Generate Practice
        </Button>
        <Button
          variant="secondary"
          onPress={() => setView('my-practice')}
          style={styles.topActionButton}>
          My Practice
        </Button>
      </View>

      <View style={styles.metricGrid}>
        {statusCounts.map((item) => (
          <Card key={item.label} style={styles.metricCard}>
            <Text style={[styles.metricValue, { color: colors.primaryText }]}>{item.value}</Text>
            <Text style={[styles.metricLabel, { color: colors.secondaryText }]}>{item.label}</Text>
          </Card>
        ))}
      </View>

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
          <SectionHeader
            title="Generate Practice"
            subtitle="Choose a learning path and create a set of original SQL exercises."
          />
          <View style={styles.formGrid}>
            <SelectField
              label="Category"
              value={category?.title ?? ''}
              options={sqlLearningCategories.map((item) => ({ label: item.title, value: item.id }))}
              onChange={changeCategory}
            />
            <SelectField
              label="Module"
              value={module?.title ?? ''}
              options={(category?.modules ?? []).map((item) => ({ label: item.title, value: item.id }))}
              onChange={changeModule}
            />
            <SelectField
              label="Topic"
              value={topic?.title ?? ''}
              options={(module?.topics ?? []).map((item) => ({ label: item.title, value: item.id }))}
              onChange={changeTopic}
            />
            <SelectField
              label="Subtopic"
              value={subtopic?.title ?? ''}
              options={(topic?.subtopics ?? []).map((item) => ({ label: item.title, value: item.id }))}
              onChange={setSelectedSubtopicId}
            />
            <SelectField
              label="Difficulty"
              value={difficulty}
              options={difficulties.map((item) => ({ label: item, value: item }))}
              onChange={(value) => setDifficulty(value as SqlPracticeDifficulty)}
            />
            <SelectField
              label="Question Type"
              value={questionType}
              options={questionTypes.map((item) => ({ label: item, value: item }))}
              onChange={(value) => setQuestionType(value as SqlPracticeQuestionType)}
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
            Sets are numbered separately for each matching configuration and saved to your account.
          </Text>
          <SectionHeader title="Recent Sets" subtitle="Reopen your saved work whenever you are ready." />
          <PracticeSetList
            sets={sets.slice(0, 4)}
            onOpen={openSet}
            onBookmark={(set) => void toggleBookmark(set)}
            colors={colors}
            loading={loading}
          />
        </Card>
      ) : null}

      {view === 'my-practice' ? (
        <Card style={styles.panel}>
          <SectionHeader title="My Practice" subtitle="Continue, restore, bookmark, or revisit any set." />
          <View style={styles.filterRow}>
            {setFilters.map((item) => (
              <ChoicePill
                key={item}
                label={item}
                selected={filter === item}
                onPress={() => setFilter(item)}
              />
            ))}
          </View>
          <PracticeSetList
            sets={filteredSets}
            onOpen={openSet}
            onBookmark={(set) => void toggleBookmark(set)}
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
              {currentQuestion.status !== 'completed' ? (
                <Button variant="secondary" onPress={() => void markCompleted()}>
                  Mark Complete
                </Button>
              ) : null}
              <Button variant="secondary" onPress={() => setView('my-practice')}>
                My Practice
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

          {evaluatorOpen && isDesktop ? (
            <Card style={[styles.panel, styles.desktopEvaluator]}>
              <SectionHeader
                title="AI Evaluator"
                subtitle="A learning conversation about this question and your current SQL."
                action={
                  <Button variant="secondary" onPress={() => setEvaluatorOpen(false)}>
                    Close
                  </Button>
                }
              />
              {loadingMessages ? <ActivityIndicator color={colors.primary} /> : null}
              <View style={styles.chatMessageViewport}>
                <ScrollView
                  ref={evaluatorMessagesRef}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  onContentSizeChange={() => {
                    if (isAtLatestMessage.current) {
                      requestAnimationFrame(() =>
                        evaluatorMessagesRef.current?.scrollToEnd({ animated: false }),
                      );
                    }
                  }}
                  onScroll={(event) => {
                    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
                    const isNearLatest =
                      contentSize.height - contentOffset.y - layoutMeasurement.height < 48;
                    if (isAtLatestMessage.current !== isNearLatest) {
                      isAtLatestMessage.current = isNearLatest;
                      setShowJumpToLatest(!isNearLatest);
                    }
                  }}
                  scrollEventThrottle={16}
                  style={styles.chatMessageList}
                  contentContainerStyle={styles.chatMessages}>
                  {messages.map((message) => (
                    <View
                      key={message.id}
                      style={[
                        styles.chatBubble,
                        {
                          alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                          backgroundColor:
                            message.role === 'user' ? colors.primarySoft : colors.surfaceMuted,
                          borderColor: colors.border,
                        },
                      ]}>
                      {message.role === 'assistant' ? (
                        <MarkdownContent content={message.content} compactContent />
                      ) : (
                        <Text style={[styles.chatUserText, { color: colors.primaryText }]}>
                          {message.content}
                        </Text>
                      )}
                    </View>
                  ))}
                </ScrollView>
                {showJumpToLatest ? (
                  <Pressable
                    accessibilityLabel="Jump to latest message"
                    accessibilityRole="button"
                    onPress={scrollToLatestMessage}
                    style={[
                      styles.jumpToLatest,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}>
                    <SymbolView
                      name={{ ios: 'arrow.down', android: 'arrow_downward', web: 'arrow_downward' }}
                      size={18}
                      tintColor={colors.primaryText}
                    />
                  </Pressable>
                ) : null}
              </View>
              <View
                style={[
                  styles.chatInputRow,
                  { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
                ]}>
                <TextInput
                  accessibilityLabel="Ask the SQL evaluator a follow-up question"
                  maxLength={4_000}
                  multiline
                  value={messageDraft}
                  onChangeText={setMessageDraft}
                  placeholder="Message the evaluator…"
                  placeholderTextColor={colors.mutedText}
                  style={[styles.chatInput, { color: colors.primaryText }]}
                />
                <Pressable
                  accessibilityLabel="Send message"
                  accessibilityRole="button"
                  disabled={sendingMessage || !messageDraft.trim()}
                  onPress={() => {
                    scrollToLatestMessage();
                    void sendEvaluatorMessage(messageDraft);
                  }}
                  style={({ pressed }) => [
                    styles.chatSendButton,
                    { backgroundColor: colors.primary },
                    pressed && styles.chatSendPressed,
                    (sendingMessage || !messageDraft.trim()) && styles.chatSendDisabled,
                  ]}>
                  {sendingMessage ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <SymbolView
                      name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }}
                      size={20}
                      tintColor={colors.white}
                    />
                  )}
                </Pressable>
              </View>
            </Card>
          ) : null}
        </View>
      ) : view === 'workspace' ? (
        <Card style={styles.panel}>
          <Text style={[styles.emptyTitle, { color: colors.primaryText }]}>
            This practice set has no questions.
          </Text>
          <Button variant="secondary" onPress={() => setView('my-practice')}>
            Back to My Practice
          </Button>
        </Card>
      ) : null}
    </View>
  );
}

function PracticeSetList({
  sets,
  onOpen,
  onBookmark,
  colors,
  loading,
}: {
  sets: PracticeSetRecord[];
  onOpen: (set: PracticeSetRecord) => void;
  onBookmark: (set: PracticeSetRecord) => void;
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
            styles.setItem,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
          ]}>
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpen(set)}
            style={({ pressed }) => [styles.setOpenButton, pressed && styles.pressed]}>
            <View style={styles.setTitleRow}>
              <Text style={[styles.setTitle, { color: colors.primaryText }]}>
                Set {set.set_number} · {set.title}
              </Text>
              <Badge tone={statusTone(getSetStatus(set))}>{getSetStatus(set)}</Badge>
            </View>
            <Text style={[styles.setMeta, { color: colors.secondaryText }]}>
              {set.questions.length} questions · {new Date(set.created_at).toLocaleDateString()}
            </Text>
            <Text style={[styles.setMeta, { color: colors.secondaryText }]}>
              {set.questions.filter((question) => question.status === 'completed').length} of{' '}
              {set.questions.length} completed
            </Text>
          </Pressable>
          <Pressable
            accessibilityLabel={set.bookmarked ? 'Remove bookmark' : 'Bookmark practice set'}
            accessibilityRole="button"
            onPress={() => onBookmark(set)}
            style={({ pressed }) => [styles.bookmarkButton, pressed && styles.pressed]}>
            <Text style={[styles.bookmarkText, { color: set.bookmarked ? colors.primary : colors.secondaryText }]}>
              {set.bookmarked ? '★' : '☆'}
            </Text>
          </Pressable>
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
  options: Array<{ label: string; value: string }>;
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

function ChoicePill({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { styles, colors } = usePracticeStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choicePill,
        {
          backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted,
          borderColor: selected ? colors.primary : colors.border,
        },
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.choiceText, { color: selected ? colors.primary : colors.primaryText }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function usePracticeStyles() {
  const { colors } = useAppTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, minWidth: 0, gap: 18 },
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
        setItem: {
          borderWidth: 1,
          borderRadius: DesignTokens.radius.small,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
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
        sqlColumn: { flex: 6, minWidth: 0, gap: 16 },
        desktopEvaluator: { flex: 4, minWidth: 0, maxHeight: 780 },
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
        chatMessageViewport: {
          width: '100%',
          minWidth: 0,
          position: 'relative',
        },
        chatMessageList: {
          width: '100%',
          maxHeight: 320,
        },
        chatMessages: {
          width: '100%',
          gap: 12,
          paddingVertical: 4,
        },
        chatBubble: {
          maxWidth: '94%',
          minWidth: 0,
          flexShrink: 1,
          borderWidth: 1,
          borderRadius: 14,
          overflow: 'hidden',
          padding: 8,
        },
        chatUserText: { fontSize: 14, lineHeight: 21 },
        jumpToLatest: {
          position: 'absolute',
          alignSelf: 'center',
          bottom: 8,
          width: 40,
          height: 40,
          borderRadius: 20,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        chatInputRow: {
          minHeight: 56,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 8,
          marginTop: 12,
          padding: 6,
          borderWidth: 1,
          borderRadius: 28,
        },
        chatSendButton: {
          width: 42,
          height: 42,
          borderRadius: 21,
          alignItems: 'center',
          justifyContent: 'center',
        },
        chatSendPressed: { opacity: 0.82 },
        chatSendDisabled: { opacity: 0.5 },
        chatInput: {
          flex: 1,
          minWidth: 0,
          minHeight: 42,
          maxHeight: 110,
          paddingHorizontal: 12,
          paddingVertical: 8,
          fontSize: 14,
          lineHeight: 20,
        },
      }),
    [colors],
  );
  return { styles, colors };
}

function getSetStatus(set: PracticeSetRecord): SetFilter {
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

function statusTone(status: SqlPracticeStatus | SetFilter): 'blue' | 'green' | 'amber' | 'neutral' {
  if (status === 'Completed' || status === 'completed') {
    return 'green';
  }
  if (status === 'Needs Review' || status === 'needs_review') {
    return 'amber';
  }
  if (status === 'Bookmarked') {
    return 'neutral';
  }
  return 'blue';
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}
