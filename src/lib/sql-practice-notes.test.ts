import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  filterPracticedSets,
  getPracticeLearningContext,
  getPracticeQuestionReview,
  getQuestionIndex,
  updatePracticeQuestionDraft,
} from './sql-practice-notes';

const sets = [
  { config: { categoryId: 'sql', topicId: 'joins' }, id: 'join-one' },
  { config: { categoryId: 'sql', topicId: 'aggregate' }, id: 'aggregate-one' },
  { config: { categoryId: 'other', topicId: 'joins' }, id: 'other-joins' },
];

test('practiced-note filters support all, category, topic, and combined filters', () => {
  assert.deepEqual(filterPracticedSets(sets, 'all', 'all'), sets);
  assert.deepEqual(filterPracticedSets(sets, 'sql', 'all').map((set) => set.id), [
    'join-one',
    'aggregate-one',
  ]);
  assert.deepEqual(filterPracticedSets(sets, 'all', 'joins').map((set) => set.id), [
    'join-one',
    'other-joins',
  ]);
  assert.deepEqual(filterPracticedSets(sets, 'sql', 'joins').map((set) => set.id), ['join-one']);
});

test('practice evaluator context resolves saved path IDs to their learning labels', () => {
  assert.deepEqual(
    getPracticeLearningContext({
      categoryId: 'sql-foundations',
      moduleId: 'query-basics',
      topicId: 'query-structure',
      subtopicId: 'select-list',
    }),
    {
      category: 'SQL Foundations',
      module: 'Query Basics',
      topic: 'The shape of a SQL query',
      subtopic: 'Choosing columns',
    },
  );
});

test('question navigation clamps at both ends and supports empty question lists', () => {
  assert.equal(getQuestionIndex(0, 3, -1), 0);
  assert.equal(getQuestionIndex(0, 3, 1), 1);
  assert.equal(getQuestionIndex(2, 3, 1), 2);
  assert.equal(getQuestionIndex(0, 0, 1), 0);
});

test('SQL drafts remain associated with their individual practice questions', () => {
  const currentSets = [
    {
      id: 'set-a',
      questions: [
        { id: 'question-a', draft_sql: 'SELECT 1' },
        { id: 'question-b', draft_sql: '' },
      ],
    },
    { id: 'set-b', questions: [{ id: 'question-c', draft_sql: '' }] },
  ];
  const updated = updatePracticeQuestionDraft(
    currentSets,
    'set-a',
    'question-b',
    'SELECT 2',
  );

  assert.equal(updated[0].questions[0].draft_sql, 'SELECT 1');
  assert.equal(updated[0].questions[1].draft_sql, 'SELECT 2');
  assert.equal(updated[1].questions[0].draft_sql, '');
});

test('question review uses the generated answer, latest saved attempt, and ordered AI history', () => {
  const review = getPracticeQuestionReview(
    { content: { solutionSql: 'SELECT name FROM users' }, draft_sql: 'SELECT * FROM users' },
    [
      { sql: 'SELECT name FROM users', created_at: '2026-10-01T10:00:00Z' },
      { sql: 'SELECT * FROM users', created_at: '2026-10-01T11:00:00Z' },
    ],
    [
      { id: 'assistant', role: 'assistant', content: 'Second response', created_at: '2026-10-01T12:00:00Z' },
      { id: 'user', role: 'user', content: 'Why?', created_at: '2026-10-01T11:00:00Z' },
    ],
  );

  assert.equal(review.correctAnswer, 'SELECT name FROM users');
  assert.equal(review.attemptedAnswer, 'SELECT * FROM users');
  assert.deepEqual(
    review.aiMessages.map((message) => message.content),
    ['Why?', 'Second response'],
  );
});
