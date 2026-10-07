import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sqlLearningCategories } from '@/data/sqlLearningContent';
import {
  canContinueRuntimeItem,
  classifyTopicChatIntent,
  createTopicLessonSections,
  createTopicChatRuntimeState,
  getLatestAssistantMessage,
  getNextRuntimeItemPath,
  getRuntimeSequenceItem,
  getTopicLessonProgressFromReply,
  resolveRuntimeItemPath,
  resolveRuntimeTopicLessonSection,
  isValidTopicChatRuntimeState,
  shouldShowRuntimeContinue,
  topicChatIncompleteNotice,
  truncateTopicChatHistoryContent,
} from '@/lib/topic-lesson';

function findSubtopic(categoryId: string, topicId: string, subtopicId: string) {
  return sqlLearningCategories
    .find((category) => category.id === categoryId)
    ?.topics.find((topic) => topic.id === topicId)
    ?.subtopics.find((subtopic) => subtopic.id === subtopicId);
}

test('Topic Chat lesson sections are deterministic and derived from the current subtopic seed', () => {
  const introduction = findSubtopic(
    'sql-database-fundamentals',
    'what-is-sql',
    'introduction-to-sql',
  );
  const selectingColumns = findSubtopic('sql-foundations', 'select-statements', 'selecting-columns');
  assert.ok(introduction);
  assert.ok(selectingColumns);

  const sections = createTopicLessonSections(introduction);
  assert.deepEqual(sections, createTopicLessonSections(introduction));
  assert.ok(sections.length >= 3);
  assert.equal(sections[0].sectionIndex, 1);
  assert.match(sections[0].title, /Introduction to SQL/);
  assert.ok(sections.some((section) => /Practical Example/.test(section.title)));
  assert.notDeepEqual(sections, createTopicLessonSections(selectingColumns));
});

test('Topic Chat lesson progress distinguishes completed, final, and truncated sections', () => {
  const subtopic = findSubtopic(
    'sql-database-fundamentals',
    'what-is-sql',
    'introduction-to-sql',
  );
  assert.ok(subtopic);
  const sections = createTopicLessonSections(subtopic);
  const firstReply =
    `## Lesson Section 1 of ${sections.length}: ${sections[0].title}\n\n` +
    'A complete explanation.';
  assert.deepEqual(getTopicLessonProgressFromReply(firstReply, subtopic), {
    sectionIndex: 1,
    sectionTitle: sections[0].title,
    focusIndex: null,
    focusTitle: null,
    sectionComplete: true,
    hasNextSection: true,
    nextSectionTitle: sections[1].title,
    nextFocusTitle: null,
  });

  const lastSection = sections.at(-1)!;
  const finalReply =
    `## Lesson Section ${lastSection.sectionIndex} of ${sections.length}: ${lastSection.title}\n\n` +
    'The final explanation.';
  assert.deepEqual(getTopicLessonProgressFromReply(finalReply, subtopic), {
    sectionIndex: lastSection.sectionIndex,
    sectionTitle: lastSection.title,
    focusIndex: null,
    focusTitle: null,
    sectionComplete: true,
    hasNextSection: false,
    nextSectionTitle: null,
    nextFocusTitle: null,
  });

  const truncatedReply = `${firstReply}\n\n${topicChatIncompleteNotice}`;
  assert.deepEqual(getTopicLessonProgressFromReply(truncatedReply, subtopic), {
    sectionIndex: 1,
    sectionTitle: sections[0].title,
    focusIndex: null,
    focusTitle: null,
    sectionComplete: false,
    hasNextSection: false,
    nextSectionTitle: null,
    nextFocusTitle: null,
  });
});

test('Topic Chat history truncation preserves the section identity marker and newest reply text', () => {
  const heading = '## Lesson Section 2 of 3: Core Concepts\n\n';
  const content = `${heading}${'Earlier explanation. '.repeat(1_000)}Latest sentence.`;
  const truncated = truncateTopicChatHistoryContent(content, 12_000);
  assert.ok(truncated.startsWith(heading));
  assert.ok(truncated.endsWith('Latest sentence.'));
  assert.equal(truncated.length, 12_000);
});

test('Topic Chat runtime sequence rules keep the current item in progress until it is complete', () => {
  const subtopic = findSubtopic(
    'sql-database-fundamentals',
    'what-is-sql',
    'introduction-to-sql',
  );
  assert.ok(subtopic);
  const sections = createTopicLessonSections(subtopic);

  assert.equal(
    resolveRuntimeTopicLessonSection('Continue.', sections, 2, false),
    2,
  );
  assert.equal(
    resolveRuntimeTopicLessonSection('Continue.', sections, 2, true),
    3,
  );
  assert.equal(
    resolveRuntimeTopicLessonSection('Teach me the third item.', sections, 1, true),
    3,
  );
  assert.equal(
    resolveRuntimeTopicLessonSection('Start with item A.', sections, 1, true),
    1,
  );
  assert.equal(
    resolveRuntimeTopicLessonSection('Go to item C.', sections, 1, true),
    3,
  );
  assert.equal(
    resolveRuntimeTopicLessonSection('ok lets move on to 1st part', sections, 2, true),
    1,
  );
  assert.equal(
    resolveRuntimeTopicLessonSection('i mean only this - 1️⃣ What SQL Stands For', sections, 1, true),
    1,
  );
  assert.equal(
    resolveRuntimeTopicLessonSection('Explain that again with an example.', sections, 2, false),
    2,
  );
});

