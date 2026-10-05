import { sqlLearningCategories } from '../data/sqlLearningContent';
import type { SqlPracticeExecutionResult } from '../types/sql-practice';

export type PracticeNotesFilterableSet = {
  config: {
    categoryId: string;
    topicId: string;
    subtopicId: string;
  };
};

export type PracticePathIds = {
  categoryId: string;
  topicId: string;
  subtopicId: string;
};

export type PracticeLearningContext = {
  category: string;
  topic: string;
  subtopic: string;
  categoryId: string;
  topicId: string;
  subtopicId: string;
};

export type PracticeNotesQuestion = {
  id: string;
  content: {
    solutionSql?: string;
  };
  draft_sql: string;
};

export type PracticeNotesAttempt = {
  id: string;
  question_id: string;
  sql: string;
  execution_result: SqlPracticeExecutionResult | null;
  created_at: string;
};

export type PracticeNotesMessage = {
  id: string;
  question_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

export type PracticeEvaluatorExecution =
  | { status: 'not_executed' }
  | {
      status: 'succeeded' | 'failed';
      sql: string;
      result: SqlPracticeExecutionResult;
      attemptId: string;
    };

export function getPracticeEvaluatorRequestHistory(messages: PracticeNotesMessage[]) {
  return messages.slice(-20).map(({ role, content }) => ({
    role,
    content: content.slice(0, 4_000),
  }));
}

export function getPracticeEvaluatorLegacyRequestContext(
  execution: PracticeEvaluatorExecution,
) {
  return execution.status === 'not_executed'
    ? {}
    : { sql: execution.sql, result: execution.result };
}

export function getPendingPracticeEvaluatorUserMessage(
  messages: PracticeNotesMessage[],
  content: string,
) {
  const lastMessage = messages.at(-1);
  return lastMessage?.role === 'user' && lastMessage.content === content
    ? lastMessage
    : null;
}

export type PracticeEvaluatorRoute = {
  pathname: '/sql-practice-evaluator';
  params: {
    setId: string;
    questionId: string;
    attemptId?: string;
  };
};

export function getPracticeEvaluatorBackRoute(setId: string, questionId: string) {
  return {
    pathname: '/sql-practice' as const,
    params: {
      restoreSetId: setId,
      restoreQuestionId: questionId,
    },
  };
}

export function getPracticeEvaluatorExecution(
  questionId: string,
  draftSql: string,
  attempt: PracticeNotesAttempt | null,
): PracticeEvaluatorExecution {
  if (
    !attempt ||
    attempt.question_id !== questionId ||
    attempt.sql !== draftSql ||
    !attempt.execution_result
  ) {
    return { status: 'not_executed' };
  }
  return {
    status: attempt.execution_result.ok ? 'succeeded' : 'failed',
    sql: attempt.sql,
    result: attempt.execution_result,
    attemptId: attempt.id,
  };
}

export function getPracticeEvaluatorRoute(
  setId: string,
  questionId: string,
  execution: PracticeEvaluatorExecution,
): PracticeEvaluatorRoute {
  return {
    pathname: '/sql-practice-evaluator',
    params: {
      setId,
      questionId,
      ...(execution.status === 'not_executed' ? {} : { attemptId: execution.attemptId }),
    },
  };
}

export type DraftablePracticeSet<Question extends { id: string; draft_sql: string }> = {
  id: string;
  questions: Question[];
};

export function buildPracticeAttemptReviewPrompt(sql: string, attemptNumber: number): string {
  return [
    `Evaluate Attempt ${attemptNumber} as a new, independent submission. Do not reuse SQL, results, or conclusions from earlier attempts in this conversation. The SQL below is the exact current submission; use this attempt's execution result as the source of truth. Begin your reply by identifying Attempt ${attemptNumber} and quoting the submitted SQL, then explain whether it answers the question and what its result shows.`,
    '',
    '```sql',
    sql,
    '```',
  ].join('\n');
}

export function filterPracticedSets<T extends PracticeNotesFilterableSet>(
  sets: T[],
  categoryId: string,
  topicId: string,
  subtopicId: string = 'all',
): T[] {
  return sets.filter(
    (set) =>
      (categoryId === 'all' || set.config.categoryId === categoryId) &&
      (topicId === 'all' || set.config.topicId === topicId) &&
      (subtopicId === 'all' || set.config.subtopicId === subtopicId),
  );
}

export function getPracticeLearningContext(config: PracticePathIds): PracticeLearningContext {
  const category = sqlLearningCategories.find((item) => item.id === config.categoryId);
  const topic = category?.topics.find((item) => item.id === config.topicId);
  const subtopic = topic?.subtopics.find((item) => item.id === config.subtopicId);

  return {
    category: category?.title ?? config.categoryId,
    topic: topic?.title ?? config.topicId,
    subtopic: subtopic?.title ?? config.subtopicId,
    categoryId: config.categoryId,
    topicId: config.topicId,
    subtopicId: config.subtopicId,
  };
}

export function updatePracticeQuestionDraft<
  Question extends { id: string; draft_sql: string },
  Set extends DraftablePracticeSet<Question>,
>(sets: Set[], setId: string, questionId: string, draftSql: string): Set[] {
  return sets.map((set) =>
    set.id !== setId
      ? set
      : {
          ...set,
          questions: set.questions.map((question) =>
            question.id === questionId ? { ...question, draft_sql: draftSql } : question,
          ),
        },
  );
}

export function getQuestionIndex(currentIndex: number, length: number, direction: -1 | 1) {
  if (length <= 0) {
    return 0;
  }
  return Math.min(length - 1, Math.max(0, currentIndex + direction));
}

export function getPracticeQuestionReview(
  question: PracticeNotesQuestion,
  attempts: PracticeNotesAttempt[],
  messages: PracticeNotesMessage[],
) {
  const questionAttempts = attempts.filter(
    (attempt) => attempt.question_id === question.id,
  );
  const latestAttempt = [...questionAttempts].sort(
    (left, right) =>
      right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id),
  )[0];
  return {
    correctAnswer: question.content.solutionSql ?? '',
    attemptedAnswer: latestAttempt?.sql || question.draft_sql,
    aiMessages: messages.filter((message) => message.question_id === question.id).sort((left, right) =>
      left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id),
    ),
  };
}
