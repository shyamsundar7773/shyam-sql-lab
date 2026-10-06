import { sqlLearningCategories } from '@/data/sqlLearningContent';
import type { Category, Subtopic, Topic } from '@/types/learning-content';

export type TopicContext = {
  category: Category;
  topic: Topic;
  previousTopic: Topic | null;
  nextTopic: Topic | null;
};

export type SubtopicContext = {
  category: Category;
  topic: Topic;
  subtopic: Subtopic;
};

export type SubtopicConversationIdentity = {
  categoryId: string;
  topicId: string;
  subtopicId: string;
};

export function canSendTopicMessage(input: {
  categoryId: string | undefined;
  topicId: string | undefined;
  subtopicId: string | undefined;
  conversationReady: boolean;
  sessionReady: boolean;
  loading: boolean;
  loadError: string;
  sending: boolean;
  message: string;
}) {
  return Boolean(
    input.categoryId &&
      input.topicId &&
      input.subtopicId &&
      input.conversationReady &&
      input.sessionReady &&
      !input.loading &&
      !input.loadError &&
      !input.sending &&
      input.message.trim(),
  );
}

export function getLearningCategories() {
  return sqlLearningCategories;
}

export function getCategoryById(categoryId: string | undefined) {
  return sqlLearningCategories.find((category) => category.id === categoryId) ?? null;
}

export function getLearningOverview() {
  return sqlLearningCategories.map((category) => ({
    category,
    topicCount: category.topics.length,
  }));
}

export function getTopicContext(topicId: string): TopicContext | null {
  const flattened = sqlLearningCategories.flatMap((category) =>
    category.topics.map((topic) => ({ category, topic })),
  );
  const index = flattened.findIndex(({ topic }) => topic.id === topicId);
  if (index < 0) {
    return null;
  }

  const current = flattened[index];
  return {
    ...current,
    previousTopic: flattened[index - 1]?.topic ?? null,
    nextTopic: flattened[index + 1]?.topic ?? null,
  };
}

export function getSubtopicContext(
  categoryId: string,
  topicId: string,
  subtopicId: string,
): SubtopicContext | null {
  const category = getCategoryById(categoryId);
  const topic = category?.topics.find((item) => item.id === topicId);
  const subtopic = topic?.subtopics.find((item) => item.id === subtopicId);
  return category && topic && subtopic ? { category, topic, subtopic } : null;
}

export function getSelectedSubtopicContext(
  categoryId: string | undefined,
  topicId: string | undefined,
  subtopicId: string | undefined,
): SubtopicContext | null {
  if (!categoryId || !topicId || !subtopicId) {
    return null;
  }
  return getSubtopicContext(categoryId, topicId, subtopicId);
}

export function getSubtopicConversationIdentity(
  categoryId: string,
  topicId: string,
  subtopicId: string,
): SubtopicConversationIdentity | null {
  const context = getSubtopicContext(categoryId, topicId, subtopicId);
  return context
    ? {
        categoryId: context.category.id,
        topicId: context.topic.id,
        subtopicId: context.subtopic.id,
      }
    : null;
}
