import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';

import { scheduleMyPracticedNotesAutosave } from './my-practiced-notes-autosave.ts';

const callbacks = (updates) => ({
  onStart: () => updates.push('saving'),
  onSuccess: () => updates.push('saved'),
  onError: (error) => updates.push(`error:${error.message}`),
  onSettled: () => updates.push('settled'),
});

test('autosave persists an empty note content value after the debounce', async () => {
  const note = { id: 'note-1', content: '' };
  const updates = [];
  let persisted;

  scheduleMyPracticedNotesAutosave(
    note,
    async (value) => {
      persisted = JSON.parse(JSON.stringify(value));
    },
    callbacks(updates),
    5,
  );
  await delay(20);

  assert.deepEqual(persisted, note);
  assert.deepEqual(updates, ['saving', 'saved', 'settled']);
});

test('autosave reports a rejected storage write without an unhandled rejection', async () => {
  const updates = [];
  let unhandledRejection;
  const captureUnhandledRejection = (error) => {
    unhandledRejection = error;
  };
  process.on('unhandledRejection', captureUnhandledRejection);

  try {
    scheduleMyPracticedNotesAutosave(
      { id: 'note-1', content: '' },
      async () => {
        throw new Error('Storage quota exceeded.');
      },
      callbacks(updates),
      5,
    );
    await delay(20);

    assert.deepEqual(updates, ['saving', 'error:Storage quota exceeded.', 'settled']);
    assert.equal(unhandledRejection, undefined);
  } finally {
    process.off('unhandledRejection', captureUnhandledRejection);
  }
});

test('debounce cleanup cancels a pending save after a newer empty-content update', async () => {
  const updates = [];
  const persisted = [];
  const firstCleanup = scheduleMyPracticedNotesAutosave(
    { id: 'note-1', content: 'Previous content' },
    async (value) => {
      persisted.push(value.content);
    },
    callbacks(updates),
    20,
  );
  firstCleanup();

  scheduleMyPracticedNotesAutosave(
    { id: 'note-1', content: '' },
    async (value) => {
      persisted.push(value.content);
    },
    callbacks(updates),
    5,
  );
  await delay(25);

  assert.deepEqual(persisted, ['']);
  assert.deepEqual(updates, ['saving', 'saved', 'settled']);
});
