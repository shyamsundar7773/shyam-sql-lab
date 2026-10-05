import type { Topic } from '@/types/learning-content';

export type LearningChatRole = 'assistant' | 'user';

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
  | 'subtopics'
>;

export type LearningConversation = {
  id: string;
  user_id: string;
  category_id: string;
  module_id: string | null;
  topic_id: string;
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
