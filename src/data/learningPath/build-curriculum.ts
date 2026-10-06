import type { LearningMaterial, Category, Topic } from '../../types/learning-content';

export type LearningPathTaxonomy = {
  id: string;
  title: string;
  description: string;
  accent: Category['accent'];
  topics: {
    id: string;
    title: string;
    summary?: string;
    estimatedMinutes?: number;
    subtopics: { id: string; title: string; definition?: string }[];
  }[];
}[];

export type ApprovedSubtopicContent = {
  categoryId: string;
  topicId: string;
  subtopicId: string;
  content: LearningMaterial;
};

type TopicContent = {
  topic: LearningMaterial;
  subtopics: Record<string, LearningMaterial>;
};

export type LegacyLearningContent = Record<string, TopicContent>;

const emptyMaterial: LearningMaterial = {
  explanation: [],
  examples: [],
  keyPoints: [],
  commonMistakes: [],
  practiceQuestions: [],
  interviewQuestions: [],
};

function combineMaterials(materials: LearningMaterial[]): LearningMaterial {
  return {
    explanation: materials.flatMap((material) => material.explanation),
    examples: materials.flatMap((material) => material.examples),
    keyPoints: materials.flatMap((material) => material.keyPoints),
    commonMistakes: materials.flatMap((material) => material.commonMistakes),
    practiceQuestions: materials.flatMap((material) => material.practiceQuestions),
    interviewQuestions: materials.flatMap((material) => material.interviewQuestions),
  };
}

export function buildLearningCategories(
  taxonomy: LearningPathTaxonomy,
  legacyContent: LegacyLearningContent,
  approvedContent: ApprovedSubtopicContent[],
): Category[] {
  const approvedByPath = new Map(
    approvedContent.map((entry) => [
      `${entry.categoryId}:${entry.topicId}:${entry.subtopicId}`,
      entry,
    ]),
  );

  return taxonomy.map((category) => ({
    id: category.id,
    title: category.title,
    description: category.description,
    accent: category.accent,
    topics: category.topics.map((topic): Topic => {
        const topicContent = legacyContent[topic.id];
        const subtopics = topic.subtopics.map((subtopic) => {
            const approvedEntry = approvedByPath.get(
            `${category.id}:${topic.id}:${subtopic.id}`,
            );
            const material = approvedEntry?.content ??
              (subtopic.definition
                ? { ...emptyMaterial, explanation: [subtopic.definition] }
                : topicContent?.subtopics[subtopic.id]) ??
              emptyMaterial;
            return {
              id: subtopic.id,
              title: subtopic.title,
              ...(subtopic.definition ? { definition: subtopic.definition } : {}),
              ...material,
            };
          });
        const importedTopicContent = approvedContent
          .filter((entry) => entry.categoryId === category.id && entry.topicId === topic.id)
          .map((entry) => {
            const subtopicTitle =
              topic.subtopics.find((item) => item.id === entry.subtopicId)?.title ??
              entry.subtopicId;
            return {
              ...entry.content,
              examples: entry.content.examples.map((example) => ({
                ...example,
                title: `${subtopicTitle} · ${example.title}`,
              })),
            };
          });

        return {
          id: topic.id,
          title: topic.title,
          summary: topic.summary ?? '',
          estimatedMinutes: topic.estimatedMinutes ?? 0,
          ...(importedTopicContent.length > 0
            ? combineMaterials(importedTopicContent)
            : topicContent?.topic ?? emptyMaterial),
          subtopics,
        };
      }),
  }));
}
