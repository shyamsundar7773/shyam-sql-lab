import type { Topic } from '@/types/learning-content';

export type LearningChatRole = 'assistant' | 'user';

export type RuntimeSequenceItem = {
  id: string;
  title: string;
  items?: RuntimeSequenceItem[];
};

export type RuntimeTeachingCompletion = 'not-started' | 'incomplete' | 'complete';

export type TopicChatRuntimeState = {
  categoryId: string;
  topicId: string;
  subtopicId: string;
  sequence: RuntimeSequenceItem[];
  currentPath: number[] | null;
  completion: RuntimeTeachingCompletion;
  responseIncomplete: boolean;
  sequenceFinished?: boolean;
  latestIntent: TopicChatIntent;
};

export type TopicChatIntent =
  | 'sequence-generation'
  | 'explicit-runtime-item-selection'
  | 'continue-runtime-item'
  | 'ordinary-topic-question';

export type TopicLessonProgress = {
  sectionIndex: number;
  sectionTitle: string;
  focusIndex: number | null;
  focusTitle: string | null;
  sectionComplete: boolean;
  hasNextSection: boolean;
  nextSectionTitle: string | null;
  nextFocusTitle: string | null;
};

export type TopicLesson = Pick<
  Topic,
  | 'title'
  | 'summary'
  | 'explanation'
  | 'examples'
  | 'keyPoints'
  | 'commonMistakes'
  | 'practiceQuestions'
  | 'interviewQuestions'
>;

export type LearningConversation = {
  id: string;
  user_id: string;
  category_id: string;
  module_id: string | null;
  topic_id: string;
  subtopic_id: string;
  lesson_content: TopicLesson;
  created_at: string;
  updated_at: string;
};

export type LearningChatMessage = {
  id: string;
  conversation_id: string;
  role: LearningChatRole;
  content: string;
  created_at: string;
};
