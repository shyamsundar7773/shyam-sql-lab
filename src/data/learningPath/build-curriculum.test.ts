import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  learningCategories,
  learningPathContent,
  learningPathTaxonomy,
  legacyLearningContent,
} from './index';
import { buildLearningCategories } from './build-curriculum';
import {
  canSendTopicMessage,
  getSelectedSubtopicContext,
  getSubtopicContext,
  getSubtopicConversationIdentity,
  getTopicContext,
} from '../../lib/learning-content';
import { createTopicLesson } from '../../lib/topic-lesson';

const expectedPaths = [
  ['sql-foundations', 'select-statements', 'selecting-columns'],
  ['sql-foundations', 'select-statements', 'filtering-rows'],
  ['data-querying', 'aggregations', 'count-data'],
  ['data-querying', 'aggregations', 'group-by-basics'],
  ...learningPathTaxonomy
    .find((category) => category.id === 'sql-database-fundamentals')!
    .topics.flatMap((topic) =>
      topic.subtopics.map((subtopic) => [
        'sql-database-fundamentals',
        topic.id,
        subtopic.id,
      ]),
    ),
];
const expectedFundamentalsTopicTitles = [
  'What is SQL?',
  'What is a Database?',
  'DBMS vs RDBMS',
  'SQL vs MySQL',
  'Database, Schema, Table',
  'Rows & Columns',
  'Primary Key Concept',
  'Foreign Key Concept',
  'Relationships',
  'SQL Commands Overview',
  'SQL Developer Workflow',
];

test('production fundamentals taxonomy has exactly the supplied topics and definition-only seeds', () => {
  const categories = learningPathTaxonomy.filter(
    (category) => category.title === 'SQL & Database Fundamentals',
  );
  assert.equal(categories.length, 1);
  assert.equal(categories[0].id, 'sql-database-fundamentals');
  assert.equal(categories[0].topics.length, 11);
  assert.deepEqual(
    categories[0].topics.map((topic) => topic.title),
    expectedFundamentalsTopicTitles,
  );
  const subtopics = categories[0].topics.flatMap((topic) => topic.subtopics);
  assert.equal(subtopics.length, 120);
  assert.equal(subtopics.filter((subtopic) => subtopic.definition?.trim()).length, 120);
  assert.equal(new Set(subtopics.map((subtopic) => subtopic.id)).size, 120);
  assert.ok(categories[0].topics.every((topic) => !('modules' in topic)));

  const builtCategory = learningCategories.find((category) => category.id === categories[0].id);
  assert.ok(builtCategory);
  for (const topic of builtCategory.topics) {
    assert.deepEqual(topic.examples, []);
    assert.deepEqual(topic.keyPoints, []);
    assert.deepEqual(topic.commonMistakes, []);
    assert.deepEqual(topic.practiceQuestions, []);
    assert.deepEqual(topic.interviewQuestions, []);
    for (const subtopic of topic.subtopics) {
      assert.equal(subtopic.explanation[0], subtopic.definition);
      assert.deepEqual(subtopic.explanation, [subtopic.definition]);
      assert.deepEqual(subtopic.examples, []);
      assert.deepEqual(subtopic.keyPoints, []);
      assert.deepEqual(subtopic.commonMistakes, []);
      assert.deepEqual(subtopic.practiceQuestions, []);
      assert.deepEqual(subtopic.interviewQuestions, []);
    }
  }
});

test('definition-backed subtopics do not inherit stale pilot lesson material', () => {
  const staleMaterial = {
    explanation: ['Stale pilot lesson.'],
    examples: [{ title: 'Old example', explanation: 'Old explanation.', code: 'SELECT 1;' }],
    keyPoints: ['Old key point.'],
    commonMistakes: ['Old mistake.'],
    practiceQuestions: ['Old practice.'],
    interviewQuestions: ['Old interview question.'],
  };
  const categories = buildLearningCategories(
    learningPathTaxonomy,
    {
      ...legacyLearningContent,
      'what-is-sql': {
        topic: staleMaterial,
        subtopics: { 'introduction-to-sql': staleMaterial },
      },
    },
    learningPathContent.entries,
  );
  const subtopic = categories
    .find((category) => category.id === 'sql-database-fundamentals')
    ?.topics.find((topic) => topic.id === 'what-is-sql')
    ?.subtopics.find((item) => item.id === 'introduction-to-sql');
  assert.equal(
    subtopic?.definition,
    'Structured Query Language is the standardized programming language used to manage, query, and manipulate data stored in relational databases.',
  );
  assert.deepEqual(subtopic?.explanation, [subtopic?.definition]);
  assert.deepEqual(subtopic?.examples, []);
  assert.deepEqual(subtopic?.keyPoints, []);
  assert.deepEqual(subtopic?.commonMistakes, []);
  assert.deepEqual(subtopic?.practiceQuestions, []);
  assert.deepEqual(subtopic?.interviewQuestions, []);
});

test('official taxonomy is exactly Category to Topic to Subtopic with no Module level', () => {
  assert.deepEqual(
    learningPathTaxonomy.flatMap((category) =>
      category.topics.flatMap((topic) =>
        topic.subtopics.map((subtopic) => [category.id, topic.id, subtopic.id]),
      ),
    ),
    expectedPaths,
  );
  assert.ok(learningPathTaxonomy.every((category) => !('modules' in category)));
});

