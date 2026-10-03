import { sqlLearningCategories } from '../data/sqlLearningContent';

export type PracticeNotesFilterableSet = {
  config: {
    categoryId: string;
    topicId: string;
  };
};

export type PracticePathIds = {
  categoryId: string;
  moduleId: string;
  topicId: string;
  subtopicId: string;
};

export type PracticeLearningContext = {
  category: string;
  module: string;
  topic: string;
  subtopic: string;
};

export type PracticeNotesQuestion = {
  content: {
    solutionSql?: string;
  };
  draft_sql: string;
};

export type PracticeNotesAttempt = {
  sql: string;
  created_at: string;
};

export type PracticeNotesMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
};

export type DraftablePracticeSet<Question extends { id: string; draft_sql: string }> = {
  id: string;
  questions: Question[];
};

export function filterPracticedSets<T extends PracticeNotesFilterableSet>(
  sets: T[],
  categoryId: string,
  topicId: string,
): T[] {
  return sets.filter(
    (set) =>
      (categoryId === 'all' || set.config.categoryId === categoryId) &&
      (topicId === 'all' || set.config.topicId === topicId),
  );
}

export function getPracticeLearningContext(config: PracticePathIds): PracticeLearningContext {
  const category = sqlLearningCategories.find((item) => item.id === config.categoryId);
  const module = category?.modules.find((item) => item.id === config.moduleId);
  const topic = module?.topics.find((item) => item.id === config.topicId);
  const subtopic = topic?.subtopics.find((item) => item.id === config.subtopicId);

  return {
    category: category?.title ?? config.categoryId,
    module: module?.title ?? config.moduleId,
    topic: topic?.title ?? config.topicId,
    subtopic: subtopic?.title ?? config.subtopicId,
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
  const latestAttempt = [...attempts].sort(
    (left, right) => right.created_at.localeCompare(left.created_at),
  )[0];
  return {
    correctAnswer: question.content.solutionSql ?? '',
    attemptedAnswer: latestAttempt?.sql || question.draft_sql,
    aiMessages: [...messages].sort((left, right) =>
      left.created_at.localeCompare(right.created_at),
    ),
  };
}