test('Topic Chat classifies planning, explicit selection, Continue, and ordinary questions separately', () => {
  const state = {
    ...createTopicChatRuntimeState('category', 'topic', 'subtopic'),
    sequence: [
      { id: 'first', title: 'What SQL Is & Why It Matters' },
      { id: 'second', title: 'Relational-Database Basics' },
    ],
  };
  assert.equal(
    classifyTopicChatIntent('Give me a logical learning sequence for Introduction to SQL.', null),
    'sequence-generation',
  );
  assert.equal(
    classifyTopicChatIntent('ok lets move on to 1st part', state),
    'explicit-runtime-item-selection',
  );
  assert.equal(classifyTopicChatIntent('Go deeper.', state), 'ordinary-topic-question');
  assert.equal(
    classifyTopicChatIntent('Select Relational-Database Basics.', state),
    'explicit-runtime-item-selection',
  );
  assert.equal(
    classifyTopicChatIntent('Continue.', state),
    'continue-runtime-item',
  );
  assert.equal(classifyTopicChatIntent('hi', state), 'ordinary-topic-question');
});

test('runtime sequence creation is incomplete, nested selection is exact, and Continue advances one item', () => {
  const sequence = [
    {
      id: 'sql-meaning',
      title: 'What SQL Is & Why It Matters',
      items: [
        { id: 'acronym', title: 'What SQL Stands For' },
        { id: 'declarative', title: 'Declarative vs. Procedural' },
      ],
    },
    { id: 'relational-basics', title: 'Relational-Database Basics' },
    { id: 'data-types', title: 'Data Types & Constraints' },
  ];
  const initial = createTopicChatRuntimeState('category', 'topic', 'subtopic');
  const generated = { ...initial, sequence, latestIntent: 'sequence-generation' as const };
  assert.equal(generated.currentPath, null);
  assert.equal(generated.completion, 'not-started');
  assert.equal(canContinueRuntimeItem(generated), false);
  assert.equal(
    resolveRuntimeItemPath('ok lets move on to 1st part', sequence)?.join('.'),
    '0',
  );
  const nestedPath = resolveRuntimeItemPath(
    'i mean only this - 1️⃣ What SQL Stands For',
    sequence,
  );
  assert.deepEqual(nestedPath, [0, 0]);
  assert.equal(getRuntimeSequenceItem(sequence, nestedPath)?.title, 'What SQL Stands For');
  assert.deepEqual(getNextRuntimeItemPath(sequence, nestedPath), [0, 1]);
  assert.deepEqual(getNextRuntimeItemPath(sequence, [0, 1]), [1]);
  assert.deepEqual(getNextRuntimeItemPath(sequence, [2]), null);
  assert.equal(canContinueRuntimeItem({
    ...generated,
    currentPath: nestedPath,
    completion: 'complete',
  }), true);
  assert.equal(canContinueRuntimeItem({
    ...generated,
    currentPath: nestedPath,
    completion: 'complete',
    latestIntent: 'ordinary-topic-question',
  }), false);
  assert.equal(canContinueRuntimeItem({
    ...generated,
    currentPath: nestedPath,
    completion: 'incomplete',
  }), false);
  assert.equal(canContinueRuntimeItem({
    ...generated,
    currentPath: [2],
    completion: 'complete',
  }), false);
  assert.equal(canContinueRuntimeItem({
    ...generated,
    currentPath: nestedPath,
    completion: 'complete',
    responseIncomplete: true,
  }), false);
  const completedNestedItem = {
    ...generated,
    currentPath: nestedPath,
    completion: 'complete' as const,
  };
  assert.equal(shouldShowRuntimeContinue(completedNestedItem, true, false, false), true);
  assert.equal(shouldShowRuntimeContinue(completedNestedItem, true, true, false), false);
  assert.equal(shouldShowRuntimeContinue(completedNestedItem, false, false, false), false);
  assert.equal(shouldShowRuntimeContinue(completedNestedItem, true, false, true), false);
  const incompleteNestedItem = {
    ...completedNestedItem,
    completion: 'incomplete',
    responseIncomplete: true,
  } as const;
  assert.equal(shouldShowRuntimeContinue(incompleteNestedItem, true, false, false), true);
  assert.equal(shouldShowRuntimeContinue(incompleteNestedItem, true, true, false), false);
  assert.equal(shouldShowRuntimeContinue(incompleteNestedItem, false, false, false), false);
  assert.equal(shouldShowRuntimeContinue(incompleteNestedItem, true, false, true), false);
  assert.equal(shouldShowRuntimeContinue({
    ...completedNestedItem,
    currentPath: [2],
  }, true, false, false), false);
  assert.equal(shouldShowRuntimeContinue({
    ...incompleteNestedItem,
    currentPath: [2],
  }, true, false, false), true);
  assert.equal(shouldShowRuntimeContinue({
    ...completedNestedItem,
    latestIntent: 'ordinary-topic-question',
  }, true, false, false), false);
  const chatMessages = [
    { id: 'assistant-result', role: 'assistant' },
    { id: 'follow-up-user', role: 'user' },
  ];
  const latestAssistant = getLatestAssistantMessage(chatMessages);
  assert.equal(latestAssistant?.id, 'assistant-result');
  assert.equal(
    shouldShowRuntimeContinue(completedNestedItem, latestAssistant?.id === 'assistant-result', false, false),
    true,
  );
  assert.deepEqual(getNextRuntimeItemPath(sequence, nestedPath), [0, 1]);
  assert.equal(isValidTopicChatRuntimeState(generated, 'category', 'topic', 'subtopic'), true);
  assert.equal(isValidTopicChatRuntimeState(generated, 'other', 'topic', 'subtopic'), false);
});

