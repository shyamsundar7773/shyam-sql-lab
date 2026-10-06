import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  buildSubtopicProgressMap,
  completeAcceptedLearningPrompt,
  getSubtopicProgressKey,
  getSubtopicProgressLabels,
} from '@/lib/learning-progress';

test('missing and zero progress both display NOT YET STARTED', () => {
  assert.deepEqual(getSubtopicProgressLabels(undefined), {
    status: 'NOT YET STARTED',
    count: '',
  });
  assert.deepEqual(getSubtopicProgressLabels(0), {
    status: 'NOT YET STARTED',
    count: '',
  });
});

test('follow-up status handles singular and plural counts', () => {
  assert.deepEqual(getSubtopicProgressLabels(1), {
    status: 'PROGRESS',
    count: '1 FOLLOW-UP',
  });
  assert.deepEqual(getSubtopicProgressLabels(2), {
    status: 'PROGRESS',
    count: '2 FOLLOW-UPS',
  });
  assert.deepEqual(getSubtopicProgressLabels(3), {
    status: 'PROGRESS',
    count: '3 FOLLOW-UPS',
  });
});

test('progress identity includes user, category, topic, and subtopic IDs', () => {
  const identity = {
    userId: 'user-1',
    categoryId: 'sql-database-fundamentals',
    topicId: 'what-is-sql',
    subtopicId: 'introduction-to-sql',
  };
  const key = getSubtopicProgressKey(identity);
  assert.notEqual(key, getSubtopicProgressKey({ ...identity, userId: 'user-2' }));
  assert.notEqual(key, getSubtopicProgressKey({ ...identity, categoryId: 'other-category' }));
  assert.notEqual(key, getSubtopicProgressKey({ ...identity, topicId: 'other-topic' }));
  assert.notEqual(key, getSubtopicProgressKey({ ...identity, subtopicId: 'other-subtopic' }));
});

test('database rows map to progress using the full canonical path', () => {
  const map = buildSubtopicProgressMap('user-1', [
    {
      category_id: 'sql-database-fundamentals',
      topic_id: 'what-is-sql',
      subtopic_id: 'introduction-to-sql',
      follow_up_count: 3,
    },
    {
      category_id: 'sql-database-fundamentals',
      topic_id: 'what-is-a-database',
      subtopic_id: 'introduction-to-sql',
      follow_up_count: 1,
    },
  ]);
  assert.equal(map[getSubtopicProgressKey({
    userId: 'user-1',
    categoryId: 'sql-database-fundamentals',
    topicId: 'what-is-sql',
    subtopicId: 'introduction-to-sql',
  })], 3);
  assert.equal(map[getSubtopicProgressKey({
    userId: 'user-1',
    categoryId: 'sql-database-fundamentals',
    topicId: 'what-is-a-database',
    subtopicId: 'introduction-to-sql',
  })], 1);
});

test('failed AI requests do not increment progress', async () => {
  let incrementCalls = 0;
  await assert.rejects(
    completeAcceptedLearningPrompt(
      async () => {
        throw new Error('AI request failed');
      },
      async () => {
        incrementCalls += 1;
        return incrementCalls;
      },
    ),
    /AI request failed/,
  );
  assert.equal(incrementCalls, 0);
});

test('one successful prompt records one progress increment after its AI response', async () => {
  const order: string[] = [];
  const result = await completeAcceptedLearningPrompt(
    async () => {
      order.push('ai');
      return 'reply';
    },
    async () => {
      order.push('progress');
      return 1;
    },
  );
  assert.deepEqual(result, { response: 'reply', followUpCount: 1 });
  assert.deepEqual(order, ['ai', 'progress']);
});

test('each subsequent successful prompt adds exactly one follow-up', async () => {
  let count = 0;
  const counts: number[] = [];
  for (const prompt of ['Hi', 'Give me an example', 'Ask me an interview question']) {
    const result = await completeAcceptedLearningPrompt(
      async () => `Accepted: ${prompt}`,
      async () => {
        count += 1;
        return count;
      },
    );
    counts.push(result.followUpCount);
  }
  assert.deepEqual(counts, [1, 2, 3]);
});

test('progress migration enforces full-path uniqueness and idempotent atomic increments', () => {
  const migration = readFileSync(
    new URL('../../supabase/migrations/20261006120000_learning_subtopic_progress.sql', import.meta.url),
    'utf8',
  );
  assert.match(
    migration,
    /unique\s*\(user_id,\s*category_id,\s*topic_id,\s*subtopic_id\)/i,
  );
  assert.match(migration, /user_message_id uuid primary key/i);
  assert.match(migration, /on conflict\s*\(user_message_id\)\s*do nothing/i);
  assert.match(
    migration,
    /follow_up_count\s*=\s*public\.learning_subtopic_progress\.follow_up_count\s*\+\s*1/i,
  );
  assert.match(migration, /conversation\.user_id\s*=\s*v_user_id/i);
  assert.match(migration, /message\.role\s*=\s*'user'/i);
});
