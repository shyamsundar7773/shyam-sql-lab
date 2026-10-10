import { sqlLearningCategories } from "@/data/sqlLearningContent";
import type { MyPracticedNote } from "@/lib/my-practiced-notes";
import type { PracticeQuestionContent, PracticeTable } from "@/types/sql-practice";

const maximumSchemaJsonLength = 100_000;
const schemaIdentifierPattern = /^[A-Za-z_][A-Za-z0-9_]{0,47}$/;
const schemaTypes = new Set(["TEXT", "INTEGER", "REAL", "BOOLEAN"]);

export const practiceSchemaSetupError =
  "Add a valid exercise schema as JSON (1-4 tables with column definitions and seed rows) before running SQL.";

export function parsePracticeTablesJson(schemaJson: string): PracticeTable[] {
  if (!schemaJson.trim() || schemaJson.length > maximumSchemaJsonLength) {
    throw new Error(practiceSchemaSetupError);
  }

  let value: unknown;
  try {
    value = JSON.parse(schemaJson) as unknown;
  } catch {
    throw new Error("Exercise schema must be valid JSON. Add tables, columns, and seed rows before running SQL.");
  }

  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 4
  ) {
    throw new Error(practiceSchemaSetupError);
  }

  const tableNames = new Set<string>();
  let totalRows = 0;
  for (const table of value) {
    if (
      !isPracticeTable(table) ||
      tableNames.has(table.name.toLowerCase()) ||
      (totalRows += table.rows.length) > 70
    ) {
      throw new Error(practiceSchemaSetupError);
    }
    tableNames.add(table.name.toLowerCase());
  }
  return value;
}

export function buildPracticeQuestionContext(
  note: Pick<MyPracticedNote, "categoryId" | "topicId" | "subtopicId">,
  questionText: string | undefined,
  tables: PracticeTable[],
): PracticeQuestionContent {
  const category = sqlLearningCategories.find((item) => item.id === note.categoryId) ?? null;
  const topic = category?.topics.find((item) => item.id === note.topicId) ?? null;
  const subtopic = topic?.subtopics.find((item) => item.id === note.subtopicId) ?? null;
  const trimmedQuestion = questionText?.trim() ?? "";
  const fallbackPrompt = subtopic?.definition ?? topic?.summary ?? "Review this SQL concept and practice your query.";
  const fallbackTitle = subtopic?.title ?? "SQL practice";

  return {
    title: trimmedQuestion ? trimmedQuestion.slice(0, 120) : fallbackTitle,
    prompt: trimmedQuestion || fallbackPrompt,
    explanation: subtopic?.explanation?.join(" ") ?? topic?.summary ?? "Use SQL to interact with the learning topic.",
    concepts: subtopic?.keyPoints ?? topic?.keyPoints ?? ["SQL basics"],
    tables,
  };
}

function isPracticeTable(value: unknown): value is PracticeTable {
  if (!isRecord(value) || !isSchemaIdentifier(value.name)) {
    return false;
  }
  const columns = value.columns;
  const rows = value.rows;
  if (
    !Array.isArray(columns) ||
    columns.length < 1 ||
    columns.length > 20 ||
    !Array.isArray(rows) ||
    rows.length > 25
  ) return false;

  const columnNames = new Set<string>();
  for (const column of columns) {
    if (
      !isRecord(column) ||
      !isSchemaIdentifier(column.name) ||
      typeof column.type !== "string" ||
      !schemaTypes.has(column.type.toUpperCase()) ||
      columnNames.has(column.name.toLowerCase())
    ) {
      return false;
    }
    columnNames.add(column.name.toLowerCase());
  }

  return rows.every(
    (row) =>
      isRecord(row) &&
      Object.keys(row).length === columns.length &&
      Object.entries(row).every(
        ([key, cell]) =>
          columnNames.has(key.toLowerCase()) &&
          columns.some((column) => isRecord(column) && column.name === key) &&
          (cell === null ||
            typeof cell === "boolean" ||
            (typeof cell === "string" && cell.length <= 500) ||
            (typeof cell === "number" && Number.isFinite(cell))),
      ),
  );
}

function isSchemaIdentifier(value: unknown): value is string {
  return typeof value === "string" && schemaIdentifierPattern.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