test('runtime item selection resolves displayed ordinal variants to the same nested sequence item', () => {
  const sequence = [
    {
      id: 'what-sql-is',
      title: 'What SQL Is & Why It Matters',
      items: [
        { id: 'what-sql-stands-for', title: 'What SQL Stands For' },
        { id: 'declarative-vs-procedural', title: 'Declarative vs Procedural' },
      ],
    },
    { id: 'relational-basics', title: 'Relational-Database Basics' },
  ];
  const requests = [
    '1 What SQL Stands For',
    '1️⃣ What SQL Stands For',
    '1st What SQL Stands For',
    'start with 1',
    'start with the first item',
    'teach me What SQL Stands For',
    'i mean only this - 1️⃣ What SQL Stands For',
  ];
  for (const question of requests) {
    const path = resolveRuntimeItemPath(question, sequence);
    assert.deepEqual(path, [0, 0], question);
    assert.equal(getRuntimeSequenceItem(sequence, path)?.id, 'what-sql-stands-for', question);
    assert.equal(classifyTopicChatIntent(question, {
      ...createTopicChatRuntimeState('category', 'topic', 'subtopic'),
      sequence,
    }), 'explicit-runtime-item-selection', question);
  }
});

test('explicit runtime item selection is authoritative and ordinary questions preserve the selected path', () => {
  const sequence = [
    {
      id: 'what-sql-is',
      title: 'What SQL Is & Why It Matters',
      items: [{ id: 'what-sql-stands-for', title: 'What SQL Stands For' }],
    },
    { id: 'relational-basics', title: 'Relational-Database Basics' },
  ];
  const state = {
    ...createTopicChatRuntimeState('category', 'topic', 'subtopic'),
    sequence,
    currentPath: [0, 0],
    completion: 'not-started' as const,
  };
  const selectedPath = resolveRuntimeItemPath(
    'i mean only this - 1️⃣ What SQL Stands For',
    sequence,
  );
  assert.deepEqual(selectedPath, [0, 0]);
  assert.equal(getRuntimeSequenceItem(sequence, selectedPath)?.id, 'what-sql-stands-for');

  assert.equal(classifyTopicChatIntent('What is SQL used for?', state), 'ordinary-topic-question');
  assert.deepEqual(state.currentPath, [0, 0]);
  assert.equal(
    resolveRuntimeTopicLessonSection(
      'i mean only this - 1️⃣ What SQL Stands For',
      createTopicLessonSections(findSubtopic(
        'sql-database-fundamentals',
        'what-is-sql',
        'introduction-to-sql',
      )!),
      1,
      false,
    ),
    1,
  );
});

test('runtime sequence request is never classified as teaching or Continue', () => {
  const state = {
    ...createTopicChatRuntimeState('category', 'topic', 'subtopic'),
    sequence: [{ id: 'one', title: 'First item' }],
    currentPath: [0],
    completion: 'complete' as const,
  };
  assert.equal(
    classifyTopicChatIntent('Give me a logical learning sequence for Introduction to SQL.', state),
    'sequence-generation',
  );
});

test('normal typed continuation wording advances from the stored runtime sequence', () => {
  const state = {
    ...createTopicChatRuntimeState('category', 'topic', 'subtopic'),
    sequence: [
      { id: 'first-item', title: 'First item' },
      { id: 'second-item', title: 'Second item' },
    ],
    currentPath: [0],
    completion: 'complete' as const,
  };
  for (const phrase of ['continue', 'continue please', 'go on', 'next', 'move on', 'keep going']) {
    assert.equal(classifyTopicChatIntent(phrase, state), 'continue-runtime-item', phrase);
  }
});
