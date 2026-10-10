import AsyncStorage from '@react-native-async-storage/async-storage';

import { sqlLearningCategories } from '@/data/sqlLearningContent';
import type { SqlPracticeExecutionResult } from '@/types/sql-practice';

export type MyPracticedNoteSqlBlock = {
  id: string;
  question: string;
  sql: string;
  schemaJson: string;
  attemptId: string | null;
  status: 'idle' | 'running' | 'success' | 'error';
  output: SqlPracticeExecutionResult | null;
  evaluation: string | null;
  followUpText: string;
};

export type MyPracticedNote = {
  id: string;
  title: string;
  content: string;
  categoryId: string;
  topicId: string;
  subtopicId: string;
  createdAt: string;
  updatedAt: string;
  sqlBlocks: MyPracticedNoteSqlBlock[];
};

export function getDisplayNoteTitle(title: string): string {
  return title.trim() ? title : 'Untitled';
}

export function getMyPracticedNotesStorageKey(
  categoryId: string,
  topicId: string,
  subtopicId: string,
): string {
  return `my-practiced-notes:${categoryId}:${topicId}:${subtopicId}`;
}

export async function loadMyPracticedNotes(
  categoryId: string,
  topicId: string,
  subtopicId: string,
): Promise<MyPracticedNote[]> {
  const key = getMyPracticedNotesStorageKey(categoryId, topicId, subtopicId);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeMyPracticedNote).filter((note): note is MyPracticedNote => isMyPracticedNote(note));
  } catch {
    return [];
  }
}

export async function saveMyPracticedNotes(
  categoryId: string,
  topicId: string,
  subtopicId: string,
  notes: MyPracticedNote[],
): Promise<void> {
  const key = getMyPracticedNotesStorageKey(categoryId, topicId, subtopicId);
  await AsyncStorage.setItem(key, JSON.stringify(notes));
}

export function createBlankMyPracticedNote(
  categoryId: string,
  topicId: string,
  subtopicId: string,
): MyPracticedNote {
  const now = new Date().toISOString();
  return {
    id: `note-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title: '',
    content: '',
    categoryId,
    topicId,
    subtopicId,
    createdAt: now,
    updatedAt: now,
    sqlBlocks: [],
  };
}

export function resolveMyPracticedNotesSelection(
  selection: Partial<{ categoryId: string; topicId: string; subtopicId: string }>,
): { categoryId: string; topicId: string; subtopicId: string } | null {
  const categoryId = typeof selection.categoryId === 'string' ? selection.categoryId.trim() : '';
  const topicId = typeof selection.topicId === 'string' ? selection.topicId.trim() : '';
  const subtopicId = typeof selection.subtopicId === 'string' ? selection.subtopicId.trim() : '';

  if (!categoryId || !topicId || !subtopicId) {
    return null;
  }

  const category = sqlLearningCategories.find((item) => item.id === categoryId) ?? null;
  if (!category) {
    return null;
  }

  const topic = category.topics.find((item) => item.id === topicId) ?? null;
  if (!topic) {
    return null;
  }

  const subtopic = topic.subtopics.find((item) => item.id === subtopicId) ?? null;
  if (!subtopic) {
    return null;
  }

  return {
    categoryId: category.id,
    topicId: topic.id,
    subtopicId: subtopic.id,
  };
}

function normalizeMyPracticedNote(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  const candidate = value as Record<string, unknown>;
  if (!Array.isArray(candidate.sqlBlocks)) {
    return value;
  }
  return {
    ...candidate,
    title: typeof candidate.title === 'string' ? candidate.title : '',
    sqlBlocks: candidate.sqlBlocks.map((block) => {
      if (typeof block !== 'object' || block === null) {
        return {
          id: `sql-block-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          question: '',
          sql: '',
          schemaJson: '',
          attemptId: null,
          status: 'idle',
          output: null,
          evaluation: null,
          followUpText: '',
        };
      }
      const current = block as Record<string, unknown>;
      return {
        id: typeof current.id === 'string' ? current.id : `sql-block-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        question: typeof current.question === 'string' ? current.question : '',
        sql: typeof current.sql === 'string' ? current.sql : '',
        schemaJson: typeof current.schemaJson === 'string' ? current.schemaJson : '',
        attemptId: typeof current.attemptId === 'string' ? current.attemptId : null,
        status: current.status === 'running' || current.status === 'success' || current.status === 'error'
          ? current.status
          : 'idle',
        output: current.output ?? null,
        evaluation: typeof current.evaluation === 'string' ? current.evaluation : null,
        followUpText: typeof current.followUpText === 'string' ? current.followUpText : '',
      };
    }),
  };
}

function isMyPracticedNote(value: unknown): value is MyPracticedNote {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.categoryId === 'string' &&
    typeof candidate.topicId === 'string' &&
    typeof candidate.subtopicId === 'string' &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.updatedAt === 'string' &&
    Array.isArray(candidate.sqlBlocks) &&
    candidate.sqlBlocks.every(
      (block) =>
        typeof block === 'object' &&
        block !== null &&
        typeof (block as Record<string, unknown>).id === 'string' &&
        typeof (block as Record<string, unknown>).question === 'string' &&
        typeof (block as Record<string, unknown>).sql === 'string' &&
        typeof (block as Record<string, unknown>).schemaJson === 'string' &&
        ((block as Record<string, unknown>).attemptId === null ||
          typeof (block as Record<string, unknown>).attemptId === 'string') &&
        ((block as Record<string, unknown>).evaluation === null || typeof (block as Record<string, unknown>).evaluation === 'string') &&
        typeof (block as Record<string, unknown>).followUpText === 'string' &&
        ((block as Record<string, unknown>).status === 'idle' ||
          (block as Record<string, unknown>).status === 'running' ||
          (block as Record<string, unknown>).status === 'success' ||
          (block as Record<string, unknown>).status === 'error'),
    )
  );
}
