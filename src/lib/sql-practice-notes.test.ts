import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildPracticeAttemptReviewPrompt,
  filterPracticedSets,
  getPracticeEvaluatorBackRoute,
  getPracticeEvaluatorExecution,
  getPracticeEvaluatorLegacyRequestContext,
  getPracticeEvaluatorRequestHistory,
  getPracticeEvaluatorRoute,
  getPracticeLearningContext,
  getPracticeQuestionReview,
  getPendingPracticeEvaluatorUserMessage,
  getQuestionIndex,
  updatePracticeQuestionDraft,
} from './sql-practice-notes';

const sets = [
  { config: { categoryId: 'sql', topicId: 'joins', subtopicId: 'keys' }, id: 'join-one' },
  { config: { categoryId: 'sql', topicId: 'aggregate', subtopicId: 'count' }, id: 'aggregate-one' },
  { config: { categoryId: 'other', topicId: 'joins', subtopicId: 'keys' }, id: 'other-joins' },
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
  assert.deepEqual(filterPracticedSets(sets, 'sql', 'all', 'count').map((set) => set.id), [
    'aggregate-one',
  ]);
});

test('practice evaluator context resolves saved path IDs to their learning labels', () => {
  assert.deepEqual(
    getPracticeLearningContext({
      categoryId: 'sql-foundations',
      topicId: 'select-statements',
      subtopicId: 'selecting-columns',
    }),
    {
      category: 'SQL Foundations',
      topic: 'SELECT Statements',
      subtopic: 'Selecting Columns',
      categoryId: 'sql-foundations',
      topicId: 'select-statements',
      subtopicId: 'selecting-columns',
    },
  );
  assert.deepEqual(
    getPracticeLearningContext({
      categoryId: 'data-querying',
      topicId: 'aggregations',
      subtopicId: 'group-by-basics',
    }),
    {
      category: 'Data Querying',
      topic: 'Aggregations',
      subtopic: 'GROUP BY Basics',
      categoryId: 'data-querying',
      topicId: 'aggregations',
      subtopicId: 'group-by-basics',
    },
  );
});

test('practice attempt review prompt includes the exact SQL submitted for evaluation', () => {
  const prompt = buildPracticeAttemptReviewPrompt('SELECT 3', 2);

  assert.match(prompt, /Attempt 2/);
  assert.match(prompt, /new, independent submission/);
  assert.match(prompt, /Do not reuse SQL, results, or conclusions from earlier attempts/);
  assert.match(prompt, /```sql\nSELECT 3\n```/);
  assert.match(prompt, /execution result/);
});

test('evaluator request history obeys the API per-message and message-count limits', () => {
  const messages = [
    ...Array.from({ length: 21 }, (_, index) => ({
      id: `message-${index}`,
      question_id: 'question-a',
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `message ${index}`,
      created_at: `2026-10-01T10:${String(index).padStart(2, '0')}:00Z`,
    })),
    {
      id: 'long-message',
      question_id: 'question-a',
      role: 'assistant' as const,
      content: 'x'.repeat(5_408),
      created_at: '2026-10-01T11:00:00Z',
    },
  ];

  const history = getPracticeEvaluatorRequestHistory(messages);

  assert.equal(history.length, 20);
  assert.equal(history.at(-1)?.content.length, 4_000);
  assert.equal(history.at(-1)?.content, 'x'.repeat(4_000));
});

test('legacy evaluator request context contains only a real executed attempt', () => {
  assert.deepEqual(
    getPracticeEvaluatorLegacyRequestContext({ status: 'not_executed' }),
    {},
    'an unexecuted draft must not be represented as a submitted result',
  );
  assert.deepEqual(
    getPracticeEvaluatorLegacyRequestContext({
      status: 'succeeded',
      sql: 'SELECT name FROM customers',
      result: { ok: true, columns: ['name'], rows: [{ name: 'Mina' }] },
      attemptId: 'attempt-a',
    }),
    {
      sql: 'SELECT name FROM customers',
      result: { ok: true, columns: ['name'], rows: [{ name: 'Mina' }] },
    },
  );
  assert.deepEqual(
    getPracticeEvaluatorLegacyRequestContext({
      status: 'failed',
      sql: 'SELECT missing FROM customers',
      result: { ok: false, columns: [], rows: [], error: 'no such column: missing' },
      attemptId: 'attempt-b',
    }),
    {
      sql: 'SELECT missing FROM customers',
      result: { ok: false, columns: [], rows: [], error: 'no such column: missing' },
    },
  );
});

test('retrying an unsent follow-up reuses its existing question-scoped user message', () => {
  const pending = {
    id: 'pending-user',
    question_id: 'question-a',
    role: 'user' as const,
    content: 'RUNTIME_EVALUATOR_FOLLOWUP_AUTOSAVE_2026',
    created_at: '2026-10-01T11:00:00Z',
  };
  assert.equal(
    getPendingPracticeEvaluatorUserMessage([pending], pending.content),
    pending,
  );
  assert.equal(
    getPendingPracticeEvaluatorUserMessage(
      [pending, { ...pending, id: 'assistant', role: 'assistant' }],
      pending.content,
    ),
    null,
    'a follow-up with an assistant response is a new message, not a retry',
  );
});

