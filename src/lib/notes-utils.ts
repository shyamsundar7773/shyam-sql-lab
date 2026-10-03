import { sqlLearningCategories } from '@/data/sqlLearningContent';
import type { Category, Module, Subtopic, Topic } from '@/types/learning-content';
import type {
  Note,
  NoteDraftInput,
  NoteImportItem,
  NoteLocation,
  NoteSource,
  NoteSourceKind,
  NoteSourceType,
} from '@/types/notes';

export type TaxonomyLookup = {
  categories: Map<string, Category>;
  modules: Map<string, Module>;
  topics: Map<string, Topic>;
  subtopics: Map<string, Subtopic>;
};

export function getTaxonomyLookup(): TaxonomyLookup {
  const categories = new Map<string, Category>();
  const modules = new Map<string, Module>();
  const topics = new Map<string, Topic>();
  const subtopics = new Map<string, Subtopic>();

  for (const category of sqlLearningCategories) {
    categories.set(category.id, category);
    for (const module of category.modules) {
      modules.set(module.id, module);
      for (const topic of module.topics) {
        topics.set(topic.id, topic);
        for (const subtopic of topic.subtopics) {
          subtopics.set(subtopic.id, subtopic);
        }
      }
    }
  }

  return { categories, modules, topics, subtopics };
}

export function getLocationLabel(location: NoteLocation): string {
  const { categories, modules, topics, subtopics } = getTaxonomyLookup();
  const category = categories.get(location.categoryId)?.title ?? 'Unknown category';
  const module = modules.get(location.moduleId)?.title ?? 'Unknown module';
  const topic = topics.get(location.topicId)?.title ?? 'Unknown topic';
  const subtopic = subtopics.get(location.subtopicId)?.title ?? 'Unknown subtopic';
  return `${category} / ${module} / ${topic} / ${subtopic}`;
}

export function getCategoryOptions() {
  return sqlLearningCategories.map((category) => ({ label: category.title, value: category.id }));
}

export function getModuleOptions(categoryId: string) {
  const category = sqlLearningCategories.find((item) => item.id === categoryId);
  return (category?.modules ?? []).map((module) => ({ label: module.title, value: module.id }));
}

export function getTopicOptions(moduleId: string) {
  for (const category of sqlLearningCategories) {
    const module = category.modules.find((item) => item.id === moduleId);
    if (!module) {
      continue;
    }
    return module.topics.map((topic) => ({ label: topic.title, value: topic.id }));
  }
  return [];
}

export function getSubtopicOptions(topicId: string) {
  for (const category of sqlLearningCategories) {
    for (const module of category.modules) {
      const topic = module.topics.find((item) => item.id === topicId);
      if (topic) {
        return topic.subtopics.map((subtopic) => ({ label: subtopic.title, value: subtopic.id }));
      }
    }
  }
  return [];
}

