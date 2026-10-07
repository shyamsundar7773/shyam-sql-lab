import type { Subtopic, Topic } from '@/types/learning-content';
import type {
  RuntimeSequenceItem,
  TopicChatIntent,
  TopicChatRuntimeState,
  TopicLesson,
  TopicLessonProgress,
} from '@/types/learning-chat';

export type TopicLessonSection = {
  sectionIndex: number;
  title: string;
  focus: string[];
};

export type RuntimeLessonTarget = {
  sectionIndex: number;
  focusIndex: number | null;
  title: string;
  kind: 'section' | 'focus';
};

export const topicChatIncompleteNotice =
  '*This section was interrupted by the response limit and is incomplete. Finish this section before moving on.*';

export function createTopicLesson(topic: Topic, selectedSubtopic: Subtopic): TopicLesson {
  const initialDefinition = selectedSubtopic.definition ?? selectedSubtopic.explanation[0];
  return {
    title: selectedSubtopic.lessonTitle ?? selectedSubtopic.title,
    summary: selectedSubtopic.definition ? '' : initialDefinition ?? topic.summary,
    explanation: selectedSubtopic.definition
      ? [selectedSubtopic.definition]
      : selectedSubtopic.explanation,
    examples: selectedSubtopic.examples,
    keyPoints: selectedSubtopic.keyPoints,
    commonMistakes: selectedSubtopic.commonMistakes,
    practiceQuestions: selectedSubtopic.practiceQuestions,
    interviewQuestions: selectedSubtopic.interviewQuestions,
  };
}

export function createTopicLessonSections(subtopic: Subtopic): TopicLessonSection[] {
  const sections: Omit<TopicLessonSection, 'sectionIndex'>[] = [
    {
      title: `Core Idea: ${subtopic.title}`,
      focus: [
        `Explain what ${subtopic.title} means, why it exists, and the foundational understanding a beginner needs.`,
        'Develop the canonical definition into a clear explanation; use a familiar analogy or small illustration where helpful.',
        'Cover the core purpose and important context that belongs to this subtopic, without moving into another subtopic.',
      ],
    },
    {
      title: subtopic.keyPoints.length
        ? `Key Concepts: ${subtopic.title}`
        : `Where ${subtopic.title} Is Used`,
      focus: [
        ...subtopic.keyPoints.map((point) => `Explain this canonical key point: ${point}`),
        ...subtopic.explanation.slice(1).map((point) => `Develop this canonical explanation: ${point}`),
        'Connect the ideas to the current subtopic and explain how they fit together in practical use.',
      ],
    },
    {
      title: subtopic.examples[0]?.title
        ? `Working Through ${subtopic.examples[0].title}`
        : `Practical Example: ${subtopic.title}`,
      focus: [
        ...subtopic.examples.map((example) =>
          `Use and explain this canonical example${example.title ? ` (${example.title})` : ''}: ${example.code}`,
        ),
        ...subtopic.examples.map((example) => example.explanation).filter(Boolean),
        'If no canonical example is supplied, create one small, relevant example grounded in the current subtopic and explain each meaningful part.',
        'Use SQL syntax when it is appropriate to this subtopic.',
      ],
    },
  ];

  if (subtopic.commonMistakes.length || subtopic.interviewQuestions.length || subtopic.practiceQuestions.length) {
    sections.push({
      title: subtopic.commonMistakes.length
        ? `Common Mistakes and Good Practice: ${subtopic.title}`
        : `Applying ${subtopic.title}`,
      focus: [
        ...subtopic.commonMistakes.map((mistake) => `Explain how to avoid this mistake: ${mistake}`),
        ...subtopic.interviewQuestions.map((question) => `Address this interview perspective: ${question}`),
        ...subtopic.practiceQuestions.map((question) => `Use this practice prompt to reinforce the current subtopic: ${question}`),
        'Conclude with a concise takeaway for this subtopic only.',
      ],
    });
  }

  return sections.map((section, index) => ({ ...section, sectionIndex: index + 1 }));
}

