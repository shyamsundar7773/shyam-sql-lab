import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const taxonomyPath = path.join(projectRoot, 'src/data/learningPath/taxonomy.json');
const registryPath = path.join(
  projectRoot,
  'src/data/learningPath/content/approved-content.generated.json',
);
const sectionNames = [
  'Explanation',
  'Examples',
  'Key Points',
  'Common Mistakes',
  'Interview Relevance',
  'Practice Guidance',
];
const headerNames = [
  'CATEGORY',
  'CATEGORY_ID',
  'TOPIC',
  'TOPIC_ID',
  'SUBTOPIC',
  'SUBTOPIC_ID',
];

export function parseLearningContentText(text, fileName = '<input>') {
  const errors = [];
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const contentMarkers = lines
    .map((line, index) => line.trim() === 'CONTENT:' ? index : -1)
    .filter((index) => index >= 0);
  if (contentMarkers.length > 1) {
    return { entry: null, errors: [`${fileName}: expected exactly one CONTENT: marker.`] };
  }

  const sectionNamesByTitle = new Map(sectionNames.map((name) => [name, name]));
  const contentStart = contentMarkers[0] ?? lines.findIndex((line) =>
    sectionNamesByTitle.has(line.trim().replace(/:$/, '')),
  );
  if (contentStart < 0) {
    return { entry: null, errors: [`${fileName}: expected CONTENT: or a lesson content section.`] };
  }
  const headers = new Map();
  for (const [index, line] of lines.slice(0, contentStart).entries()) {
    if (!line.trim()) {
      continue;
    }
    const match = line.match(/^([A-Z_]+):\s*(.*?)\s*$/);
    if (!match || !headerNames.includes(match[1])) {
      errors.push(`${fileName}:${index + 1}: unexpected header line.`);
      continue;
    }
    if (headers.has(match[1])) {
      errors.push(`${fileName}:${index + 1}: duplicate ${match[1]} header.`);
      continue;
    }
    headers.set(match[1], match[2]);
  }

  for (const name of headerNames) {
    if (!headers.get(name)) {
      errors.push(`${fileName}: missing or empty ${name} header.`);
    }
  }

  const sections = new Map();
  let currentSection = null;
  const sectionStart = contentMarkers.length === 0 ? contentStart : contentStart + 1;
  for (const [offset, rawLine] of lines.slice(sectionStart).entries()) {
    const line = rawLine.trimEnd();
    const heading = line.trim().match(/^\[([^\]]+)\]$/) ??
      (contentMarkers.length === 0
        ? (() => {
            const title = line.trim().replace(/:$/, '');
            const section = sectionNamesByTitle.get(title);
            return section ? [line, section] : null;
          })()
        : null);
    if (heading) {
      if (!sectionNames.includes(heading[1])) {
        errors.push(`${fileName}:${contentStart + offset + 2}: unknown section [${heading[1]}].`);
        currentSection = null;
      } else if (sections.has(heading[1])) {
        errors.push(`${fileName}:${contentStart + offset + 2}: duplicate section [${heading[1]}].`);
        currentSection = null;
      } else {
        currentSection = heading[1];
        sections.set(currentSection, []);
      }
      continue;
    }
    if (!line.trim()) {
      if (currentSection) {
        sections.get(currentSection).push('');
      }
      continue;
    }
    if (!currentSection) {
      errors.push(`${fileName}:${contentStart + offset + 2}: content must be inside a named section.`);
      continue;
    }
    sections.get(currentSection).push(line);
  }

  for (const name of sectionNames) {
    const section = sections.get(name);
    if (!section || !section.some((line) => line.trim())) {
      errors.push(`${fileName}: required section [${name}] is missing or empty.`);
    }
  }

  if (errors.length > 0) {
    return { entry: null, errors };
  }

  const examples = contentMarkers.length === 0
    ? parseSimpleExamples(sections.get('Examples'))
    : parseExamples(sections.get('Examples'), fileName, errors);
  const explanation = parseParagraphs(sections.get('Explanation'));
  const content = {
    explanation,
    examples,
    keyPoints: parseList(sections.get('Key Points')),
    commonMistakes: parseList(sections.get('Common Mistakes')),
    interviewQuestions: parseList(sections.get('Interview Relevance')),
    practiceQuestions: parseList(sections.get('Practice Guidance')),
  };
  if (errors.length > 0) {
    return { entry: null, errors };
  }
  return {
    entry: {
      category: headers.get('CATEGORY'),
      categoryId: headers.get('CATEGORY_ID'),
      topic: headers.get('TOPIC'),
      topicId: headers.get('TOPIC_ID'),
      subtopic: headers.get('SUBTOPIC'),
      subtopicId: headers.get('SUBTOPIC_ID'),
      content,
    },
    errors: [],
  };
}

