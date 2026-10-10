import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clientEnv } from '@/config/env';
import { askPracticeEvaluator, runPracticeSql } from '@/lib/api';
import {
  buildPracticeQuestionContext,
  parsePracticeTablesJson,
  practiceSchemaSetupError,
} from '@/lib/my-practiced-sql';
import type { PracticeQuestionContent } from '@/types/sql-practice';
import {
  ecommerceQuestion,
  ecommerceReportSql,
  ecommerceTables,
} from '../../tests/fixtures/my-practiced-notes-ecommerce';

const insertQuestion: PracticeQuestionContent = {
  title: 'Add a new user',
  prompt: "Write a SQL statement using INSERT INTO to add a new user to the users table with user_id = 1, username = 'john_doe', and email = 'john@example.com'.",
  explanation: 'Insert one user row with the specified ID, username, and email.',
  solutionSql: `INSERT INTO users (user_id, username, email)
VALUES (1, 'john_doe', 'john@example.com');`,
  concepts: ['INSERT INTO', 'VALUES'],
  tables: [{
    name: 'users',
    columns: [
      { name: 'user_id', type: 'INTEGER' },
      { name: 'username', type: 'TEXT' },
      { name: 'email', type: 'TEXT' },
    ],
    rows: [],
  }],
};

const insertSql = `INSERT INTO users (user_id, username, email)
VALUES (1, 'john_doe', 'john@example.com');`;

test('SQL Practice INSERT reaches execution and evaluation with the shared contract', async () => {
  const previousApiUrl = clientEnv.apiUrl;
  const previousFetch = globalThis.fetch;
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const formattedReply = [
    '**Evaluation: correct**',
    'The query inserts the requested user.',
  ].join('\n\n');
  clientEnv.apiUrl = 'https://practice-api.test';
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push({ url, body });
    if (url.endsWith('/api/practice/execute')) {
      return new Response(JSON.stringify({
        ok: true,
        columns: [],
        rows: [],
        rowsAffected: 1,
        rowLimit: 200,
        truncated: false,
      }), { status: 200 });
    }
    return new Response(JSON.stringify({
      reply: formattedReply,
      evaluation: {
        correctness: 'correct',
        explanation: 'The query inserts the requested user.',
        feedback: [],
      },
      mode: 'ai',
    }), { status: 200 });
  };

  try {
    const executionResult = await runPracticeSql('test-token', insertQuestion, insertSql);
    assert.equal(executionResult.ok, true);
    assert.equal(executionResult.rowsAffected, 1);
    const execution = {
      status: 'succeeded' as const,
      sql: insertSql,
      attemptId: 'note-a:block-a:attempt-a',
      result: executionResult,
    };
    const reply = await askPracticeEvaluator({
      accessToken: 'test-token',
      context: {
        category: 'SQL Foundations',
        topic: 'SELECT Statements',
        subtopic: 'Filtering Rows',
        categoryId: 'sql-foundations',
        topicId: 'select-statements',
        subtopicId: 'filtering-rows',
      },
      question: insertQuestion,
      draftSql: insertSql,
      execution,
      history: [{ role: 'user', content: 'Evaluate this submission.' }],
      message: 'Evaluate this submission.',
    });

    assert.equal(reply, formattedReply);
    assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
      '/api/practice/execute',
      '/api/practice/evaluate',
    ]);
    assert.deepEqual(requests[0]?.body, { question: insertQuestion, sql: insertSql });
    assert.deepEqual(requests[1]?.body.execution, execution);
    assert.equal(requests[1]?.body.draftSql, insertSql);
    assert.deepEqual(requests[1]?.body.question, insertQuestion);
  } finally {
    globalThis.fetch = previousFetch;
    clientEnv.apiUrl = previousApiUrl;
  }
});