export function getTopicLessonProgressFromReply(
  reply: string,
  subtopic: Subtopic,
): TopicLessonProgress | null {
  const match = /^## Lesson Section (\d+) of (\d+): ([^\r\n]+)\r?\n/.exec(reply);
  if (!match) {
    return null;
  }

  const sectionIndex = Number(match[1]);
  const sectionCount = Number(match[2]);
  const sections = createTopicLessonSections(subtopic);
  const section = sections[sectionIndex - 1];
  if (!section || sectionCount !== sections.length || section.title !== match[3]) {
    return null;
  }

  const sectionComplete = !reply.includes(topicChatIncompleteNotice);
  const runtimeItemMatch = reply.match(/CURRENT RUNTIME LEARNING ITEM:\s*\n?\s*(?:Item\s+\d+\s+of\s+\d+:\s*)?([^\r\n]+)/i);
  const focusTitle = runtimeItemMatch ? runtimeItemMatch[1]?.trim() ?? null : null;
  const focusIndex = focusTitle
    ? section.focus.findIndex((item) => normalizeLessonSelectorText(item) === normalizeLessonSelectorText(focusTitle)) + 1
    : null;
  const resolvedFocusIndex = focusIndex && focusIndex > 0 ? focusIndex : null;
  const nextFocusTitle =
    sectionComplete && resolvedFocusIndex !== null && resolvedFocusIndex < section.focus.length
      ? section.focus[resolvedFocusIndex]
      : null;
  const hasNextSection = sectionComplete && (nextFocusTitle !== null || sectionIndex < sections.length);
  const nextSectionTitle =
    sectionComplete && nextFocusTitle === null && sectionIndex < sections.length
      ? sections[sectionIndex]?.title ?? null
      : null;

  return {
    sectionIndex,
    sectionTitle: section.title,
    focusIndex: resolvedFocusIndex,
    focusTitle,
    sectionComplete,
    hasNextSection,
    nextSectionTitle,
    nextFocusTitle,
  };
}

export function resolveRuntimeTopicLessonSection(
  question: string,
  sections: TopicLessonSection[],
  currentSectionIndex: number,
  currentSectionComplete: boolean,
): number {
  const normalized = question.trim();
  if (!normalized) {
    return currentSectionIndex;
  }

  const text = normalized.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const explicitIndex = findExplicitLessonSectionIndex(text, sections);
  if (explicitIndex !== null) {
    return explicitIndex;
  }

  const explicitNestedItemIndex = findExplicitLessonItemIndex(normalized, sections);
  if (explicitNestedItemIndex !== null) {
    return explicitNestedItemIndex;
  }

  const continuationWords = /(continue|keep going|go on|move on|next item|next part|next section|next lesson|carry on|finish this|complete this|teach me the next)/i;
  if (continuationWords.test(normalized)) {
    if (!currentSectionComplete) {
      return currentSectionIndex;
    }
    return Math.min(currentSectionIndex + 1, sections.length);
  }

  return currentSectionIndex;
}

export function resolveRuntimeLessonTarget(
  question: string,
  sections: TopicLessonSection[],
  currentSectionIndex: number,
  currentSectionComplete: boolean,
): RuntimeLessonTarget {
  const selectedSectionIndex = resolveRuntimeTopicLessonSection(
    question,
    sections,
    currentSectionIndex,
    currentSectionComplete,
  );
  const section = sections[selectedSectionIndex - 1];
  if (!section) {
    return {
      sectionIndex: 1,
      focusIndex: null,
      title: sections[0]?.title ?? 'Lesson section',
      kind: 'section',
    };
  }

  const extractedTarget = extractRequestedRuntimeTarget(question);
  const focusIndex = resolveCurrentRuntimeFocusIndex(question, section);
  if (focusIndex !== null) {
    return {
      sectionIndex: selectedSectionIndex,
      focusIndex,
      title: section.focus[focusIndex - 1] ?? (extractedTarget && extractedTarget.length > 0 ? extractedTarget : section.title),
      kind: 'focus',
    };
  }

  if (extractedTarget && extractedTarget.length > 0) {
    return {
      sectionIndex: selectedSectionIndex,
      focusIndex: null,
      title: extractedTarget,
      kind: 'focus',
    };
  }

  if (section.focus.length > 0) {
    return {
      sectionIndex: selectedSectionIndex,
      focusIndex: 1,
      title: section.focus[0],
      kind: 'focus',
    };
  }

  return {
    sectionIndex: selectedSectionIndex,
    focusIndex: null,
    title: section.title,
    kind: 'section',
  };
}