test('the official content pipeline resolves each pilot lesson under its exact canonical path', () => {
  assert.equal(learningPathContent.entries.length, 4);
  assert.ok(learningPathContent.entries.every((entry) => !('moduleId' in entry)));
  const categories = buildLearningCategories(
    learningPathTaxonomy,
    legacyLearningContent,
    learningPathContent.entries,
  );
  assert.deepEqual(
    categories.flatMap((category) =>
      category.topics.flatMap((topic) =>
        topic.subtopics.map((subtopic) => [category.id, topic.id, subtopic.id]),
      ),
    ),
    expectedPaths,
  );
  assert.deepEqual(categories.map((category) => category.topics.length), [1, 1, 11]);
  assert.ok(categories.every((category) => !('modules' in category)));
  for (const entry of learningPathContent.entries) {
    const topic = categories
      .find((category) => category.id === entry.categoryId)
      ?.topics.find((item) => item.id === entry.topicId);
    const subtopic = topic?.subtopics.find((item) => item.id === entry.subtopicId);
    assert.ok(subtopic?.explanation.length);
    assert.deepEqual(subtopic?.explanation, entry.content.explanation);
    assert.ok(subtopic?.examples.every((example) =>
      typeof example.title === 'string' &&
      typeof example.explanation === 'string' &&
      typeof example.code === 'string',
    ));
  }
});

test('Topic Chat resolves and renders the exact lesson for each canonical subtopic', () => {
  for (const [categoryId, topicId, subtopicId] of expectedPaths) {
    const context = getTopicContext(topicId);
    assert.equal(context?.topic.id, topicId);
    const subtopicContext = getSubtopicContext(categoryId, topicId, subtopicId);
    assert.equal(subtopicContext?.subtopic.id, subtopicId);
    const lesson = context && subtopicContext
      ? createTopicLesson(context.topic, subtopicContext.subtopic)
      : null;
    assert.ok(lesson);
    assert.equal(
      lesson.title,
      subtopicContext?.subtopic.lessonTitle ?? subtopicContext?.subtopic.title,
    );
    assert.deepEqual(lesson.examples, subtopicContext?.subtopic.examples);
    assert.ok(lesson.examples.every((example) => example.title && example.code));
    assert.deepEqual(lesson.explanation, subtopicContext?.subtopic.explanation);
    assert.deepEqual(lesson.keyPoints, subtopicContext?.subtopic.keyPoints);
    assert.deepEqual(lesson.commonMistakes, subtopicContext?.subtopic.commonMistakes);
    assert.deepEqual(lesson.practiceQuestions, subtopicContext?.subtopic.practiceQuestions);
    assert.deepEqual(lesson.interviewQuestions, subtopicContext?.subtopic.interviewQuestions);
    assert.ok(!('subtopics' in lesson));
  }

  for (const category of buildLearningCategories(
    learningPathTaxonomy,
    legacyLearningContent,
    learningPathContent.entries,
  )) {
    for (const topic of category.topics) {
      const titles = topic.examples.map((example) => example.title);
      assert.equal(new Set(titles).size, titles.length);
    }
  }
});

test('canonical subtopics have distinct AI conversation identities', () => {
  const identities = expectedPaths.map(([categoryId, topicId, subtopicId]) =>
    getSubtopicConversationIdentity(categoryId, topicId, subtopicId),
  );
  assert.equal(
    new Set(identities.map((identity) => JSON.stringify(identity))).size,
    expectedPaths.length,
  );
  assert.equal(
    getSubtopicConversationIdentity('sql-foundations', 'aggregations', 'count-data'),
    null,
  );
  assert.equal(
    getSelectedSubtopicContext('sql-foundations', 'select-statements', undefined),
    null,
  );
  assert.equal(
    getSelectedSubtopicContext(undefined, 'select-statements', 'selecting-columns'),
    null,
  );
  const fundamentalsPaths = learningPathTaxonomy
    .find((category) => category.id === 'sql-database-fundamentals')!
    .topics.flatMap((topic) =>
      topic.subtopics.map((subtopic) =>
        getSubtopicConversationIdentity(
          'sql-database-fundamentals',
          topic.id,
          subtopic.id,
        ),
      ),
    );
  assert.equal(fundamentalsPaths.length, 120);
  assert.equal(
    new Set(fundamentalsPaths.map((identity) => JSON.stringify(identity))).size,
    120,
  );
  assert.equal(
    getSubtopicConversationIdentity(
      'sql-database-fundamentals',
      'what-is-sql',
      'introduction-to-sql',
    )?.subtopicId,
    'introduction-to-sql',
  );
  assert.equal(
    getSubtopicConversationIdentity(
      'sql-database-fundamentals',
      'what-is-sql',
      'purpose-of-sql',
    )?.subtopicId,
    'purpose-of-sql',
  );

});


test('Topic Chat send requires the complete context and ready conversation', () => {
  const validState = {
    categoryId: 'sql-foundations',
    topicId: 'select-statements',
    subtopicId: 'selecting-columns',
    conversationReady: true,
    sessionReady: true,
    loading: false,
    loadError: '',
    sending: false,
    message: ' What is the difference between one and multiple columns? ',
  };
  assert.equal(canSendTopicMessage(validState), true);
  assert.equal(canSendTopicMessage({ ...validState, subtopicId: undefined }), false);
  assert.equal(canSendTopicMessage({ ...validState, conversationReady: false }), false);
  assert.equal(canSendTopicMessage({ ...validState, message: '   ' }), false);
  assert.equal(canSendTopicMessage({ ...validState, sending: true }), false);
});
