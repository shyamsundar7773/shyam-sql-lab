import { sqlLearningCategories } from '@/data/sqlLearningContent';
import type { Category, Module, Topic } from '@/types/learning-content';

export type TopicContext = {
  category: Category;
  module: Module;
  topic: Topic;
  previousTopic: Topic | null;
  nextTopic: Topic | null;
};

export function getLearningCategories() {
  return sqlLearningCategories;
}

export function getCategoryById(categoryId: string | undefined) {
  return sqlLearningCategories.find((category) => category.id === categoryId) ?? null;
}

export function getModuleById(category: Category | null, moduleId: string | undefined) {
  return category?.modules.find((module) => module.id === moduleId) ?? null;
}

export function getLearningOverview() {
  return sqlLearningCategories.map((category) => ({
    category,
    moduleCount: category.modules.length,
    topicCount: category.modules.reduce((count, module) => count + module.topics.length, 0),
  }));
}

export function getTopicContext(topicId: string): TopicContext | null {
  const flattened = sqlLearningCategories.flatMap((category) =>
    category.modules.flatMap((module) =>
      module.topics.map((topic) => ({ category, module, topic })),
    ),
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