function resolveCurrentRuntimeFocusIndex(
  question: string,
  section: TopicLessonSection | undefined,
): number | null {
  if (!section || !section.focus.length) {
    return null;
  }

  const normalized = question.trim();
  if (!normalized) {
    return null;
  }

  const allFocus = section.focus.map((focus, index) => ({
    index: index + 1,
    key: normalizeLessonSelectorText(focus),
    title: focus,
  }));

  const extractedTarget = extractRequestedRuntimeTarget(normalized);
  if (extractedTarget) {
    const exact = allFocus.find(({ key, title }) => {
      const haystacks = [key, normalizeLessonSelectorText(title), title].filter(Boolean);
      return haystacks.some((value) => value.includes(extractedTarget) || extractedTarget.includes(value));
    });
    if (exact) {
      return exact.index;
    }
  }

  const match = allFocus.find(({ key, title }) => {
    const haystacks = [key, normalizeLessonSelectorText(title), title].filter(Boolean);
    return haystacks.some((value) => normalized.toLowerCase().includes(value.toLowerCase()));
  });
  if (match) {
    return match.index;
  }

  return null;
}

function extractRequestedRuntimeTarget(question: string): string {
  const normalized = normalizeLessonSelectorText(question);
  if (!normalized) {
    return '';
  }

  const numberedPatterns = [
    /(?:i mean only this|mean only this|only this|just this|specifically|exactly)\s*(?:[-:—–])?\s*(.+)/i,
    /(?:only|just)\s+(?:this|that)\s*(?:[-:—–])?\s*(.+)/i,
    /(?:^|\s)(?:\d{1,2}|[a-z])(?:st|nd|rd|th)?\s*(?:[-:—–])?\s*([a-z0-9][\w\s&/,-]{0,80})$/i,
  ];

  for (const pattern of numberedPatterns) {
    const match = question.match(pattern);
    if (!match) {
      continue;
    }
    const candidate = normalizeLessonSelectorText(match[1] ?? '');
    if (candidate) {
      const stripped = candidate.replace(/^(?:\d{1,2}|[a-z])(?:st|nd|rd|th)?\s+/i, '');
      if (stripped) {
        return stripped;
      }
    }
  }

  const explicitMarker = /(i mean only this|mean only this|only this|just this|specifically|exactly)[\s\-:—–]*([\u0000-\u007f\s\u2776-\u277f]+)/i.exec(question);
  if (explicitMarker) {
    const candidate = normalizeLessonSelectorText(explicitMarker[2] ?? '');
    if (candidate) {
      return candidate.replace(/^(?:\d{1,2}|[a-z])(?:st|nd|rd|th)?\s+/i, '');
    }
  }

  const bulletPattern = /(?:^|\s)([a-z0-9][\w\s&/,-]{0,80})\s*(?:\u2776|\u2777|\u2778|\u2779|\u277a|\u277b|\u277c|\u277d|\u277e|\u277f)/u;
  const bulletMatch = normalized.match(bulletPattern);
  if (bulletMatch) {
    return bulletMatch[1].trim();
  }

  return normalized;
}

