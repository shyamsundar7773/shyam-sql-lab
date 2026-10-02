import type { Topic } from '@/types/learning-content';
import type { TopicLesson } from '@/types/learning-chat';

export function createTopicLesson(topic: Topic): TopicLesson {
  return {
    title: topic.title,
    summary: topic.summary,
    explanation: topic.explanation,
    examples: topic.examples,
    keyPoints: topic.keyPoints,
    commonMistakes: topic.commonMistakes,
    practiceQuestions: topic.practiceQuestions,
    interviewQuestions: topic.interviewQuestions,
    subtopics: topic.subtopics,
  };
}
