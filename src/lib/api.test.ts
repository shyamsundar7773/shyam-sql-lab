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
    return new Response(JSON.stringify({
      reply: 'Here is the explanation.',
      mode: 'ai',
      incomplete: false,
    }), {
      status: 200,
    });
  };

  try {
    const normalResponse = await askTopicQuestion({
      accessToken: 'test-token',
      categoryId: 'data-querying',
      topicId: 'aggregations',
      subtopicId: 'group-by-basics',
      savedLearningNotes: [],
      history: [
        { role: 'user', content: 'What is a group?' },
        { role: 'assistant', content: 'A group contains rows with matching values.' },
      ],
      question: 'How does GROUP BY work?',
    });
    assert.deepEqual(normalResponse, {
      reply: 'Here is the explanation.',
      mode: 'ai',
      incomplete: false,
    });
    await askTopicQuestion({
      accessToken: 'test-token',
      categoryId: 'sql-database-fundamentals',
      topicId: 'what-is-sql',
      subtopicId: 'introduction-to-sql',
      savedLearningNotes: [],
      history: [],
      question: 'What does SQL do?',
    });
    assert.equal(requestBodies[0]?.categoryId, 'data-querying');
    assert.equal(requestBodies[0]?.topicId, 'aggregations');
    assert.equal(requestBodies[0]?.subtopicId, 'group-by-basics');
    assert.equal(requestBodies[0]?.question, 'How does GROUP BY work?');
    assert.deepEqual(requestBodies[0]?.history, [
      { role: 'user', content: 'What is a group?' },
      { role: 'assistant', content: 'A group contains rows with matching values.' },
    ]);
    assert.equal('moduleId' in requestBodies[0], false);
    assert.equal('officialContent' in requestBodies[0], false);
    assert.equal('category' in requestBodies[0], false);
    assert.deepEqual(
      [
        requestBodies[1]?.categoryId,
        requestBodies[1]?.topicId,
        requestBodies[1]?.subtopicId,
      ],
      ['sql-database-fundamentals', 'what-is-sql', 'introduction-to-sql'],
    );
    assert.equal(requestBodies[1]?.question, 'What does SQL do?');

    await assert.rejects(
      () => askTopicQuestion({
        accessToken: 'test-token',
        categoryId: 'sql-foundations',
        topicId: 'aggregations',
        subtopicId: 'group-by-basics',
        savedLearningNotes: [],
        history: [],
        question: 'Invalid path',
      }),
      /valid canonical Category, Topic, and Subtopic/,
    );
    assert.equal(requestBodies.length, 2);
  } finally {
    globalThis.fetch = previousFetch;
    clientEnv.apiUrl = previousApiUrl;
  }
});

test('Topic Chat preserves long response text and provider truncation metadata', async () => {
  const previousApiUrl = clientEnv.apiUrl;
  const previousFetch = globalThis.fetch;
  const reply = `${'The result contains the requested daily counts. '.repeat(160)}\n\n*This response reached the output limit and may be incomplete. Ask me to continue from where I stopped.*`;
  clientEnv.apiUrl = 'https://chat-api.test';
  globalThis.fetch = async () => new Response(JSON.stringify({
    reply,
    mode: 'ai',
    incomplete: true,
  }), { status: 200 });

  try {
    const result = await askTopicQuestion({
      accessToken: 'test-token',
      categoryId: 'sql-foundations',
      topicId: 'select-statements',
      subtopicId: 'selecting-columns',
      savedLearningNotes: [],
      history: [],
      question: 'Explain the result in detail.',
    });
    assert.deepEqual(result, { reply, mode: 'ai', incomplete: true });
    assert.ok(result.reply.length > 4_000);
  } finally {
    globalThis.fetch = previousFetch;
    clientEnv.apiUrl = previousApiUrl;
  }
});

test('outdated Topic Chat contract is distinct from canonical curriculum validation errors', async () => {
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
        categoryId: 'sql-database-fundamentals',
        topicId: 'what-is-sql',
        subtopicId: 'introduction-to-sql',
        savedLearningNotes: [],
        history: [],
        question: 'hi',
      }),
      /endpoint or deployed request contract is outdated/,
    );

    globalThis.fetch = async () => new Response(JSON.stringify({
      code: 'INVALID_CURRICULUM_PATH',
      error: 'The selected categoryId, topicId, and subtopicId do not resolve to one canonical curriculum path.',
    }), { status: 400 });
    await assert.rejects(
      () => askTopicQuestion({
        accessToken: 'test-token',
        categoryId: 'sql-database-fundamentals',
        topicId: 'what-is-sql',
        subtopicId: 'introduction-to-sql',
        savedLearningNotes: [],
        history: [],
        question: 'Explain this topic.',
      }),
      /do not resolve to one canonical curriculum path/,
    );
  } finally {
    globalThis.fetch = previousFetch;
    clientEnv.apiUrl = previousApiUrl;
  }
});