function normalizeLessonSelectorText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findExplicitLessonSectionIndex(
  text: string,
  sections: TopicLessonSection[],
): number | null {
  const normalized = normalizeLessonSelectorText(text);
  if (!normalized) {
    return null;
  }

  for (let index = 0; index < sections.length; index += 1) {
    const title = normalizeLessonSelectorText(sections[index].title);
    if (!title) {
      continue;
    }

    if (normalized.includes(title)) {
      return index + 1;
    }

    const shortTitle = title.replace(/^(core idea|key concepts|working through|common mistakes and good practice|applying)\s*:\s*/, '');
    if (shortTitle && normalized.includes(shortTitle)) {
      return index + 1;
    }
  }

  const ordinals = new Map([
    ['first', 1], ['second', 2], ['third', 3], ['fourth', 4], ['fifth', 5],
    ['sixth', 6], ['seventh', 7], ['eighth', 8], ['ninth', 9], ['tenth', 10],
  ]);

  for (const [word, value] of ordinals.entries()) {
    const directMatch = new RegExp(
      `(?:start with|teach me|give me|show me|go to|open|select|pick|item|section|part|lesson)\\s+(?:the\\s+)?${word}(?:\\s|$)|(?:^|\\s)${word}\\s+(?:item|section|part|lesson)(?:\\s|$)`,
      'i',
    );
    if (directMatch.test(normalized)) {
      return value;
    }
  }

  const numericMatch = normalized.match(
    /(?:start with|teach me|give me|show me|go to|move on to|open|select|pick|item|section|part|lesson)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s|$)/i,
  );
  if (numericMatch) {
    const value = Number(numericMatch[1]);
    if (value >= 1 && value <= sections.length) {
      return value;
    }
  }

  const ordinalSuffixMatch = normalized.match(/(?:^|\s)(\d{1,2})(?:st|nd|rd|th)\s+(?:item|section|part|lesson)/i);
  if (ordinalSuffixMatch) {
    const value = Number(ordinalSuffixMatch[1]);
    if (value >= 1 && value <= sections.length) {
      return value;
    }
  }

  const letterMatch = normalized.match(
    /(?:start with|teach me|give me|show me|go to|move on to|open|select|pick|item|section|part|lesson)\s+(?:the\s+)?([a-z])(?:\s|$)/i,
  );
  if (letterMatch) {
    const value = letterMatch[1].toLowerCase().charCodeAt(0) - 'a'.charCodeAt(0) + 1;
    if (value >= 1 && value <= sections.length) {
      return value;
    }
  }

  return null;
}

function findExplicitLessonItemIndex(
  text: string,
  sections: TopicLessonSection[],
): number | null {
  const normalized = normalizeLessonSelectorText(text);
  if (!normalized) {
    return null;
  }

  const nestedItems = sections.flatMap((section) => {
    const focusItems = Array.isArray(section.focus) ? section.focus : [];
    return focusItems.map((focus, index) => ({
      sectionIndex: section.sectionIndex,
      itemIndex: index + 1,
      key: normalizeLessonSelectorText(focus),
      title: focus,
    }));
  });

  const directMatch = nestedItems.find(({ key }) => {
    if (!key) {
      return false;
    }
    return normalized.includes(key) || key.includes(normalized) || normalized.includes(key.split(/\s+/).slice(0, 6).join(' '));
  });
  if (directMatch) {
    return directMatch.sectionIndex;
  }

  const markerPatterns = [
    /(?:only|just|i mean only this|mean only this|specifically|exactly)\s+.*?(?:\d{1,2}|[a-z])(?:st|nd|rd|th)?\s*(?:[\-–—:])?\s*([\w\s&/,-]+?)(?:\s|$)/i,
    /(?:only|just|i mean only this|mean only this|specifically|exactly)\s+(?:this|that)\s*[-:]*\s*(.+)/i,
  ];
  for (const pattern of markerPatterns) {
    const match = normalized.match(pattern);
    if (!match) {
      continue;
    }
    const candidate = match[1]?.trim();
    if (!candidate) {
      continue;
    }
    const exact = nestedItems.find(({ key, title }) => {
      const haystacks = [key, normalizeLessonSelectorText(title), title].filter(Boolean);
      return haystacks.some((value) => value.includes(candidate) || candidate.includes(value));
    });
    if (exact) {
      return exact.sectionIndex;
    }
  }

  const numberedPattern = /(?:^|\s)(\d{1,2})(?:st|nd|rd|th)?\s*(?:[-:])?\s*([a-z0-9][\w\s&/,-]{0,80})/i;
  const numberedMatch = normalized.match(numberedPattern);
  if (numberedMatch) {
    const target = numberedMatch[2]?.trim();
    const item = nestedItems.find(({ key, title }) => {
      const haystacks = [key, normalizeLessonSelectorText(title), title].filter(Boolean);
      return haystacks.some((value) => value.includes(target) || target.includes(value));
    });
    if (item) {
      return item.sectionIndex;
    }
  }

  return null;
}

