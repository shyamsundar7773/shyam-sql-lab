export type SqlExample = {
  title: string;
  explanation: string;
  code: string;
};

export type LearningMaterial = {
  explanation: string[];
  examples: SqlExample[];
  keyPoints: string[];
  commonMistakes: string[];
  practiceQuestions: string[];
  interviewQuestions: string[];
};

export type Subtopic = LearningMaterial & {
  id: string;
  title: string;
};

export type Topic = LearningMaterial & {
  id: string;
  title: string;
  summary: string;
  estimatedMinutes: number;
  subtopics: Subtopic[];
};

export type Module = {
  id: string;
  title: string;
  description: string;
  topics: Topic[];
};

export type Category = {
  id: string;
  title: string;
  description: string;
  accent: 'blue' | 'cyan' | 'green' | 'violet';
  modules: Module[];
};
