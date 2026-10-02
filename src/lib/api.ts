import { clientEnv } from '@/config/env';

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