test('evaluator route preserves exact set and question identity and restores the question on back', () => {
  const execution = getPracticeEvaluatorExecution(
    'question-a',
    'SELECT 1',
    {
      id: 'attempt-a',
      question_id: 'question-a',
      sql: 'SELECT 1',
      execution_result: { ok: true, columns: ['value'], rows: [{ value: 1 }] },
      created_at: '2026-10-01T10:00:00Z',
    },
  );
  assert.deepEqual(getPracticeEvaluatorRoute('set-7', 'question-a', execution), {
    pathname: '/sql-practice-evaluator',
    params: { setId: 'set-7', questionId: 'question-a', attemptId: 'attempt-a' },
  });
  assert.deepEqual(getPracticeEvaluatorBackRoute('set-7', 'question-a'), {
    pathname: '/sql-practice',
    params: { restoreSetId: 'set-7', restoreQuestionId: 'question-a' },
  });
});

test('evaluator state distinguishes empty, draft, successful, incorrect, and failed execution', () => {
  assert.deepEqual(
    getPracticeEvaluatorExecution('question-a', '', null),
    { status: 'not_executed' },
  );
  assert.deepEqual(
    getPracticeEvaluatorExecution('question-a', 'SELECT 1', null),
    { status: 'not_executed' },
  );
  const oldQuestionAttempt = {
    id: 'attempt-a',
    question_id: 'question-a',
    sql: 'SELECT 1',
    execution_result: { ok: true, columns: ['value'], rows: [{ value: 1 }] },
    created_at: '2026-10-01T10:00:00Z',
  };
  assert.deepEqual(
    getPracticeEvaluatorExecution('question-a', 'SELECT 2', oldQuestionAttempt),
    { status: 'not_executed' },
    'a changed draft must not inherit the previous execution',
  );
  assert.deepEqual(
    getPracticeEvaluatorExecution('question-b', 'SELECT 1', oldQuestionAttempt),
    { status: 'not_executed' },
    'another question must not inherit this question’s execution',
  );
  assert.equal(
    getPracticeEvaluatorExecution('question-a', 'SELECT 1', oldQuestionAttempt).status,
    'succeeded',
  );
  assert.equal(
    getPracticeEvaluatorExecution('question-a', 'SELECT 1', {
      ...oldQuestionAttempt,
      execution_result: { ok: true, columns: ['value'], rows: [{ value: 0 }] },
    }).status,
    'succeeded',
    'a successful but incorrect result remains real execution context for evaluation',
  );
  assert.deepEqual(
    getPracticeEvaluatorExecution('question-a', 'SELECT broken', {
      ...oldQuestionAttempt,
      sql: 'SELECT broken',
      execution_result: { ok: false, columns: [], rows: [], error: 'no such column: broken' },
    }),
    {
      status: 'failed',
      sql: 'SELECT broken',
      result: { ok: false, columns: [], rows: [], error: 'no such column: broken' },
      attemptId: 'attempt-a',
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
    {
      id: 'question-a',
      content: { solutionSql: 'SELECT name FROM users' },
      draft_sql: 'SELECT * FROM users',
    },
    [
      {
        id: 'attempt-old',
        question_id: 'question-a',
        sql: 'SELECT name FROM users',
        execution_result: null,
        created_at: '2026-10-01T10:00:00Z',
      },
      {
        id: 'attempt-latest',
        question_id: 'question-a',
        sql: 'SELECT * FROM users',
        execution_result: null,
        created_at: '2026-10-01T11:00:00Z',
      },
      {
        id: 'attempt-other-question',
        question_id: 'question-b',
        sql: 'SELECT 2',
        execution_result: null,
        created_at: '2026-10-01T13:00:00Z',
      },
    ],
    [
      {
        id: 'assistant',
        question_id: 'question-a',
        role: 'assistant',
        content: 'Second response',
        created_at: '2026-10-01T12:00:00Z',
      },
      {
        id: 'follow-up-user',
        question_id: 'question-a',
        role: 'user',
        content: 'RUNTIME_EVALUATOR_FOLLOWUP_AUTOSAVE_2026',
        created_at: '2026-10-01T12:01:00Z',
      },
      {
        id: 'follow-up-assistant',
        question_id: 'question-a',
        role: 'assistant',
        content: 'The follow-up response',
        created_at: '2026-10-01T12:02:00Z',
      },
      {
        id: 'user',
        question_id: 'question-a',
        role: 'user',
        content: 'Why?',
        created_at: '2026-10-01T11:00:00Z',
      },
      {
        id: 'other-question',
        question_id: 'question-b',
        role: 'assistant',
        content: 'Other question response',
        created_at: '2026-10-01T13:00:00Z',
      },
    ],
  );

  assert.equal(review.correctAnswer, 'SELECT name FROM users');
  assert.equal(review.attemptedAnswer, 'SELECT * FROM users');
  assert.deepEqual(
    review.aiMessages.map((message) => message.content),
    [
      'Why?',
      'Second response',
      'RUNTIME_EVALUATOR_FOLLOWUP_AUTOSAVE_2026',
      'The follow-up response',
    ],
  );
  assert.equal(
    review.aiMessages.some((message) => message.content.includes('Other question')),
    false,
  );
  assert.equal(review.attemptedAnswer, 'SELECT * FROM users');
});