export function createManualNotePayload(
  input: NoteDraftInput & { id?: string },
): Note {
  const title = input.title.trim();
  const content = input.content.trim();
  const location = getTaxonomyLookup();
  const category = location.categories.get(input.categoryId);
  const module = location.modules.get(input.moduleId);
  const topic = location.topics.get(input.topicId);
  const subtopic = location.subtopics.get(input.subtopicId);
  if (!category || !module || !category.modules.some((item) => item.id === module.id)) {
    throw new Error('Choose a valid Category and Module.');
  }
  if (!topic || !module.topics.some((item) => item.id === topic.id)) {
    throw new Error('Choose a Topic that belongs to the selected Module.');
  }
  if (!subtopic || !topic.subtopics.some((item) => item.id === subtopic.id)) {
    throw new Error('Choose a Subtopic that belongs to the selected Topic.');
  }
  if (!title) {
    throw new Error('Enter a title for this note.');
  }
  if (!content) {
    throw new Error('Enter some content for this note.');
  }
  const timestamp = new Date().toISOString();
  return {
    id: input.id ?? `note-${Date.now()}`,
    user_id: input.userId,
    category_id: input.categoryId,
    module_id: input.moduleId,
    topic_id: input.topicId,
    subtopic_id: input.subtopicId,
    title,
    content,
    source_type: input.sourceType ?? 'Manual',
    source_id: input.sourceId ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function createNoteSourceRecord(
  input: {
    userId: string;
    sourceName: string;
    rawContent: string;
    sourceType?: NoteSourceKind;
    processingStatus?: NoteSource['processing_status'];
  },
): NoteSource {
  const status = input.processingStatus ?? 'Draft';
  const timestamp = new Date().toISOString();
  return {
    id: `source-${Date.now()}`,
    user_id: input.userId,
    source_name: input.sourceName.trim() || 'Imported SQL notes',
    source_type: input.sourceType ?? 'TXT',
    raw_content: input.rawContent,
    upload_date: timestamp,
    processing_status: status,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function filterNotes(
  notes: Note[],
  filters: {
    categoryId?: string;
    moduleId?: string;
    topicId?: string;
    subtopicId?: string;
    search?: string;
  } = {},
) {
  const query = filters.search?.trim().toLowerCase() ?? '';
  return notes.filter((note) => {
    const categoryMatches = !filters.categoryId || filters.categoryId === 'all' || note.category_id === filters.categoryId;
    const moduleMatches = !filters.moduleId || filters.moduleId === 'all' || note.module_id === filters.moduleId;
    const topicMatches = !filters.topicId || filters.topicId === 'all' || note.topic_id === filters.topicId;
    const subtopicMatches = !filters.subtopicId || filters.subtopicId === 'all' || note.subtopic_id === filters.subtopicId;
    const searchMatches =
      !query ||
      note.title.toLowerCase().includes(query) ||
      note.content.toLowerCase().includes(query) ||
      getLocationLabel({
        categoryId: note.category_id,
        moduleId: note.module_id,
        topicId: note.topic_id,
        subtopicId: note.subtopic_id,
      }).toLowerCase().includes(query);

    return categoryMatches && moduleMatches && topicMatches && subtopicMatches && searchMatches;
  });
}

export function searchNotes(notes: Note[], query: string) {
  return filterNotes(notes, { search: query });
}

export function detectDuplicateNote(notes: Note[], candidate: Pick<Note, 'title' | 'content' | 'category_id' | 'module_id' | 'topic_id' | 'subtopic_id'>) {
  return notes.some((note) => {
    const sameLocation =
      note.category_id === candidate.category_id &&
      note.module_id === candidate.module_id &&
      note.topic_id === candidate.topic_id &&
      note.subtopic_id === candidate.subtopic_id;
    const sameTitle = note.title.trim().toLowerCase() === candidate.title.trim().toLowerCase();
    const sameContent = note.content.trim().replace(/\s+/g, ' ').toLowerCase() === candidate.content.trim().replace(/\s+/g, ' ').toLowerCase();
    return (sameLocation && sameTitle) || sameContent;
  });
}

export function buildImportCandidates(rawText: string, sourceId: string): NoteImportItem[] {
  const chunks = rawText
    .split(/\n{2,}|\r\n\r\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 100);

  if (chunks.length === 0) {
    return [];
  }

  const matches = flattenTaxonomy();
  const candidateDrafts = chunks.map((chunk, index) => {
    const cleanChunk = chunk.replace(/^[-*#\d.)\s]+/, '').trim();
    const proposedTitle = cleanChunk.split(/\n|\.|:/)[0]?.trim().slice(0, 80) || `SQL Notes ${index + 1}`;
    const rankedMatches = matches
      .map((entry) => {
        const taxonomy = `${entry.category.title} ${entry.module.title} ${entry.topic.title} ${entry.subtopic.title}`;
        const score = scoreTaxonomyMatch(cleanChunk, taxonomy);
        return { entry, score };
      })
      .sort((left, right) => right.score - left.score);
    const best = rankedMatches[0];
    const clearMatch = best && best.score >= 0.16;
    const location = clearMatch ? best.entry : null;
    const content = cleanChunk;

    return {
      id: `import-item-${sourceId}-${index + 1}`,
      source_id: sourceId,
      raw_chunk: chunk,
      proposed_category_id: location?.category.id ?? 'sql-foundations',
      proposed_module_id: location?.module.id ?? 'query-basics',
      proposed_topic_id: location?.topic.id ?? 'query-structure',
      proposed_subtopic_id: location?.subtopic.id ?? 'select-list',
      proposed_title: proposedTitle,
      confidence: Math.min(0.99, best?.score ?? 0),
      mapping_reason: location
        ? `Matched against ${location.topic.title} / ${location.subtopic.title}.`
        : 'No clear match was found in the current Learning Path taxonomy.',
      duplicate_detected: false,
      review_status: location ? 'Pending' : 'Needs Decision',
      final_category_id: location?.category.id ?? null,
      final_module_id: location?.module.id ?? null,
      final_topic_id: location?.topic.id ?? null,
      final_subtopic_id: location?.subtopic.id ?? null,
      approved_by: null,
      approved_at: null,
      content,
    } satisfies NoteImportItem;
  });

  return candidateDrafts.map((candidate, index) => {
    const normalizedContent = candidate.content.trim().replace(/\s+/g, ' ').toLowerCase();
    const duplicate = candidateDrafts.slice(0, index).some((prior) =>
      prior.content.trim().replace(/\s+/g, ' ').toLowerCase() === normalizedContent,
    );
    return {
      ...candidate,
      duplicate_detected: duplicate,
      mapping_reason: duplicate
        ? `${candidate.mapping_reason} This chunk duplicates an earlier chunk in this source.`
        : candidate.mapping_reason,
    };
  });
}

export function makeMessySqlFixture() {
  return [
    '# SQL fundamentals / Query Basics\n\nSELECT is how I choose which columns to show. Prefer named columns, not `SELECT *`.\n\n- FROM tells the query where rows come from.\n- SELECT picks columns, for example `SELECT id, name FROM customers;`',
    'select is how I choose which columns to show. Prefer named columns, not SELECT *.\n\nThis is repeated from my other notebook.',
    'Filtering (WHERE): filter rows before grouping.\n\n1) Use `WHERE status = \'active\'`\n2) `ORDER BY created_at DESC` changes the displayed order.',
    'Joins / INNER JOIN\n\nAn INNER JOIN keeps rows whose join keys match.\n```sql\nSELECT c.name, o.id\nFROM customers c\nJOIN orders o ON o.customer_id = c.id;\n```',
    'joins -- left join\n\nLEFT JOIN preserves every row from the left table, even when no right side matches.',
    'GROUP BY and aggregates: COUNT, SUM, AVG summarize groups.\n\nSELECT region, COUNT(*) FROM sales GROUP BY region;',
    'NULL?? Comparisons to NULL are unknown; use IS NULL and IS NOT NULL.',
    'Subqueries are queries nested in another SELECT. I think this belongs to advanced SQL, but the map may not have that topic.',
    'Interview scraps: explain the difference between WHERE and HAVING. Mention that WHERE filters rows before aggregation.',
    'Vector database indexing notes — HNSW graph tuning, ef_search, and embedding dimensions.',
    'Sometimes JOIN is confusing.\n\nSometimes JOIN is confusing.',
    '### Loose heading with no clear path\n\nA few random notes I copied from a slide deck.',
  ].join('\n\n');
}

function scoreTaxonomyMatch(content: string, taxonomy: string) {
  const contentWords = new Set(normalizeWords(content));
  const taxonomyWords = normalizeWords(taxonomy);
  if (taxonomyWords.length === 0 || contentWords.size === 0) {
    return 0;
  }
  const exactPhrase = content.toLowerCase().includes(taxonomy.toLowerCase());
  const overlap = taxonomyWords.filter((word) => contentWords.has(word)).length;
  const topicAndSubtopic = taxonomyWords.slice(-4).filter((word) => contentWords.has(word)).length;
  return (exactPhrase ? 0.7 : 0) + overlap / taxonomyWords.length * 0.35 + topicAndSubtopic * 0.08;
}

function normalizeWords(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_ ]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function flattenTaxonomy() {
  return sqlLearningCategories.flatMap((category) =>
    category.modules.flatMap((module) =>
      module.topics.flatMap((topic) =>
        topic.subtopics.map((subtopic) => ({ category, module, topic, subtopic })),
      ),
    ),
  );
}

export function normalizeSourceType(value: string | undefined): NoteSourceType {
  return value === 'Official' || value === 'Imported' ? value : 'Manual';
}

export function getSourceLabel(sourceType: NoteSourceKind | NoteSourceType): string {
  return sourceType === 'Paste' ? 'Paste' : sourceType === 'TXT' ? 'TXT upload' : sourceType;
}

export function buildNoteReviewSummary(candidate: NoteImportItem) {
  return {
    title: candidate.proposed_title,
    location: getLocationLabel({
      categoryId: candidate.final_category_id ?? candidate.proposed_category_id,
      moduleId: candidate.final_module_id ?? candidate.proposed_module_id,
      topicId: candidate.final_topic_id ?? candidate.proposed_topic_id,
      subtopicId: candidate.final_subtopic_id ?? candidate.proposed_subtopic_id,
    }),
    confidence: candidate.confidence,
  };
}