export function parseLearningCourseText(text, fileName = '<input>') {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const errors = [];
  const courseHeaders = lines
    .map((line, index) => ({ line: line.trim(), index }))
    .filter(({ line }) => line.startsWith('COURSE:'));
  const lessonMarkers = lines
    .map((line, index) => line.trim() === '=== LESSON ===' ? index : -1)
    .filter((index) => index >= 0);

  if (courseHeaders.length !== 1 || !/^COURSE:\s*\S/.test(courseHeaders[0]?.line ?? '')) {
    errors.push(`${fileName}: expected exactly one non-empty COURSE: header.`);
  }
  if (lessonMarkers.length === 0) {
    errors.push(`${fileName}: expected at least one === LESSON === block.`);
  }
  if (courseHeaders.length === 1 && lessonMarkers.length > 0) {
    const preamble = lines.slice(0, lessonMarkers[0]).filter((line) => line.trim());
    if (preamble.length !== 1 || preamble[0]?.trim() !== courseHeaders[0]?.line) {
      errors.push(`${fileName}: only COURSE: metadata may appear before the first lesson.`);
    }
  }
  if (errors.length > 0) {
    return { courseTitle: null, entries: [], errors };
  }

  const boundaries = [...lessonMarkers, lines.length];
  const entries = [];
  for (let index = 0; index < lessonMarkers.length; index += 1) {
    const start = lessonMarkers[index] + 1;
    const end = boundaries[index + 1];
    const block = lines.slice(start, end);
    const lessonHeaderIndex = block.findIndex((line) => line.trim());
    const lessonHeader = block[lessonHeaderIndex]?.trim() ?? '';
    const lessonMatch = lessonHeader.match(/^LESSON:\s*(\S.*)$/);
    if (!lessonMatch) {
      errors.push(`${fileName}:${start + lessonHeaderIndex + 1}: each block must start with LESSON: <title>.`);
      continue;
    }

    const lessonName = lessonMatch[1].trim();
    const contentText = block
      .slice(lessonHeaderIndex + 1)
      .join('\n');
    const parsed = parseLearningContentText(contentText, `${fileName} [${lessonName}]`);
    errors.push(...parsed.errors);
    if (parsed.entry) {
      entries.push(parsed.entry);
    }
  }

  return {
    courseTitle: courseHeaders[0].line.slice('COURSE:'.length).trim(),
    entries,
    errors,
  };
}

function parseParagraphs(lines) {
  return lines.join('\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function parseList(lines) {
  return lines.map((line) => line.trim().replace(/^[-*]\s+/, ''))
    .filter(Boolean);
}

function parseSimpleExamples(lines) {
  return lines.join('\n')
    .split(/\n\s*\n/)
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code, index) => ({
      title: `Example ${index + 1}`,
      explanation: '',
      code,
    }));
}

