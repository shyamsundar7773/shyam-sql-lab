import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { clientEnv } from '@/config/env';
import { askPracticeEvaluator, runPracticeSql } from '@/lib/api';
import { includeLegacyPracticeTables } from '@/lib/my-practiced-sql';
import type { PracticeQuestionContent } from '@/types/sql-practice';

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

test('Add SQL sends the pasted exercise text and uses the backend-resolved question for evaluation', async () => {
  const previousApiUrl = clientEnv.apiUrl;
  const previousFetch = globalThis.fetch;
  const source = `Find completed orders for customers in New York.

\`customers\`
| customer_id | customer_name | city |
| --- | --- | --- |
| 1 | Ava Smith | New York |
| 2 | Ben Ray | Boston |

\`orders\`
| order_id | customer_id | status |
| --- | --- | --- |
| 101 | 1 | completed |
| 102 | 1 | pending |
| 103 | 2 | completed |`;
  const sql = "SELECT customers.customer_name, orders.order_id FROM customers JOIN orders ON orders.customer_id = customers.customer_id WHERE customers.city = 'New York' AND orders.status = 'completed'";
  const resolvedQuestion: PracticeQuestionContent = {
    title: 'Pasted SQL exercise',
    prompt: source,
    explanation: 'Parsed from the complete exercise text.',
    concepts: [],
    tables: [
      {
        name: 'customers',
        columns: [
          { name: 'customer_id', type: 'INTEGER' },
          { name: 'customer_name', type: 'TEXT' },
          { name: 'city', type: 'TEXT' },
        ],
        rows: [
          { customer_id: 1, customer_name: 'Ava Smith', city: 'New York' },
          { customer_id: 2, customer_name: 'Ben Ray', city: 'Boston' },
        ],
      },
      {
        name: 'orders',
        columns: [
          { name: 'order_id', type: 'INTEGER' },
          { name: 'customer_id', type: 'INTEGER' },
          { name: 'status', type: 'TEXT' },
        ],
        rows: [
          { order_id: 101, customer_id: 1, status: 'completed' },
          { order_id: 102, customer_id: 1, status: 'pending' },
          { order_id: 103, customer_id: 2, status: 'completed' },
        ],
      },
    ],
  };
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  clientEnv.apiUrl = 'https://practice-api.test';
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push({ url, body });
    return new Response(JSON.stringify(url.endsWith('/api/practice/execute')
      ? {
          ok: true,
          columns: ['customer_name', 'order_id'],
          rows: [{ customer_name: 'Ava Smith', order_id: 101 }],
          rowLimit: 200,
          truncated: false,
          resolvedQuestion,
        }
      : { reply: 'The query is evaluated.' }), { status: 200 });
  };

  try {
    const result = await runPracticeSql('test-token', source, sql);
    assert.deepEqual(result.resolvedQuestion, resolvedQuestion);
    const evaluationQuestion = result.resolvedQuestion;
    assert.ok(evaluationQuestion);
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
      question: evaluationQuestion,
      draftSql: sql,
      execution: {
        status: 'succeeded',
        sql,
        attemptId: 'pasted:attempt-1',
        result: {
          ok: result.ok,
          columns: result.columns,
          rows: result.rows,
          rowLimit: result.rowLimit,
          truncated: result.truncated,
        },
      },
      history: [],
      message: 'Evaluate the query.',
    });
    assert.deepEqual(requests[0].body, { exerciseText: source, sql });
    assert.deepEqual((requests[1].body.question as PracticeQuestionContent).tables, resolvedQuestion.tables);
    assert.equal(
      (requests[1].body.execution as { result: Record<string, unknown> }).result.resolvedQuestion,
      undefined,
    );
  } finally {
    globalThis.fetch = previousFetch;
    clientEnv.apiUrl = previousApiUrl;
  }
});

test('Add SQL screen has only question, SQL, and Run SQL controls', () => {
  const workspace = readFileSync(
    new URL('../components/my-practiced-notes/MyPracticedNotesWorkspace.tsx', import.meta.url),
    'utf8',
  );
  const start = workspace.indexOf('{note.sqlBlocks.map');
  const end = workspace.indexOf('{note.sqlBlocks.map', start + 1);
  const editor = workspace.slice(start, end < 0 ? undefined : end);
  assert.match(editor, /QUESTION \/ REQUIREMENT/);
  assert.match(editor, /SQL QUERY/);
  assert.match(editor, /▶ Run SQL/);
  assert.doesNotMatch(editor, /EXERCISE SCHEMA \(JSON\)/i);
  assert.doesNotMatch(editor, /schemaJson/i);
  assert.doesNotMatch(editor, /Schema JSON|schema textarea|TextInput[^]*?schema/i);
  const route = readFileSync(
    new URL('../app/my-practiced-notes/editor.tsx', import.meta.url),
    'utf8',
  );
  assert.match(route, /MyPracticedNotesWorkspace/);
});

test('legacy saved schema is converted to safe setup text without sending a schema field', async () => {
  const previousApiUrl = clientEnv.apiUrl;
  const previousFetch = globalThis.fetch;
  const exerciseText = includeLegacyPracticeTables('Add the sample customer.', JSON.stringify([{
    name: 'customers',
    columns: [{ name: 'customer_id', type: 'INTEGER' }, { name: 'customer_name', type: 'TEXT' }],
    rows: [{ customer_id: 1, customer_name: "O'Neil, Ada" }],
  }]));
  let body: Record<string, unknown> | undefined;
  clientEnv.apiUrl = 'https://practice-api.test';
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({
      ok: true,
      columns: [],
      rows: [],
      rowLimit: 200,
      truncated: false,
      resolvedQuestion: {
        title: 'Pasted SQL exercise',
        prompt: exerciseText,
        explanation: 'Parsed from the complete exercise text.',
        concepts: [],
        tables: [{
          name: 'customers',
          columns: [{ name: 'customer_id', type: 'INTEGER' }, { name: 'customer_name', type: 'TEXT' }],
          rows: [{ customer_id: 1, customer_name: "O'Neil, Ada" }],
        }],
      },
    }), { status: 200 });
  };
  try {
    await runPracticeSql('test-token', exerciseText, 'SELECT * FROM customers');
    assert.deepEqual(body, { exerciseText, sql: 'SELECT * FROM customers' });
    assert.match(exerciseText, /CREATE TABLE customers/);
    assert.match(exerciseText, /'O''Neil, Ada'/);
  } finally {
    globalThis.fetch = previousFetch;
    clientEnv.apiUrl = previousApiUrl;
  }
});
