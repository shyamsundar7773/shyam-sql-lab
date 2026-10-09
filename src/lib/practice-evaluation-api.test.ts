import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clientEnv } from '@/config/env';
import { askPracticeEvaluator, runPracticeSql } from '@/lib/api';
import type { PracticeQuestionContent } from '@/types/sql-practice';

const insertQuestion: PracticeQuestionContent = {
  title: 'Archive a user',
  prompt: 'Copy the matching user into users_archive.',
  explanation: 'Copy the matching source row.',
  concepts: ['INSERT', 'SELECT'],
  tables: [{
    name: 'users',
    columns: [
      { name: 'user_id', type: 'INTEGER' },
      { name: 'username', type: 'TEXT' },
      { name: 'email', type: 'TEXT' },
    ],
    rows: [{ user_id: 1, username: 'john_doe', email: 'john@example.com' }],
  }, {
    name: 'users_archive',
    columns: [
      { name: 'user_id', type: 'INTEGER' },
      { name: 'username', type: 'TEXT' },
      { name: 'email', type: 'TEXT' },
    ],
    rows: [],
  }],
};

const insertSql = `INSERT INTO users_archive (user_id, username, email)
SELECT user_id, username, email
FROM users
WHERE user_id = 1
  AND username = 'john_doe'
  AND email = 'john@example.com';`;

test('SQL Practice and My Practiced Notes preserve semantic evaluation and attempt context', async () => {
  const previousApiUrl = clientEnv.apiUrl;
  const previousFetch = globalThis.fetch;
  const requests: Record<string, unknown>[] = [];
  const formattedReply = [
    '**Evaluation: correct**',
    'The query matches the requested user.',
    'Actionable feedback:\n- All requested predicates are present.',
  ].join('\n\n');
  clientEnv.apiUrl = 'https://practice-api.test';
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(JSON.stringify({
      reply: formattedReply,
      evaluation: {
        correctness: 'correct',
        explanation: 'The query matches the requested user.',
        feedback: ['All requested predicates are present.'],
      },
      mode: 'ai',
    }), { status: 200 });
  };

  try {
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
      execution: {
        status: 'succeeded',
        sql: insertSql,
        attemptId: 'note-a:block-a:attempt-a',
        result: {
          ok: true,
          columns: [],
          rows: [],
          rowsAffected: 1,
        },
      },
      history: [{ role: 'user', content: 'Evaluate this submission.' }],
      message: 'Evaluate this submission.',
    });

    assert.equal(reply, formattedReply);
    assert.deepEqual(requests[0]?.execution, {
      status: 'succeeded',
      sql: insertSql,
      attemptId: 'note-a:block-a:attempt-a',
      result: {
        ok: true,
        columns: [],
        rows: [],
        rowsAffected: 1,
      },
    });
    assert.equal(requests[0]?.draftSql, insertSql);
  } finally {
    globalThis.fetch = previousFetch;
    clientEnv.apiUrl = previousApiUrl;
  }
});

test('My Practiced Notes retains INSERT SELECT execution output and affected-row count', async () => {
  const previousApiUrl = clientEnv.apiUrl;
  const previousFetch = globalThis.fetch;
  const requestBodies: Record<string, unknown>[] = [];
  clientEnv.apiUrl = 'https://practice-api.test';
  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
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
    assert.equal(requestBodies[0]?.sql, insertSql);
    assert.equal(result.rowsAffected, 1);
    assert.deepEqual(result.rows, []);
  } finally {
    globalThis.fetch = previousFetch;
    clientEnv.apiUrl = previousApiUrl;
  }
});