export function truncateTopicChatHistoryContent(content: string, maximumLength: number): string {
  if (maximumLength <= 0) {
    return '';
  }
  if (content.length <= maximumLength) {
    return content;
  }

  const sectionHeading = /^## Lesson Section \d+ of \d+: [^\r\n]+\r?\n\r?\n/.exec(content)?.[0];
  if (!sectionHeading || sectionHeading.length >= maximumLength) {
    return content.slice(-maximumLength);
  }
  return `${sectionHeading}${content.slice(-(maximumLength - sectionHeading.length))}`;
}

export function createTopicChatRuntimeState(
  categoryId: string,
  topicId: string,
  subtopicId: string,
): TopicChatRuntimeState {
  return {
    categoryId,
    topicId,
    subtopicId,
    sequence: [],
    currentPath: null,
    completion: 'not-started',
    responseIncomplete: false,
    sequenceFinished: false,
    latestIntent: 'ordinary-topic-question',
  };
}

export function classifyTopicChatIntent(
  question: string,
  runtimeState: TopicChatRuntimeState | null,
  lessonAction?: 'continue-runtime-item' | 'finish-runtime-item',
): TopicChatIntent {
  const text = question.trim();
  if (isRuntimeSequenceGenerationRequest(text)) {
    return 'sequence-generation';
  }
  if (lessonAction === 'continue-runtime-item' || lessonAction === 'finish-runtime-item') {
    return 'continue-runtime-item';
  }
  if (runtimeState && runtimeState.sequence.length) {
    const targetPath = resolveRuntimeItemPath(text, runtimeState.sequence);
    const selectionCommand = /\b(?:start with|begin with|move on to|go to|select|choose|pick|teach me|i mean only this|only this|just this)\b/i.test(text);
    if (
      (targetPath !== null && selectionCommand) ||
      isRuntimeItemSelectionRequest(text)
    ) {
      return 'explicit-runtime-item-selection';
    }
  }
  if (
    runtimeState?.sequence.length &&
    /\b(?:continue|keep going|go on|next(?:\s+(?:item|part|one))?|move on|finish this|complete this|carry on|resume)\b/i.test(text)
  ) {
    return 'continue-runtime-item';
  }
  return 'ordinary-topic-question';
}

export function isRuntimeSequenceGenerationRequest(question: string): boolean {
  return /\b(?:learning\s+)?(?:sequence|roadmap|study\s+plan|learning\s+path)\b/i.test(question) &&
    /\b(?:give|create|make|build|suggest|design|show|provide|generate|plan)\b/i.test(question);
}

