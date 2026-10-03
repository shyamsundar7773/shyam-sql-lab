import { clientEnv } from '@/config/env';
import type {
  PracticeQuestionContent,
  SqlPracticeDifficulty,
  SqlPracticeExecutionResult,
  SqlPracticeQuestionType,
} from '@/types/sql-practice';

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
  category: string;
  module: string;
  topic: string;
  officialContent: string;
  history: TopicChatHistoryItem[];
  question: string;
};

export type TopicChatResponse = {
  reply: string;
  mode: 'ai' | 'development-fallback';
};

export type PracticeGenerationOptions = {
  accessToken: string;
  category: string;
  module: string;
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

async function requestPracticeApi<T>(
  endpoint: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!clientEnv.apiUrl) {
    throw new Error('The SQL practice API is not configured. Set EXPO_PUBLIC_API_URL.');
  }

  const response = await fetch(`${clientEnv.apiUrl.replace(/\/+$/, '')}${endpoint}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getApiError(result, `SQL practice request failed with HTTP ${response.status}.`));
  }
  return result as T;
}

export async function generatePracticeQuestions(
  options: PracticeGenerationOptions,
): Promise<PracticeQuestionContent[]> {
  const result = await requestPracticeApi<{ questions: unknown }>(
    '/api/practice/generate',
    options.accessToken,
    {
      category: options.category,
      module: options.module,
      topic: options.topic,
      subtopic: options.subtopic,
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
  question: PracticeQuestionContent,
  sql: string,
): Promise<SqlPracticeExecutionResult> {
  const result = await requestPracticeApi<unknown>('/api/practice/execute', accessToken, {
    question,
    sql,
  });
  if (
    !isRecord(result) ||
    typeof result.ok !== 'boolean' ||
    !Array.isArray(result.columns) ||
    !result.columns.every((column) => typeof column === 'string') ||
    !Array.isArray(result.rows) ||
    !result.rows.every(isRecord) ||
    (result.error !== undefined && typeof result.error !== 'string')
  ) {
    throw new Error('The SQL engine returned an unexpected response.');
  }
  return result as SqlPracticeExecutionResult;
}

export async function askPracticeEvaluator(options: {
  accessToken: string;
  question: PracticeQuestionContent;
  sql: string;
  result: SqlPracticeExecutionResult | null;
  history: PracticeChatMessage[];
  message: string;
}): Promise<string> {
  const result = await requestPracticeApi<{ reply: unknown }>(
    '/api/practice/evaluate',
    options.accessToken,
    {
      question: options.question,
      sql: options.sql,
      result: options.result,
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
  category,
  module,
  topic,
  officialContent,
  history,
  question,
}: TopicChatRequest): Promise<TopicChatResponse> {
  if (!clientEnv.apiUrl) {
    throw new Error('The learning chat API is not configured. Set EXPO_PUBLIC_API_URL.');
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
      category,
      module,
      topic,
      officialContent,
      history,
      question,
    }),
  });

  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof result === 'object' &&
      result !== null &&
      'error' in result &&
      typeof result.error === 'string'
        ? result.error
        : `Learning chat request failed with HTTP ${response.status}.`;
    throw new Error(message);
  }

  if (
    typeof result !== 'object' ||
    result === null ||
    !('reply' in result) ||
    typeof result.reply !== 'string' ||
    !('mode' in result) ||
    (result.mode !== 'ai' && result.mode !== 'development-fallback')
  ) {
    throw new Error('The learning chat API returned an unexpected response.');
  }

  return { reply: result.reply, mode: result.mode };
}
