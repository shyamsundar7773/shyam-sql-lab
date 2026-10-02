export const dashboardMockData = {
  currentLearning: {
    title: 'SQL Foundations',
    module: 'Module 03 · Filtering & Sorting',
    progress: 42,
    nextLesson: 'Build confidence with WHERE clauses',
  },
  stats: [
    { label: 'Learning path', value: '42%', tone: 'blue' },
    { label: 'Practice sessions', value: '08', tone: 'cyan' },
    { label: 'Projects started', value: '02', tone: 'violet' },
    { label: 'Study streak', value: '3 days', tone: 'amber' },
  ],
} as const;