export function resolveRuntimeItemPath(
  question: string,
  sequence: RuntimeSequenceItem[],
): number[] | null {
  const normalizedQuestion = normalizeLessonSelectorText(question);
  if (!normalizedQuestion || !sequence.length) {
    return null;
  }

  const flattened = sequence.flatMap((item, index) => flattenAllRuntimeItems(item, [index]));
  const titleMatch = flattened.find(({ item }) => {
    const title = normalizeLessonSelectorText(item.title);
    return title.length > 0 &&
      (normalizedQuestion.includes(title) || title.includes(normalizedQuestion));
  });
  if (titleMatch) {
    return titleMatch.path;
  }

  if (!isRuntimeItemSelectionRequest(question)) {
    return null;
  }

  const index = findRuntimeOrdinal(question);
  if (index === null || index >= sequence.length) {
    return null;
  }
  const shouldSelectFirstLeaf = /\b(?:item|start with)\b/i.test(question);
  return shouldSelectFirstLeaf
    ? getFirstRuntimeTeachingItemPath(sequence[index], [index])
    : [index];
}

export function getRuntimeSequenceItem(
  sequence: RuntimeSequenceItem[],
  path: number[] | null,
): RuntimeSequenceItem | null {
  if (!path?.length) {
    return null;
  }
  let items = sequence;
  let selected: RuntimeSequenceItem | undefined;
  for (const index of path) {
    selected = items[index];
    if (!selected) {
      return null;
    }
    items = selected.items ?? [];
  }
  return selected ?? null;
}

export function getNextRuntimeItemPath(
  sequence: RuntimeSequenceItem[],
  currentPath: number[] | null,
): number[] | null {
  if (!currentPath?.length) {
    return sequence.length ? [0] : null;
  }
  const current = getRuntimeSequenceItem(sequence, currentPath);
  if (!current) {
    return null;
  }
  const orderedPaths = sequence.flatMap((item, index) => flattenRuntimeItems(item, [index]).map(({ path }) => path));
  const currentIndex = orderedPaths.findIndex((path) =>
    path.length === currentPath.length && path.every((part, index) => part === currentPath[index]),
  );
  return currentIndex >= 0 ? orderedPaths[currentIndex + 1] ?? null : null;
}

export function getLatestAssistantMessage<T extends { role: string }>(
  messages: T[],
): T | null {
  return [...messages].reverse().find((message) => message.role === 'assistant') ?? null;
}

export function canContinueRuntimeItem(state: TopicChatRuntimeState): boolean {
  return state.sequence.length > 0 &&
    state.currentPath !== null &&
    state.completion === 'complete' &&
    !state.responseIncomplete &&
    state.latestIntent !== 'ordinary-topic-question' &&
    getNextRuntimeItemPath(state.sequence, state.currentPath) !== null;
}

export function shouldShowRuntimeContinue(
  state: TopicChatRuntimeState,
  isLatestAssistantResponse: boolean,
  isLoading: boolean,
  hasError: boolean,
): boolean {
  if (
    !isLatestAssistantResponse ||
    isLoading ||
    hasError ||
    getRuntimeSequenceItem(state.sequence, state.currentPath) === null
  ) {
    return false;
  }
  if (state.completion === 'incomplete' && state.responseIncomplete) {
    return true;
  }
  return canContinueRuntimeItem(state);
}

export function isValidTopicChatRuntimeState(
  value: unknown,
  categoryId: string,
  topicId: string,
  subtopicId: string,
): value is TopicChatRuntimeState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const state = value as Partial<TopicChatRuntimeState>;
  return state.categoryId === categoryId &&
    state.topicId === topicId &&
    state.subtopicId === subtopicId &&
    Array.isArray(state.sequence) &&
    state.sequence.length <= 15 &&
    state.sequence.every((item) => isRuntimeSequenceItem(item)) &&
    (state.currentPath === null ||
      (Array.isArray(state.currentPath) && state.currentPath.length > 0 && state.currentPath.length <= 4 &&
        state.currentPath.every((index) => Number.isInteger(index) && index >= 0) &&
        Boolean(getRuntimeSequenceItem(state.sequence, state.currentPath)))) &&
    (state.completion === 'not-started' ||
      state.completion === 'incomplete' ||
      state.completion === 'complete') &&
    typeof state.responseIncomplete === 'boolean' &&
    (state.sequenceFinished === undefined || typeof state.sequenceFinished === 'boolean') &&
    (!state.responseIncomplete || state.completion === 'incomplete') &&
    (state.completion !== 'complete' || (state.currentPath !== null && !state.responseIncomplete)) &&
    (state.latestIntent === 'sequence-generation' ||
      state.latestIntent === 'explicit-runtime-item-selection' ||
      state.latestIntent === 'continue-runtime-item' ||
      state.latestIntent === 'ordinary-topic-question');
}

