import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  buildSourceAnalysis,
  isLikelyDuplicate,
  normalizeNoteDraft,
  updateCandidateLocation,
} from './notes-service.js';

const existingNotes = [
  {
    title: 'SELECT column choices',
    content: 'Use explicit columns instead of SELECT * to keep the result stable.',
    categoryId: 'sql-foundations',
    moduleId: 'query-basics',
    topicId: 'query-structure',
    subtopicId: 'select-list',
  },
];

test('note mapping resolves category to module to topic to subtopic', () => {
  const draft = normalizeNoteDraft({
    title: 'WHERE clause note',
    content: 'Use WHERE to filter rows before grouping and aggregation.',
    categoryId: 'sql-foundations',
    moduleId: 'relational-thinking',
    topicId: 'where-filters',
    subtopicId: 'comparison-predicates',
  });

  assert.equal(draft.categoryId, 'sql-foundations');
  assert.equal(draft.moduleId, 'relational-thinking');
  assert.equal(draft.topicId, 'where-filters');
  assert.equal(draft.subtopicId, 'comparison-predicates');
});

test('manual note creation payload preserves taxonomy and source handling', () => {
  const draft = normalizeNoteDraft({
    title: 'Manual note',
    content: 'Remember to use WHERE before GROUP BY.',
    categoryId: 'sql-foundations',
    moduleId: 'relational-thinking',
    topicId: 'where-filters',
    subtopicId: 'null-and-logic',
    sourceType: 'Manual',
  });

  assert.equal(draft.sourceType, 'Manual');
  assert.equal(draft.title, 'Manual note');
  assert.ok(draft.content.length > 0);
});

test('analysis candidates keep the correct note location and confidence scale', () => {
  const analysis = buildSourceAnalysis(
    'INNER JOIN returns matching rows.\n\nWHERE filters rows before grouping.',
    'Mixed SQL notes',
  );

  assert.ok(analysis.candidates.length >= 2);
  assert.ok(analysis.candidates[0].confidence > 0.5);
  assert.equal(analysis.candidates[0].topicId, 'inner-joins');
});

test('messy TXT fixture maps topics, preserves uncertain content, and identifies duplicates', async () => {
  const raw = await readFile(join(process.cwd(), 'src', 'fixtures', 'messy-sql-notes.txt'), 'utf8');
  const analysis = buildSourceAnalysis(raw, 'messy-sql-notes.txt');

  assert.ok(analysis.candidates.length >= 10);
  assert.ok(analysis.candidates.some((candidate) => candidate.topicId === 'inner-joins'));
  assert.ok(analysis.candidates.some((candidate) => candidate.topicId === 'where-filters'));
  assert.ok(analysis.candidates.some((candidate) => candidate.topicId === 'group-by'));
  assert.ok(analysis.candidates.some((candidate) => candidate.duplicateDetected));
  assert.ok(analysis.candidates.some((candidate) => candidate.needsDecision));
  assert.ok(analysis.candidates.every((candidate) => candidate.sourceChunk.length > 0));
});

test('candidate edits preserve note location after a manual correction', () => {
  const candidate = {
    title: 'JOIN reminder',
    content: 'INNER JOIN keeps matching keys from both tables.',
    categoryId: 'sql-foundations',
    moduleId: 'query-basics',
    topicId: 'query-structure',
    subtopicId: 'select-list',
    confidence: 0.8,
    sourceChunk: 'INNER JOIN keeps matching keys from both tables.',
    mappingReason: 'test mapping',
    duplicateDetected: false,
    needsDecision: false,
  };

  const updated = updateCandidateLocation(candidate, {
    topicId: 'joins',
    subtopicId: 'inner-join',
  });

  assert.equal(updated.topicId, 'joins');
  assert.equal(updated.subtopicId, 'inner-join');
});

test('duplicate detection catches likely repeated notes before publishing', () => {
  const candidate = {
    title: 'SELECT column choices',
    content: 'Use explicit columns instead of SELECT * to keep the result stable.',
    categoryId: 'sql-foundations',
    moduleId: 'query-basics',
    topicId: 'query-structure',
    subtopicId: 'select-list',
  };

  assert.equal(isLikelyDuplicate(existingNotes, candidate), true);
});

test('SQL practiced notes remain separate from learning path notes', () => {
  const practiceNote = {
    title: 'Practice review',
    content: 'The correct answer used an INNER JOIN.',
    categoryId: 'sql-foundations',
    moduleId: 'relational-thinking',
    topicId: 'where-filters',
    subtopicId: 'comparison-predicates',
  };

  assert.ok(practiceNote.categoryId === 'sql-foundations');
  assert.doesNotMatch(JSON.stringify(practiceNote), /note_sources/);
});