function parseExamples(lines, fileName, errors) {
  const blocks = [];
  let current = { TITLE: [], EXPLANATION: [], CODE: [] };
  let activeField = null;
  const flush = () => {
    if (!Object.values(current).some((value) => value.join('\n').trim())) {
      return;
    }
    const example = Object.fromEntries(
      Object.entries(current).map(([key, value]) => [key, value.join('\n').trim()]),
    );
    for (const key of ['TITLE', 'EXPLANATION', 'CODE']) {
      if (!example[key]) {
        errors.push(`${fileName}: each example needs TITLE, EXPLANATION, and CODE fields.`);
      }
    }
    blocks.push({
      title: example.TITLE,
      explanation: example.EXPLANATION,
      code: example.CODE,
    });
    current = { TITLE: [], EXPLANATION: [], CODE: [] };
    activeField = null;
  };

  for (const line of lines) {
    if (line.trim() === '---') {
      flush();
      continue;
    }
    const field = line.match(/^(TITLE|EXPLANATION|CODE):\s*(.*)$/);
    if (field) {
      activeField = field[1];
      current[activeField].push(field[2]);
      continue;
    }
    if (!activeField) {
      if (line.trim()) {
        errors.push(`${fileName}: example text must begin with TITLE:, EXPLANATION:, or CODE:.`);
      }
      continue;
    }
    current[activeField].push(line);
  }
  flush();
  if (blocks.length === 0) {
    errors.push(`${fileName}: [Examples] must contain at least one complete example.`);
  }
  return blocks;
}

export function validateLearningContentEntry(entry, taxonomy, fileName = '<input>') {
  const category = taxonomy.find((item) => item.id === entry.categoryId);
  if (!category) {
    return [`${fileName}: unknown CATEGORY_ID "${entry.categoryId}".`];
  }
  if (entry.category !== category.title) {
    return [`${fileName}: CATEGORY must be "${category.title}" for CATEGORY_ID "${category.id}".`];
  }
  const topic = category.topics.find((item) => item.id === entry.topicId);
  if (!topic) {
    return [`${fileName}: TOPIC_ID "${entry.topicId}" does not belong to CATEGORY_ID "${category.id}".`];
  }
  if (entry.topic !== topic.title) {
    return [`${fileName}: TOPIC must be "${topic.title}" for TOPIC_ID "${topic.id}".`];
  }
  const subtopic = topic.subtopics.find((item) => item.id === entry.subtopicId);
  if (!subtopic) {
    return [`${fileName}: SUBTOPIC_ID "${entry.subtopicId}" does not belong to TOPIC_ID "${topic.id}".`];
  }
  if (entry.subtopic !== subtopic.title) {
    return [`${fileName}: SUBTOPIC must be "${subtopic.title}" for SUBTOPIC_ID "${subtopic.id}".`];
  }
  return [];
}

export function updateContentRegistry(
  existingEntries,
  incomingEntries,
  replace = false,
  legacyContent = {},
) {
  const errors = [];
  const updated = existingEntries.map((entry) => ({ ...entry }));
  const seenIds = new Set();
  const signatures = new Map(
    existingEntries.map((entry) => [contentSignature(entry.content), entry.subtopicId]),
  );

  for (const entry of incomingEntries) {
    if (seenIds.has(entry.subtopicId)) {
      errors.push(`Duplicate SUBTOPIC_ID "${entry.subtopicId}" in the import files.`);
      continue;
    }
    seenIds.add(entry.subtopicId);
    const signature = contentSignature(entry.content);
    const duplicateContentId = signatures.get(signature);
    if (duplicateContentId && duplicateContentId !== entry.subtopicId) {
      errors.push(`Content duplicates the approved entry for SUBTOPIC_ID "${duplicateContentId}".`);
      continue;
    }
    const existingIndex = updated.findIndex((item) => item.subtopicId === entry.subtopicId);
    const legacyTopic = legacyContent[entry.topicId];
    const hasLegacyContent = Boolean(legacyTopic?.subtopics?.[entry.subtopicId]);
    if (existingIndex >= 0 && !replace) {
      errors.push(
        `SUBTOPIC_ID "${entry.subtopicId}" already has approved content; pass --replace to update it.`,
      );
      continue;
    }
    if (existingIndex < 0 && hasLegacyContent && !replace) {
      errors.push(
        `SUBTOPIC_ID "${entry.subtopicId}" already has legacy lesson content; pass --replace to override it.`,
      );
      continue;
    }
    if (hasLegacyContent &&
      contentSignature(legacyTopic.subtopics[entry.subtopicId]) === signature) {
      errors.push(`SUBTOPIC_ID "${entry.subtopicId}" already contains this exact legacy content.`);
      continue;
    }
    if (existingIndex >= 0 && contentSignature(updated[existingIndex].content) === signature) {
      errors.push(`SUBTOPIC_ID "${entry.subtopicId}" already contains this exact content.`);
      continue;
    }
    if (existingIndex >= 0) {
      updated[existingIndex] = entry;
    } else {
      updated.push(entry);
    }
    signatures.set(signature, entry.subtopicId);
  }

  return { entries: updated, errors };
}

