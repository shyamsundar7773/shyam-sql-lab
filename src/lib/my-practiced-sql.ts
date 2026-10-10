import type { PracticeTable } from "@/types/sql-practice";

const maximumSchemaJsonLength = 100_000;
const schemaIdentifierPattern = /^[A-Za-z_][A-Za-z0-9_]{0,47}$/;
const schemaTypes = new Set(["TEXT", "INTEGER", "REAL", "BOOLEAN"]);

export const practiceSchemaSetupError =
  "Saved exercise data could not be restored. Paste the table definitions and sample rows into the question box.";

export function parsePracticeTablesJson(schemaJson: string): PracticeTable[] {
  if (!schemaJson.trim() || schemaJson.length > maximumSchemaJsonLength) {
    throw new Error(practiceSchemaSetupError);
  }

  let value: unknown;
  try {
    value = JSON.parse(schemaJson) as unknown;
  } catch {
    throw new Error("Saved exercise data could not be restored. Paste the table definitions and sample rows into the question box.");
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

export function includeLegacyPracticeTables(questionText: string, schemaJson: string): string {
  const tables = parsePracticeTablesJson(schemaJson);
  const definitions = tables.map((table) => {
    const columns = table.columns
      .map((column) => `${column.name} ${column.type}`)
      .join(", ");
    const inserts = table.rows.length
      ? `\nINSERT INTO ${table.name} (${table.columns.map((column) => column.name).join(", ")}) VALUES\n` +
        table.rows
          .map((row) => `  (${table.columns.map((column) => formatSqlLiteral(row[column.name])).join(", ")})`)
          .join(",\n") +
        ";"
      : "";
    return `CREATE TABLE ${table.name} (${columns});${inserts}`;
  });
  return [questionText.trim(), ...definitions].filter(Boolean).join("\n\n");
}

function formatSqlLiteral(value: string | number | boolean | null): string {
  if (value === null) return "NULL";
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
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
