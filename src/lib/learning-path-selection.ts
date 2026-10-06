import type { Category, Topic } from '@/types/learning-content';

export type LearningPathSelection = {
  categoryId: string;
  topicId: string;
  subtopicId: string;
};

export type LearningPathOptions = {
  category: Category | null;
  topics: Topic[];
  topic: Topic | null;
  subtopics: Topic['subtopics'];
  choices: {
    level: 'categories' | 'topics' | 'subtopics';
    items: { id: string; title: string; description: string }[];
  };
};

export function getLearningPathOptions(
  categories: Category[],
  selection: LearningPathSelection,
): LearningPathOptions {
  const category = categories.find((item) => item.id === selection.categoryId) ?? null;
  const topic = category?.topics.find((item) => item.id === selection.topicId) ?? null;
  const subtopics = topic?.subtopics ?? [];
  const choices = !category
    ? {
        level: 'categories' as const,
        items: categories.map(({ id, title, description }) => ({
          id,
          title,
          description: description || 'Explore the core concepts behind SQL and databases.',
        })),
      }
    : !topic
      ? {
          level: 'topics' as const,
          items: category.topics.map(({ id, title, summary }) => ({
            id,
            title,
            description: summary,
          })),
        }
      : {
          level: 'subtopics' as const,
          items: topic.subtopics.map(({ id, title, definition, explanation }) => ({
            id,
            title,
            description: definition ?? explanation[0] ?? '',
          })),
        };
  return {
    category,
    topics: category?.topics ?? [],
    topic,
    subtopics,
    choices,
  };
}

export function selectLearningPathCategory(
  categoryId: string,
): LearningPathSelection {
  return { categoryId, topicId: '', subtopicId: '' };
}

export function selectLearningPathTopic(
  current: LearningPathSelection,
  topicId: string,
): LearningPathSelection {
  return { ...current, topicId, subtopicId: '' };
}

export function selectLearningPathSubtopic(
  current: LearningPathSelection,
  subtopicId: string,
): LearningPathSelection {
  return { ...current, subtopicId };
}
