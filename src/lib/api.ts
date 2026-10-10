import { clientEnv } from '@/config/env';
import type {
  PracticeQuestionContent,
  SqlPracticeDifficulty,
  SqlPracticeExecutionResult,
  SqlPracticeQuestionType,
} from '@/types/sql-practice';
import {
  getPracticeEvaluatorLegacyRequestContext,
  type PracticeEvaluatorExecution,
} from '@/lib/sql-practice-notes';
import { getSubtopicContext } from '@/lib/learning-content';

const practiceDifficulties = new Set<SqlPracticeDifficulty>([
  'Beginner',
  'Intermediate',
  'Advanced',
]);
const practiceQuestionTypes = new Set<SqlPracticeQuestionType>([
  'SELECT',
  'WHERE',
  'JOIN',
  'GROUP BY',
  'AGGREGATION',
]);

export type ApiHealth = {
  status: 'ok';
  service: 'shyam-sql-lab-api';
};

export type TopicChatHistoryItem = {
  role: 'user' | 'assistant';
  content: string;
};

export type TopicChatRequest = {
  accessToken: string;
  categoryId: string;
  topicId: string;
  subtopicId: string;
  savedLearningNotes: {
    title: string;
    source: string;
    content: string;
  }[];
  history: TopicChatHistoryItem[];
  question: string;
};

export type TopicChatResponse = {
  reply: string;
  mode: 'ai' | 'development-fallback';
  incomplete?: boolean;
};

export type PracticeGenerationOptions = {
  accessToken: string;
  categoryId: string;
  topicId: string;
  subtopicId: string;
  category: string;
  topic: string;
  subtopic: string;
  difficulty: SqlPracticeDifficulty;
  questionType: SqlPracticeQuestionType;
  count: number;
  learningContext: string;
};

export type PracticeChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type PracticeLearningContext = {
  category: string;
  topic: string;
  subtopic: string;
  categoryId: string;
  topicId: string;
  subtopicId: string;
};

async function requestApi<T>(
  endpoint: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!clientEnv.apiUrl) {
    throw new Error('The SQL practice API is not configured. Set EXPO_PUBLIC_API_URL.');
  }

  const requestUrl = `${clientEnv.apiUrl.replace(/\/+$/, '')}${endpoint}`;
  let response: Response;
  try {
    response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw error;
  }
  const result: unknown = await response.json().catch(() => null);
  const serverError = response.ok
    ? null
    : getApiError(result, `The API request failed with HTTP ${response.status}.`);
  if (process.env.NODE_ENV === 'development' && endpoint === '/api/practice/generate') {
    console.info('[SQL Practice API diagnostic]', {
      endpoint,
      host: getApiHost(requestUrl),
      status: response.status,
      categoryId: body.categoryId,
      topicId: body.topicId,
      subtopicId: body.subtopicId,
      difficulty: body.difficulty,
      questionType: body.questionType,
      count: body.count,
      validationError: serverError?.slice(0, 200),
    });
  }
  if (!response.ok) {
    if (
      endpoint === '/api/practice/generate' &&
      serverError &&
      /valid category,\s*module,\s*topic,\s*subtopic/i.test(serverError)
    ) {
      throw new Error(
        'The configured SQL practice API still requires the legacy Module-based request. Update the API service to the canonical Category/Topic/Subtopic contract.',
      );
    }
    throw new Error(serverError ?? `The API request failed with HTTP ${response.status}.`);
  }
  return result as T;
}

function getApiHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return 'invalid-api-url';
  }
}

export async function generatePracticeQuestions(
  options: PracticeGenerationOptions,
): Promise<PracticeQuestionContent[]> {
  const context = getSubtopicContext(
    options.categoryId,
    options.topicId,
    options.subtopicId,
  );
  if (
    !context ||
    context.category.title !== options.category ||
    context.topic.title !== options.topic ||
    context.subtopic.title !== options.subtopic
  ) {
    throw new Error('Choose a valid canonical Category, Topic, and Subtopic before generating questions.');
  }
  if (
    !options.accessToken.trim() ||
    !practiceDifficulties.has(options.difficulty) ||
    !practiceQuestionTypes.has(options.questionType) ||
    !Number.isInteger(options.count) ||
    options.count < 1 ||
    options.count > 10 ||
    !options.learningContext.trim() ||
    options.learningContext.length > 25_000
  ) {
    throw new Error('Choose a valid difficulty, question type, and question count from 1 to 10.');
  }

  const result = await requestApi<{ questions: unknown }>(
    '/api/practice/generate',
    options.accessToken,
    {
      categoryId: options.categoryId,
      topicId: options.topicId,
      subtopicId: options.subtopicId,
      category: context.category.title,
      topic: context.topic.title,
      subtopic: context.subtopic.title,
      difficulty: options.difficulty,
      questionType: options.questionType,
      count: options.count,
      learningContext: options.learningContext,
    },
  );
  if (!Array.isArray(result?.questions) || !result.questions.every(isPracticeQuestionContent)) {
    throw new Error('The practice generator returned an unexpected response.');
  }
  return result.questions;
}

