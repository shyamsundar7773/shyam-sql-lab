import assert from 'node:assert/strict';
import { test } from 'node:test';

import { learningPathContent, learningPathTaxonomy, legacyLearningContent } from './index';
import { buildLearningCategories } from './build-curriculum';
import { canSendTopicMessage, getSubtopicContext, getTopicContext } from '../../lib/learning-content';
import { createTopicLesson } from '../../lib/topic-lesson';

const expectedPaths = [
  ['sql-foundations', 'select-statements', 'selecting-columns'],
  ['sql-foundations', 'select-statements', 'filtering-rows'],
  ['data-querying', 'aggregations', 'count-data'],
  ['data-querying', 'aggregations', 'group-by-basics'],
];

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
  assert.deepEqual(categories.map((category) => category.topics.length), [1, 1]);
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
    assert.equal(lesson.title, subtopicContext?.subtopic.title);
    assert.deepEqual(lesson.examples, subtopicContext?.subtopic.examples);
    assert.ok(lesson.examples.every((example) => example.title && example.code));
    assert.deepEqual(lesson.subtopics.map((subtopic) => subtopic.id), [subtopicId]);
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
