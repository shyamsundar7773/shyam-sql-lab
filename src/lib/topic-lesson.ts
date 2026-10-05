import type { Subtopic, Topic } from '@/types/learning-content';
import type { TopicLesson } from '@/types/learning-chat';

export function createTopicLesson(topic: Topic, selectedSubtopic?: Subtopic): TopicLesson {
  if (selectedSubtopic) {
    return {
      title: selectedSubtopic.title,
      summary: topic.summary,
      explanation: selectedSubtopic.explanation,
      examples: selectedSubtopic.examples,
      keyPoints: selectedSubtopic.keyPoints,
      commonMistakes: selectedSubtopic.commonMistakes,
      practiceQuestions: selectedSubtopic.practiceQuestions,
      interviewQuestions: selectedSubtopic.interviewQuestions,
      subtopics: [selectedSubtopic],
    };
  }

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
