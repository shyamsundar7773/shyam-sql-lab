import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildImportCandidates,
  createManualNotePayload,
  detectDuplicateNote,
  filterNotes,
  getCategoryOptions,
  getModuleOptions,
  getSubtopicOptions,
  getTopicOptions,
  searchNotes,
} from '@/lib/notes-utils';
import type { Note } from '@/types/notes';

const notes: Note[] = [
  {
    id: 'note-1',
    user_id: 'user-1',
    category_id: 'sql-foundations',
    module_id: 'query-basics',
    topic_id: 'query-structure',
    subtopic_id: 'select-list',
    title: 'Explicit query columns',
    content: 'Use explicit SELECT columns rather than SELECT *.',
    source_type: 'Manual',
    source_id: null,
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-01T10:00:00.000Z',
  },
  {
    id: 'note-2',
    user_id: 'user-1',
    category_id: 'sql-foundations',
    module_id: 'relational-thinking',
    topic_id: 'where-filters',
    subtopic_id: 'comparison-predicates',
    title: 'WHERE comparisons',
    content: 'Use comparison operators to narrow rows in WHERE.',
    source_type: 'Imported',
    source_id: 'source-1',
    created_at: '2026-10-01T12:00:00.000Z',
    updated_at: '2026-10-01T12:00:00.000Z',
  },
];

test('category to module to topic to subtopic mapping returns valid tree selections', () => {
  assert.equal(getCategoryOptions()[0].value, 'sql-foundations');
  assert.equal(getModuleOptions('sql-foundations')[0].value, 'query-basics');
  assert.equal(getTopicOptions('query-basics')[0].value, 'query-structure');
  assert.equal(getSubtopicOptions('query-structure')[0].value, 'select-list');
});

test('manual note creation payload stores the correct taxonomy and source', () => {
  const payload = createManualNotePayload({
    userId: 'user-1',
    categoryId: 'sql-foundations',
    moduleId: 'query-basics',
    topicId: 'query-structure',
    subtopicId: 'select-list',
    title: 'New manual note',
    content: 'Use meaningful column lists in a SELECT statement.',
    sourceType: 'Manual',
  });

  assert.equal(payload.category_id, 'sql-foundations');
  assert.equal(payload.module_id, 'query-basics');
  assert.equal(payload.source_type, 'Manual');
});

test('manual note creation rejects missing content and invalid taxonomy relationships', () => {
  const validDraft = {
    userId: 'user-1',
    categoryId: 'sql-foundations',
    moduleId: 'query-basics',
    topicId: 'query-structure',
    subtopicId: 'select-list',
    title: 'Valid note',
    content: 'Valid content.',
  };

  assert.throws(
    () => createManualNotePayload({ ...validDraft, title: '   ' }),
    /Enter a title/,
  );
  assert.throws(
    () => createManualNotePayload({ ...validDraft, content: '   ' }),
    /Enter some content/,
  );
  assert.throws(
    () => createManualNotePayload({ ...validDraft, topicId: 'where-filters' }),
    /belongs to the selected Module/,
  );
});

test('subtopic filters and search keep notes aligned with their taxonomy', () => {
  const filtered = filterNotes(notes, {
    categoryId: 'sql-foundations',
    moduleId: 'query-basics',
    topicId: 'query-structure',
    subtopicId: 'select-list',
  });
  const searched = searchNotes(notes, 'WHERE');

  assert.equal(filtered.length, 1);
  assert.equal(searched.length, 1);
  assert.equal(searched[0].title, 'WHERE comparisons');
});

test('duplicate detection warns before creating a repeated note', () => {
  const candidate = {
    title: 'Explicit query columns',
    content: 'Use explicit SELECT columns rather than SELECT *.',
    category_id: 'sql-foundations',
    module_id: 'query-basics',
    topic_id: 'query-structure',
    subtopic_id: 'select-list',
  };

  assert.equal(detectDuplicateNote(notes, candidate), true);
});

test('bulk import candidates map to the correct learning path locations', () => {
  const items = buildImportCandidates('INNER JOIN combines matching rows.\n\nLEFT JOIN preserves the left side', 'source-1');

  assert.ok(items.length >= 2);
  assert.ok(getCategoryOptions().some((category) => category.value === items[0].proposed_category_id));
  assert.ok(
    getModuleOptions(items[0].proposed_category_id).some(
      (module) => module.value === items[0].proposed_module_id,
    ),
  );
  assert.ok(items[0].proposed_title.length > 0);
});

test('SQL practiced notes remain separate from learning path note filters', () => {
  const learningNote = filterNotes(notes, { categoryId: 'sql-foundations' });
  assert.equal(learningNote.length, 2);
  assert.ok(learningNote.every((note) => note.source_type === 'Manual' || note.source_type === 'Imported'));
});