test('My Practiced Notes uses the same execution and evaluation request contract', async () => {
  const previousApiUrl = clientEnv.apiUrl;
  const previousFetch = globalThis.fetch;
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  clientEnv.apiUrl = 'https://practice-api.test';
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({
      url,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    if (url.endsWith('/api/practice/evaluate')) {
      return new Response(JSON.stringify({ reply: 'The query is semantically evaluated.' }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({
      ok: true,
      columns: [],
      rows: [],
      rowsAffected: 1,
      rowLimit: 200,
      truncated: false,
    }), { status: 200 });
  };

  try {
    const result = await runPracticeSql('test-token', insertQuestion, insertSql);
    const execution = {
      status: 'succeeded' as const,
      sql: insertSql,
      attemptId: 'note-a:block-a:attempt-a',
      result,
    };
    await askPracticeEvaluator({
      accessToken: 'test-token',
      context: {
        category: 'SQL Foundations',
        topic: 'SELECT Statements',
        subtopic: 'Filtering Rows',
        categoryId: 'sql-foundations',
        topicId: 'select-statements',
        subtopicId: 'filtering-rows',
      },
      question: insertQuestion,
      draftSql: insertSql,
      execution,
      history: [],
      message: 'Evaluate this submission.',
    });
    assert.equal(result.rowsAffected, 1);
    assert.deepEqual(result.rows, []);
    assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
      '/api/practice/execute',
      '/api/practice/evaluate',
    ]);
    assert.deepEqual(requests[0]?.body, { question: insertQuestion, sql: insertSql });
    assert.deepEqual(requests[1]?.body.execution, execution);
  } finally {
    globalThis.fetch = previousFetch;
    clientEnv.apiUrl = previousApiUrl;
  }
});

test('Add SQL sends the authored schema unchanged to execution and semantic evaluation', async () => {
  const previousApiUrl = clientEnv.apiUrl;
  const previousFetch = globalThis.fetch;
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  clientEnv.apiUrl = 'https://practice-api.test';
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push({ url, body });
    if (url.endsWith('/api/practice/execute')) {
      return new Response(JSON.stringify({
        ok: true,
        columns: [
          'customer_id',
          'customer_name',
          'completed_order_count',
          'latest_order_date',
          'completed_spending',
          'customer_category',
        ],
        rows: [],
        rowLimit: 200,
        truncated: false,
      }), { status: 200 });
    }
    return new Response(JSON.stringify({ reply: 'The report was evaluated.' }), { status: 200 });
  };

  try {
    const tables = parsePracticeTablesJson(JSON.stringify(ecommerceTables));
    const question = buildPracticeQuestionContext(
      {
        categoryId: 'sql-foundations',
        topicId: 'select-statements',
        subtopicId: 'filtering-rows',
      },
      ecommerceQuestion.prompt,
      tables,
    );
    const result = await runPracticeSql('test-token', question, ecommerceReportSql);
    await askPracticeEvaluator({
      accessToken: 'test-token',
      context: {
        category: 'SQL Foundations',
        topic: 'SELECT Statements',
        subtopic: 'Filtering Rows',
        categoryId: 'sql-foundations',
        topicId: 'select-statements',
        subtopicId: 'filtering-rows',
      },
      question,
      draftSql: ecommerceReportSql,
      execution: {
        status: 'succeeded',
        sql: ecommerceReportSql,
        attemptId: 'note-ecommerce:sql-report:attempt-1',
        result,
      },
      history: [],
      message: 'Evaluate this report.',
    });

    assert.equal(question.prompt, ecommerceQuestion.prompt);
    assert.deepEqual(question.tables, ecommerceTables);
    assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), [
      '/api/practice/execute',
      '/api/practice/evaluate',
    ]);
    assert.deepEqual((requests[0]?.body.question as PracticeQuestionContent).tables, ecommerceTables);
    assert.deepEqual((requests[1]?.body.question as PracticeQuestionContent).tables, ecommerceTables);
    assert.deepEqual(
      (requests[1]?.body.execution as { result: { columns: string[] } }).result.columns,
      [
        'customer_id',
        'customer_name',
        'completed_order_count',
        'latest_order_date',
        'completed_spending',
        'customer_category',
      ],
    );
  } finally {
    globalThis.fetch = previousFetch;
    clientEnv.apiUrl = previousApiUrl;
  }
});

test('Add SQL rejects missing or malformed schema before making an API request', async () => {
  let requestCount = 0;
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    requestCount += 1;
    return new Response('{}', { status: 200 });
  };

  try {
    assert.throws(
      () => parsePracticeTablesJson(''),
      (error: unknown) => error instanceof Error && error.message === practiceSchemaSetupError,
    );
    assert.throws(() => parsePracticeTablesJson('{not json}'), /valid JSON/);
    assert.throws(
      () => parsePracticeTablesJson('[]'),
      (error: unknown) => error instanceof Error && error.message === practiceSchemaSetupError,
    );
    assert.equal(requestCount, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
