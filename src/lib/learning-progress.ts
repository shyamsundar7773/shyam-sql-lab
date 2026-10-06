export type SubtopicProgressIdentity = {
  userId: string;
  categoryId: string;
  topicId: string;
  subtopicId: string;
};

export type SubtopicProgressRow = {
  category_id: string;
  topic_id: string;
  subtopic_id: string;
  follow_up_count: number;
};

export async function completeAcceptedLearningPrompt<T>(
  sendPrompt: () => Promise<T>,
  incrementProgress: () => Promise<number>,
) {
  const response = await sendPrompt();
  const followUpCount = await incrementProgress();
  return { response, followUpCount };
}

export function getSubtopicProgressKey({
  userId,
  categoryId,
  topicId,
  subtopicId,
}: SubtopicProgressIdentity) {
  return JSON.stringify([userId, categoryId, topicId, subtopicId]);
}

export function buildSubtopicProgressMap(
  userId: string,
  rows: SubtopicProgressRow[],
) {
  return Object.fromEntries(
    rows.map((row) => [
      getSubtopicProgressKey({
        userId,
        categoryId: row.category_id,
        topicId: row.topic_id,
        subtopicId: row.subtopic_id,
      }),
      row.follow_up_count,
    ]),
  );
}

export function getSubtopicProgressLabels(followUpCount: number | undefined) {
  if (!followUpCount || followUpCount < 1) {
    return { status: 'NOT YET STARTED', count: '' };
  }

  return {
    status: 'PROGRESS',
    count: `${followUpCount} FOLLOW-UP${followUpCount === 1 ? '' : 'S'}`,
  };
}
