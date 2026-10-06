import type { Subtopic, Topic } from '@/types/learning-content';
import type { TopicLesson } from '@/types/learning-chat';

export function createTopicLesson(topic: Topic, selectedSubtopic: Subtopic): TopicLesson {
  const initialDefinition = selectedSubtopic.definition ?? selectedSubtopic.explanation[0];
  return {
    title: selectedSubtopic.lessonTitle ?? selectedSubtopic.title,
    summary: selectedSubtopic.definition ? '' : initialDefinition ?? topic.summary,
    explanation: selectedSubtopic.definition
      ? [selectedSubtopic.definition]
      : selectedSubtopic.explanation,
    examples: selectedSubtopic.examples,
    keyPoints: selectedSubtopic.keyPoints,
    commonMistakes: selectedSubtopic.commonMistakes,
    practiceQuestions: selectedSubtopic.practiceQuestions,
    interviewQuestions: selectedSubtopic.interviewQuestions,
  };
}