function contentSignature(value) {
  if (Array.isArray(value)) {
    return `[${value.map(contentSignature).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${contentSignature(value[key])}`,
    ).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function runCli(args) {
  const replace = args.includes('--replace');
  const courseMode = args.includes('--course');
  const options = args.filter((argument) => argument.startsWith('--'));
  const unknownOptions = options.filter((argument) => argument !== '--replace' && argument !== '--course');
  if (unknownOptions.length > 0) {
    throw new Error(`Unknown option(s): ${unknownOptions.join(', ')}.`);
  }
  const inputPaths = args.filter((argument) => !argument.startsWith('--'));
  if (inputPaths.length === 0) {
    throw new Error('Usage: node scripts/import-learning-content.mjs [--replace] [--course] <file.txt> [...]');
  }
  if (courseMode && inputPaths.length !== 1) {
    throw new Error('Course mode accepts exactly one structured course TXT file.');
  }

  const taxonomy = JSON.parse(await readFile(taxonomyPath, 'utf8'));
  const registry = JSON.parse(await readFile(registryPath, 'utf8'));
  const legacyContent = JSON.parse(await readFile(
    path.join(projectRoot, 'src/data/learningPath/content/legacy-content.json'),
    'utf8',
  ));
  if (registry.version !== 1 || !Array.isArray(registry.entries)) {
    throw new Error('The approved content registry has an unsupported format.');
  }

  const incoming = [];
  const errors = [];
  for (const inputPath of inputPaths) {
    const resolvedPath = path.resolve(inputPath);
    try {
      const text = await readFile(resolvedPath, 'utf8');
      if (courseMode) {
        const parsed = parseLearningCourseText(text, inputPath);
        errors.push(...parsed.errors);
        for (const entry of parsed.entries) {
          errors.push(...validateLearningContentEntry(entry, taxonomy, inputPath));
          incoming.push(entry);
        }
        continue;
      }
      const parsed = parseLearningContentText(text, inputPath);
      errors.push(...parsed.errors);
      if (!parsed.entry) {
        continue;
      }
      errors.push(...validateLearningContentEntry(parsed.entry, taxonomy, inputPath));
      incoming.push(parsed.entry);
    } catch (error) {
      errors.push(`${inputPath}: ${error instanceof Error ? error.message : 'could not read file.'}`);
    }
  }
  const officialPaths = new Set(taxonomy.flatMap((category) =>
    category.topics.flatMap((topic) =>
      topic.subtopics.map((subtopic) => `${category.id}:${topic.id}:${subtopic.id}`),
    ),
  ));
  const currentEntries = registry.entries.filter((entry) =>
    officialPaths.has(`${entry.categoryId}:${entry.topicId}:${entry.subtopicId}`),
  );
  const updated = updateContentRegistry(currentEntries, incoming, replace, legacyContent);
  errors.push(...updated.errors);
  if (errors.length > 0) {
    throw new Error(errors.join('\n'));
  }

  const outputPath = `${registryPath}.tmp`;
  try {
    await writeFile(outputPath, `${JSON.stringify({ version: 1, entries: updated.entries }, null, 2)}\n`, 'utf8');
    await rename(outputPath, registryPath);
  } catch (error) {
    throw new Error(`Could not safely update the approved content registry: ${
      error instanceof Error ? error.message : 'file write failed.'
    }`);
  }
  return { count: incoming.length, courseMode };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli(process.argv.slice(2))
    .then(({ count, courseMode }) => {
      console.log(courseMode
        ? `Validated and integrated ${count} lesson(s) from one structured course.`
        : `Validated and integrated ${count} learning-content file(s).`);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Learning content import failed.');
      process.exitCode = 1;
    });
}
