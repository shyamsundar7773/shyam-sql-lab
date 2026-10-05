import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clientEnv } from '@/config/env';
import {
  askTopicQuestion,
  generatePracticeQuestions,
  type PracticeGenerationOptions,
} from '@/lib/api';

test('SQL practice sends the exact canonical path and generation settings', async () => {
  const previousApiUrl = clientEnv.apiUrl;
  const previousFetch = globalThis.fetch;
  const requests: Record<string, unknown>[] = [];
  clientEnv.apiUrl = 'https://practice-api.test';
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ questions: [] }), { status: 200 });
  };

  const selections: PracticeGenerationOptions[] = [
    {
      accessToken: 'test-token',
      categoryId: 'sql-foundations',
      topicId: 'select-statements',
      subtopicId: 'selecting-columns',
      category: 'SQL Foundations',
      topic: 'SELECT Statements',
      subtopic: 'Selecting Columns',
      difficulty: 'Beginner',
      questionType: 'SELECT',
      count: 3,
      learningContext: 'Canonical selecting-columns lesson context.',
    },
    {
      accessToken: 'test-token',
      categoryId: 'data-querying',
      topicId: 'aggregations',
      subtopicId: 'group-by-basics',
      category: 'Data Querying',
      topic: 'Aggregations',
      subtopic: 'GROUP BY Basics',
      difficulty: 'Advanced',
      questionType: 'GROUP BY',
      count: 2,
      learningContext: 'Canonical group-by-basics lesson context.',
    },
  ];

  try {
    for (const selection of selections) {
      await generatePracticeQuestions(selection);
    }
    assert.deepEqual(requests, selections.map((selection) => ({
      categoryId: selection.categoryId,
      topicId: selection.topicId,
      subtopicId: selection.subtopicId,
      category: selection.category,
      topic: selection.topic,
      subtopic: selection.subtopic,
      difficulty: selection.difficulty,
      questionType: selection.questionType,
      count: selection.count,
      learningContext: selection.learningContext,
    })));

    await assert.rejects(
      () => generatePracticeQuestions({
        ...selections[0],
        topicId: 'aggregations',
        subtopicId: 'group-by-basics',
      }),
      /valid canonical Category, Topic, and Subtopic/,
    );
    assert.equal(requests.length, 2);
  } finally {
    globalThis.fetch = previousFetch;
    clientEnv.apiUrl = previousApiUrl;
  }
});

test('Topic Chat request preserves its selected canonical subtopic ID', async () => {
  const previousApiUrl = clientEnv.apiUrl;
  const previousFetch = globalThis.fetch;
  const requestBodies: Record<string, unknown>[] = [];
  clientEnv.apiUrl = 'https://chat-api.test';
  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({ reply: 'Here is the explanation.', mode: 'ai' }), {
      status: 200,
    });
  };

  try {
    await askTopicQuestion({
      accessToken: 'test-token',
      categoryId: 'data-querying',
      topicId: 'aggregations',
      subtopicId: 'group-by-basics',
      category: 'Data Querying',
      topic: 'Aggregations',
      officialContent: '{"canonicalPath":{"subtopicId":"group-by-basics"}}',
      history: [],
      question: 'How does GROUP BY work?',
    });
    assert.equal(requestBodies[0]?.categoryId, 'data-querying');
    assert.equal(requestBodies[0]?.topicId, 'aggregations');
    assert.equal(requestBodies[0]?.subtopicId, 'group-by-basics');
    assert.equal(requestBodies[0]?.question, 'How does GROUP BY work?');

    await assert.rejects(
      () => askTopicQuestion({
        accessToken: 'test-token',
        categoryId: 'sql-foundations',
        topicId: 'aggregations',
        subtopicId: 'group-by-basics',
        category: 'SQL Foundations',
        topic: 'Aggregations',
        officialContent: '{}',
        history: [],
        question: 'Invalid path',
      }),
      /valid canonical Category, Topic, and Subtopic/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    clientEnv.apiUrl = previousApiUrl;
  }
});

test('legacy Module-based server validation is reported as a deployment contract mismatch', async () => {
  const previousApiUrl = clientEnv.apiUrl;
  const previousFetch = globalThis.fetch;
  clientEnv.apiUrl = 'https://legacy-api.test';
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const error = url.endsWith('/api/learning-chat')
      ? 'The topic, lesson, history, and questions are required.'
      : 'Provide a valid category, module, topic, subtopic, difficulty, question type, and a count from 1 to 10.';
    return new Response(JSON.stringify({ error }), { status: 400 });
  };

  try {
    await assert.rejects(
      () => generatePracticeQuestions({
        accessToken: 'test-token',
        categoryId: 'sql-foundations',
        topicId: 'select-statements',
        subtopicId: 'selecting-columns',
        category: 'SQL Foundations',
        topic: 'SELECT Statements',
        subtopic: 'Selecting Columns',
        difficulty: 'Beginner',
        questionType: 'SELECT',
        count: 3,
        learningContext: 'Canonical lesson context.',
      }),
      /legacy Module-based request/,
    );

    await assert.rejects(
      () => askTopicQuestion({
        accessToken: 'test-token',
        categoryId: 'sql-foundations',
        topicId: 'select-statements',
        subtopicId: 'selecting-columns',
        category: 'SQL Foundations',
        topic: 'SELECT Statements',
        officialContent: '{"title":"Selecting Columns"}',
        history: [],
        question: 'hi',
      }),
      /deployed request contract is likely outdated/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    clientEnv.apiUrl = previousApiUrl;
  }
});