function isRuntimeSequenceItem(value: unknown, depth = 0): value is RuntimeSequenceItem {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    depth <= 3 &&
    typeof (value as RuntimeSequenceItem).id === 'string' &&
    (value as RuntimeSequenceItem).id.trim().length > 0 &&
    (value as RuntimeSequenceItem).id.length <= 160 &&
    typeof (value as RuntimeSequenceItem).title === 'string' &&
    (value as RuntimeSequenceItem).title.length <= 160 &&
    (value as RuntimeSequenceItem).title.trim().length > 0 &&
    (!('items' in value) ||
      (Array.isArray((value as RuntimeSequenceItem).items) &&
        (value as RuntimeSequenceItem).items!.length <= 15 &&
        (value as RuntimeSequenceItem).items!.every((item) => isRuntimeSequenceItem(item, depth + 1)))));
}

function flattenRuntimeItems(
  item: RuntimeSequenceItem,
  path: number[],
): { item: RuntimeSequenceItem; path: number[] }[] {
  if (!item.items?.length) {
    return [{ item, path }];
  }
  return item.items.flatMap((child, index) => flattenRuntimeItems(child, [...path, index]));
}

function flattenAllRuntimeItems(
  item: RuntimeSequenceItem,
  path: number[],
): { item: RuntimeSequenceItem; path: number[] }[] {
  return [
    { item, path },
    ...(item.items?.flatMap((child, index) =>
      flattenAllRuntimeItems(child, [...path, index]),
    ) ?? []),
  ];
}

function isRuntimeItemSelectionRequest(question: string): boolean {
  return /^\s*(?:\d{1,2}(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/i.test(question) ||
    /\b(?:start|begin)\s+with\s+(?:the\s+)?\d{1,2}\b/i.test(question) ||
    /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th)?)\s+(?:part|item|topic|step|one)\b/i.test(question) ||
    /\b(?:part|item|topic|step)\s+[a-z]\b/i.test(question) ||
    /(?:\u2776|\u2777|\u2778|\u2779|\u277a|\u277b|\u277c|\u277d|\u277e|\u277f)/u.test(question);
}

function findRuntimeOrdinal(question: string): number | null {
  const normalized = question.toLowerCase();
  const words = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
  const wordIndex = words.findIndex((word) => new RegExp(`\\b${word}\\b`).test(normalized));
  if (wordIndex >= 0) {
    return wordIndex;
  }
  const numeric = normalized.match(/(?:\b(?:start|begin)\s+with\s+(?:the\s+)?)?\b(\d{1,2})(?:st|nd|rd|th)?(?:\s*(?:part|item|topic|step)\b|\s|$)/);
  if (numeric) {
    const value = Number(numeric[1]);
    return value > 0 ? value - 1 : null;
  }
  const letter = normalized.match(/\b(?:part|item|topic|step)\s+([a-z])\b/);
  if (letter) {
    return letter[1].charCodeAt(0) - 'a'.charCodeAt(0);
  }
  const glyph = question.match(/[\u2776-\u277f]/u)?.[0];
  return glyph ? glyph.codePointAt(0)! - 0x2775 : null;
}

function getFirstRuntimeTeachingItemPath(
  item: RuntimeSequenceItem,
  path: number[],
): number[] {
  if (!item.items?.length) {
    return path;
  }
  return getFirstRuntimeTeachingItemPath(item.items[0], [...path, 0]);
}