export async function runPracticeSql(
  accessToken: string,
  question: PracticeQuestionContent | string,
  sql: string,
): Promise<SqlPracticeExecutionResult> {
  const result = await requestApi<unknown>('/api/practice/execute', accessToken, {
    ...(typeof question === 'string' ? { exerciseText: question } : { question }),
    sql,
  });
  if (
    !isRecord(result) ||
    typeof result.ok !== 'boolean' ||
    !Array.isArray(result.columns) ||
    !result.columns.every((column) => typeof column === 'string') ||
    !Array.isArray(result.rows) ||
    !result.rows.every(isRecord) ||
    (result.error !== undefined && typeof result.error !== 'string') ||
    (result.errorType !== undefined &&
      result.errorType !== 'policy' &&
      result.errorType !== 'execution' &&
      result.errorType !== 'setup') ||
    (result.resolvedQuestion !== undefined && !isPracticeQuestionContent(result.resolvedQuestion))
  ) {
    throw new Error('The SQL engine returned an unexpected response.');
  }
  if (typeof question === 'string' && result.ok && !result.resolvedQuestion) {
    throw new Error('The SQL engine did not return the parsed exercise for evaluation.');
  }
  return result as SqlPracticeExecutionResult;
}

export async function askPracticeEvaluator(options: {
  accessToken: string;
  context: PracticeLearningContext;
  question: PracticeQuestionContent;
  draftSql: string;
  execution: PracticeEvaluatorExecution;
  history: PracticeChatMessage[];
  message: string;
}): Promise<string> {
  const result = await requestApi<{ reply: unknown }>(
    '/api/practice/evaluate',
    options.accessToken,
    {
      context: options.context,
      question: options.question,
      draftSql: options.draftSql,
      execution: options.execution.status === 'not_executed'
        ? options.execution
        : {
            status: options.execution.status,
            sql: options.execution.sql,
            attemptId: options.execution.attemptId,
            result: options.execution.result,
          },
      ...getPracticeEvaluatorLegacyRequestContext(options.execution),
      history: options.history,
      message: options.message,
    },
  );
  if (typeof result?.reply !== 'string' || !result.reply.trim()) {
    throw new Error('The AI evaluator returned an unexpected response.');
  }
  return result.reply;
}

function getApiError(value: unknown, fallback: string) {
  return isRecord(value) && typeof value.error === 'string' ? value.error : fallback;
}

function isPracticeQuestionContent(value: unknown): value is PracticeQuestionContent {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.prompt === 'string' &&
    typeof value.explanation === 'string' &&
    Array.isArray(value.concepts) &&
    value.concepts.every((concept) => typeof concept === 'string') &&
    Array.isArray(value.tables) &&
    value.tables.length > 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isApiHealth(value: unknown): value is ApiHealth {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const health = value as Record<string, unknown>;
  return health.status === 'ok' && health.service === 'shyam-sql-lab-api';
}

export async function checkApiHealth(): Promise<ApiHealth> {
  if (!clientEnv.apiUrl) {
    throw new Error('EXPO_PUBLIC_API_URL is not configured. Set it in the root .env file.');
  }

  const baseUrl = clientEnv.apiUrl.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/api/health`);

  if (!response.ok) {
    throw new Error(`Render API health check failed with HTTP ${response.status}.`);
  }

  const result: unknown = await response.json();
  if (!isApiHealth(result)) {
    throw new Error('Render API health check returned an unexpected response.');
  }

  return result;
}

export async function askTopicQuestion({
  accessToken,
  categoryId,
  topicId,
  subtopicId,
  savedLearningNotes,
  history,
  question,
}: TopicChatRequest): Promise<TopicChatResponse> {
  if (!clientEnv.apiUrl) {
    throw new Error('The learning chat API is not configured. Set EXPO_PUBLIC_API_URL.');
  }
  const context = getSubtopicContext(categoryId, topicId, subtopicId);
  if (!context) {
    throw new Error('Choose a valid canonical Category, Topic, and Subtopic before asking a learning question.');
  }

  const baseUrl = clientEnv.apiUrl.replace(/\/+$/, '');
  const response = await fetch(`${baseUrl}/api/learning-chat`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      categoryId,
      topicId,
      subtopicId,
      savedLearningNotes,
      history,
      question,
    }),
  });

  const result: unknown = await response.json().catch(() => null);
  const responseError =
    typeof result === 'object' &&
    result !== null &&
    'error' in result &&
    typeof result.error === 'string'
      ? result.error
      : null;
  if (process.env.NODE_ENV === 'development') {
    console.info('[Topic Chat API diagnostic]', {
      endpoint: '/api/learning-chat',
      host: getApiHost(baseUrl),
      categoryId,
      topicId,
      subtopicId,
      conversationReady: true,
      messagePresent: Boolean(question.trim()),
      savedNoteCount: savedLearningNotes.length,
      historyCount: history.length,
      status: response.status,
      validationError: responseError?.slice(0, 200) ?? undefined,
    });
  }
  if (!response.ok) {
    if (
      response.status === 404 ||
      (responseError &&
        /the topic,\s*lesson,\s*history,\s*and\s*questions?\s+are\s+required/i.test(responseError))
    ) {
      throw new Error(
        'The Topic Chat API endpoint or deployed request contract is outdated. Update the Render API service before retrying.',
      );
    }
    throw new Error(responseError ?? `Learning chat request failed with HTTP ${response.status}.`);
  }

  if (
    !isRecord(result) ||
    typeof result.reply !== 'string' ||
    (result.mode !== 'ai' && result.mode !== 'development-fallback') ||
    ('incomplete' in result && typeof result.incomplete !== 'boolean')
  ) {
    throw new Error('The learning chat API returned an unexpected response.');
  }

  const incomplete = result.incomplete === true;
  if (process.env.NODE_ENV === 'development') {
    console.info('[Topic Chat response diagnostic]', {
      replyCharacters: result.reply.length,
      incomplete,
    });
  }
  return { reply: result.reply, mode: result.mode, incomplete };
}
