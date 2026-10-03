type NoteDraft = {
  title: string;
  content: string;
  categoryId: string;
  moduleId: string;
  topicId: string;
  subtopicId: string;
  sourceType?: 'Official' | 'Manual' | 'Imported';
};

export type NoteCandidate = {
  title: string;
  content: string;
  categoryId: string;
  moduleId: string;
  topicId: string;
  subtopicId: string;
  confidence: number;
  sourceChunk: string;
  mappingReason: string;
  duplicateDetected: boolean;
  needsDecision: boolean;
};

export function normalizeNoteDraft(input: NoteDraft) {
  const trimmedTitle = input.title.trim();
  const trimmedContent = input.content.trim();
  if (!trimmedTitle || !trimmedContent) {
    throw new Error('Title and content are required.');
  }
  return {
    title: trimmedTitle,
    content: trimmedContent,
    categoryId: input.categoryId,
    moduleId: input.moduleId,
    topicId: input.topicId,
    subtopicId: input.subtopicId,
    sourceType: input.sourceType ?? 'Manual',
  };
}

export function buildSourceAnalysis(rawText: string, sourceName = 'Imported source') {
  const chunks = rawText
    .split(/\n{2,}|\r\n\r\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 100);

  const previousCandidates: NoteCandidate[] = [];
  return {
    sourceName,
    status: 'Ready for Review',
    candidates: chunks.map((chunk, index) => {
      const candidate = mapChunk(chunk, index);
      candidate.duplicateDetected = isLikelyDuplicate(previousCandidates, candidate);
      previousCandidates.push(candidate);
      return candidate;
    }),
  };
}

function mapChunk(chunk: string, index: number): NoteCandidate {
  const text = chunk.toLowerCase();
  const title = chunk
    .replace(/^#+\s*/, '')
    .split(/\n|\.|:/)[0]
    ?.trim()
    .replace(/^[-*\d.)\s]+/, '')
    .slice(0, 80) || `Note ${index + 1}`;
  const base = {
    title,
    content: chunk.trim(),
    sourceChunk: chunk,
    confidence: 0.78,
    mappingReason: 'Matched terms in this chunk against the current Learning Path.',
    duplicateDetected: false,
    needsDecision: false,
  };
  if (/vector database|hnsw|embedding|ef_search/.test(text)) {
    return {
      ...base,
      categoryId: 'querying-data',
      moduleId: 'table-relationships',
      topicId: 'inner-joins',
      subtopicId: 'join-keys',
      confidence: 0.12,
      mappingReason: 'The content describes vector search, which has no clear location in the SQL Learning Path.',
      needsDecision: true,
    };
  }
  if (/inner join|left join|\bjoins?\b/.test(text)) {
    return {
      ...base,
      categoryId: 'querying-data',
      moduleId: 'table-relationships',
      topicId: 'inner-joins',
      subtopicId: 'join-keys',
      confidence: /inner join/.test(text) ? 0.96 : 0.72,
      mappingReason: 'Matched join terminology to Table Relationships.',
    };
  }
  if (/group by|having/.test(text)) {
    return {
      ...base,
      categoryId: 'querying-data',
      moduleId: 'summaries-and-groups',
      topicId: 'group-by',
      subtopicId: /having/.test(text) ? 'having-groups' : 'group-keys',
      confidence: 0.94,
      mappingReason: 'Matched GROUP BY/HAVING terminology to Grouping rows with GROUP BY.',
    };
  }
  if (/\b(count|sum|avg|aggregate)\w*\b/.test(text)) {
    return {
      ...base,
      categoryId: 'querying-data',
      moduleId: 'summaries-and-groups',
      topicId: 'aggregate-functions',
      subtopicId: /\b(count)\b/.test(text) ? 'counting-rows' : 'numeric-aggregates',
      confidence: 0.91,
      mappingReason: 'Matched aggregate-function terminology to Aggregate functions.',
    };
  }
  if (/where|is null|is not null|\bnull\b/.test(text)) {
    return {
      ...base,
      categoryId: 'sql-foundations',
      moduleId: 'relational-thinking',
      topicId: 'where-filters',
      subtopicId: /\bnull\b/.test(text) ? 'null-and-logic' : 'comparison-predicates',
      confidence: 0.91,
      mappingReason: 'Matched row-filtering or NULL logic to Filtering rows with WHERE.',
    };
  }
  if (/order by|sorting|sort direction/.test(text)) {
    return {
      ...base,
      categoryId: 'sql-foundations',
      moduleId: 'relational-thinking',
      topicId: 'order-limit',
      subtopicId: 'sort-direction',
      confidence: 0.9,
      mappingReason: 'Matched ordering terminology to Sorting and limiting results.',
    };
  }
  if (/\bselect\b|\bfrom\b/.test(text)) {
    return {
      ...base,
      categoryId: 'sql-foundations',
      moduleId: 'query-basics',
      topicId: 'query-structure',
      subtopicId: /\bfrom\b/.test(text) && !/\bselect\b/.test(text) ? 'from-source' : 'select-list',
      confidence: 0.84,
      mappingReason: 'Matched SELECT/FROM query structure terminology.',
    };
  }
  return {
    ...base,
    categoryId: 'sql-foundations',
    moduleId: 'query-basics',
    topicId: 'query-structure',
    subtopicId: 'select-list',
    confidence: 0.1,
    mappingReason: 'No reliable match in the existing Learning Path; choose a location or reject.',
    needsDecision: true,
  };
}

export function updateCandidateLocation(candidate: NoteCandidate, updates: Partial<Pick<NoteCandidate, 'categoryId' | 'moduleId' | 'topicId' | 'subtopicId'>>) {
  return {
    ...candidate,
    ...updates,
  };
}

export function isLikelyDuplicate(
  existing: { title: string; content: string; categoryId: string; moduleId: string; topicId: string; subtopicId: string }[],
  candidate: { title: string; content: string; categoryId: string; moduleId: string; topicId: string; subtopicId: string },
) {
  return existing.some((entry) => {
    const sameLocation =
      entry.categoryId === candidate.categoryId &&
      entry.moduleId === candidate.moduleId &&
      entry.topicId === candidate.topicId &&
      entry.subtopicId === candidate.subtopicId;
    const sameTitle = entry.title.trim().toLowerCase() === candidate.title.trim().toLowerCase();
    const sameContent = entry.content.trim().replace(/\s+/g, ' ').toLowerCase() === candidate.content.trim().replace(/\s+/g, ' ').toLowerCase();
    return (sameLocation && sameTitle) || sameContent;
  });
}
