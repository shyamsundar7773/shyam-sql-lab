import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  parseLearningCourseText,
  updateContentRegistry,
  validateLearningContentEntry,
} from './import-learning-content.mjs';

const taxonomy = JSON.parse(await readFile(
  new URL('../src/data/learningPath/taxonomy.json', import.meta.url),
  'utf8',
));
const source = await readFile(
  new URL('../src/data/learningPath/content/txt/sql-taxonomy-mirror-pilot.txt', import.meta.url),
  'utf8',
);

test('pilot course resolves all four exact Category to Topic to Subtopic paths', () => {
  const parsed = parseLearningCourseText(source, 'pilot.txt');
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.entries.length, 4);
  assert.deepEqual(parsed.entries.map(({ categoryId, topicId, subtopicId }) => [
    categoryId,
    topicId,
    subtopicId,
  ]), [
    ['sql-foundations', 'select-statements', 'selecting-columns'],
    ['sql-foundations', 'select-statements', 'filtering-rows'],
    ['data-querying', 'aggregations', 'count-data'],
    ['data-querying', 'aggregations', 'group-by-basics'],
  ]);
  assert.ok(parsed.entries.every((entry) => !('moduleId' in entry) && !('module' in entry)));
  for (const entry of parsed.entries) {
    assert.deepEqual(validateLearningContentEntry(entry, taxonomy), []);
    assert.ok(entry.content.explanation.length);
    assert.ok(entry.content.examples.length);
  }
});

test('course import rejects unknown and incorrectly-parented IDs', () => {
  const parsed = parseLearningCourseText(source, 'pilot.txt');
  const entry = parsed.entries[0];
  assert.ok(entry);
  assert.match(
    validateLearningContentEntry({ ...entry, topicId: 'aggregations' }, taxonomy)[0],
    /does not belong to CATEGORY_ID/,
  );
  assert.match(
    validateLearningContentEntry({ ...entry, subtopicId: 'count-data' }, taxonomy)[0],
    /does not belong to TOPIC_ID/,
  );
  assert.match(
    validateLearningContentEntry({ ...entry, categoryId: 'unknown-category' }, taxonomy)[0],
    /unknown CATEGORY_ID/,
  );
});

test('registry replacement only replaces the requested canonical subtopic IDs', () => {
  const parsed = parseLearningCourseText(source, 'pilot.txt');
  const oldEntry = { ...parsed.entries[0], content: { ...parsed.entries[0].content, explanation: ['old'] } };
  const result = updateContentRegistry([oldEntry], [parsed.entries[0]], true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.entries.length, 1);
  assert.deepEqual(result.entries[0].content.explanation, parsed.entries[0].content.explanation);
});

test('course parser reports missing lesson sections', () => {
  const malformed = source.replace('Interview Relevance:', 'Interview Notes:');
  const parsed = parseLearningCourseText(malformed, 'bad.txt');
  assert.ok(parsed.errors.some((error) => error.includes('required section [Interview Relevance]')));
});
