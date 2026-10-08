import { DatabaseSync, constants, type SQLInputValue, type SQLOutputValue } from "node:sqlite";

export type PracticeTable = {
  name: string;
  columns: Array<{ name: string; type: "TEXT" | "INTEGER" | "REAL" | "BOOLEAN" }>;
  rows: Array<Record<string, string | number | boolean | null>>;
};

export type GeneratedQuestion = {
  title: string;
  prompt: string;
  explanation: string;
  solutionSql?: string;
  concepts: string[];
  tables: PracticeTable[];
};

const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]{0,47}$/;
const allowedTypes = new Set(["TEXT", "INTEGER", "REAL", "BOOLEAN"]);
const allowedFunctions = new Set([
  "abs",
  "avg",
  "coalesce",
  "count",
  "date",
  "datetime",
  "glob",
  "ifnull",
  "instr",
  "julianday",
  "length",
  "like",
  "lower",
  "ltrim",
  "max",
  "min",
  "nullif",
  "printf",
  "quote",
  "round",
  "rtrim",
  "strftime",
  "substr",
  "sum",
  "time",
  "total",
  "trim",
  "typeof",
  "unicode",
  "upper",
]);
const maximumRowsPerTable = 25;
const maximumResultRows = 200;

export class PracticeQueryPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PracticeQueryPolicyError";
  }
}

export function validateGeneratedQuestions(
  value: unknown,
  expectedCount: number,
  requireSolution = false,
): value is GeneratedQuestion[] {
  if (!Array.isArray(value) || value.length !== expectedCount) {
    return false;
  }

  return value.every((item) => {
    if (!isRecord(item)) {
      return false;
    }
    if (
      !isText(item.title, 160) ||
      !isText(item.prompt, 2000) ||
      !isText(item.explanation, 2000) ||
      (requireSolution && !isText(item.solutionSql, 10_000)) ||
      (item.solutionSql !== undefined &&
        (!isText(item.solutionSql, 10_000) ||
          !/^\s*(select|with)\b/i.test(item.solutionSql) ||
          !isSingleStatement(item.solutionSql))) ||
      !Array.isArray(item.concepts) ||
      item.concepts.length > 8 ||
      !item.concepts.every((concept) => isText(concept, 80)) ||
      !Array.isArray(item.tables) ||
      item.tables.length < 1 ||
      item.tables.length > 4
    ) {
      return false;
    }

    const tableNames = new Set<string>();
    let totalRows = 0;
    const tablesValid = item.tables.every((table) => {
      if (
        !isRecord(table) ||
        !isIdentifier(table.name) ||
        tableNames.has(table.name.toLowerCase()) ||
        !Array.isArray(table.columns) ||
        table.columns.length < 1 ||
        table.columns.length > 20 ||
        !Array.isArray(table.rows) ||
        table.rows.length > maximumRowsPerTable ||
        (totalRows += table.rows.length) > 70
      ) {
        return false;
      }
      tableNames.add(table.name.toLowerCase());

      const columnNames = new Set<string>();
      const normalizedColumnNames = new Set<string>();
      for (const column of table.columns) {
        if (
          !isRecord(column) ||
          !isIdentifier(column.name) ||
          typeof column.type !== "string" ||
          !allowedTypes.has(column.type.toUpperCase()) ||
          normalizedColumnNames.has(column.name.toLowerCase())
        ) {
          return false;
        }
        normalizedColumnNames.add(column.name.toLowerCase());
        columnNames.add(column.name.toLowerCase());
      }

      return table.rows.every(
        (row) =>
          isRecord(row) &&
          Object.keys(row).length === columnNames.size &&
          Object.entries(row).every(
            ([key, cell]) =>
              columnNames.has(key) &&
              (cell === null ||
                typeof cell === "string" ||
                typeof cell === "number" ||
                typeof cell === "boolean") &&
              (typeof cell !== "string" || cell.length <= 500) &&
              (typeof cell !== "number" || Number.isFinite(cell)),
          ),
      );
    });
    if (!tablesValid) {
      return false;
    }
    if (item.solutionSql !== undefined) {
      try {
        executePracticeSql(item as unknown as GeneratedQuestion, item.solutionSql);
      } catch {
        return false;
      }
    }
    return true;
  });
}

export function executePracticeSql(question: GeneratedQuestion, sql: string) {
  if (!isText(sql, 10_000)) {
    throw new PracticeQueryPolicyError("Enter a SQL query of no more than 10,000 characters.");
  }
  if (!isSingleStatement(sql)) {
    throw new PracticeQueryPolicyError("Run one SQL statement at a time.");
  }
  if (!/^\s*(select|with)\b/i.test(sql)) {
    throw new PracticeQueryPolicyError("Practice SQL is read-only. Start with SELECT or WITH.");
  }
  const joins = sql.match(/\bjoin\b/gi) ?? [];
  const fromClause = sql.match(
    /\bfrom\b([\s\S]*?)(?=\bwhere\b|\bgroup\s+by\b|\bhaving\b|\border\s+by\b|\blimit\b|$)/i,
  )?.[1] ?? "";
  if (joins.length > 3 || /,\s*[A-Za-z_][A-Za-z0-9_]*/.test(fromClause)) {
    throw new PracticeQueryPolicyError("Keep practice queries to three joins and use explicit JOIN clauses.");
  }

  const database = new DatabaseSync(":memory:", {
    allowExtension: false,
    defensive: true,
    limits: {
      length: 100_000,
      sqlLength: 10_000,
      column: 100,
      exprDepth: 50,
      compoundSelect: 20,
      vdbeOp: 100_000,
      functionArg: 50,
      attach: 0,
    },
  });

  try {
    for (const table of question.tables) {
      const columnDefinitions = table.columns
        .map((column) => `${quoteIdentifier(column.name)} ${column.type.toUpperCase()}`)
        .join(", ");
      database.exec(`CREATE TABLE ${quoteIdentifier(table.name)} (${columnDefinitions})`);
      if (table.rows.length === 0) {
        continue;
      }

      const columnNames = table.columns.map((column) => quoteIdentifier(column.name)).join(", ");
      const placeholders = table.columns.map(() => "?").join(", ");
      const insert = database.prepare(
        `INSERT INTO ${quoteIdentifier(table.name)} (${columnNames}) VALUES (${placeholders})`,
      );
      for (const row of table.rows) {
        insert.run(
          ...table.columns.map((column): SQLInputValue => {
            const value = row[column.name] ?? null;
            return typeof value === "boolean" ? Number(value) : value;
          }),
        );
      }
    }

    database.setAuthorizer((actionCode, _firstArgument, secondArgument) => {
      if (
        actionCode === constants.SQLITE_SELECT ||
        actionCode === constants.SQLITE_READ
      ) {
        return constants.SQLITE_OK;
      }
      if (
        actionCode === constants.SQLITE_FUNCTION &&
        typeof secondArgument === "string" &&
        allowedFunctions.has(secondArgument.toLowerCase())
      ) {
        return constants.SQLITE_OK;
      }
      return constants.SQLITE_DENY;
    });

    const statement = database.prepare(sql);
    const columns = statement.columns().map((column) => column.name);
    const rows: Record<string, string | number | boolean | null>[] = [];
    let truncated = false;
    for (const row of statement.iterate()) {
      if (rows.length >= maximumResultRows) {
        truncated = true;
        break;
      }
      rows.push(normalizeRow(row));
    }

    return {
      ok: true as const,
      columns,
      rows,
      rowLimit: maximumResultRows,
      truncated,
    };
  } finally {
    database.close();
  }
}

function isSingleStatement(sql: string) {
  let quote = "";
  let lineComment = false;
  let blockComment = false;
  let trailingStatement = false;

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];

    if (lineComment) {
      if (current === "\n") {
        lineComment = false;
      }
      continue;
    }
    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (current === quote && sql[index + 1] === quote) {
        index += 1;
      } else if (current === quote) {
        quote = "";
      }
      continue;
    }
    if ((current === "-" && next === "-")) {
      lineComment = true;
      index += 1;
    } else if (current === "/" && next === "*") {
      blockComment = true;
      index += 1;
    } else if (current === "'" || current === '"' || current === "`") {
      quote = current;
    } else if (current === ";") {
      trailingStatement = true;
    } else if (trailingStatement && !/\s/.test(current)) {
      return false;
    }
  }
  return !quote && !blockComment;
}

function normalizeRow(row: Record<string, SQLOutputValue>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      typeof value === "bigint"
        ? value.toString()
        : value instanceof Uint8Array
          ? Buffer.from(value).toString("base64")
          : typeof value === "number" && !Number.isFinite(value)
            ? String(value)
            : value,
    ]),
  ) as Record<string, string | number | boolean | null>;
}

function quoteIdentifier(identifier: string) {
  if (!isIdentifier(identifier)) {
    throw new Error("The practice schema contains an invalid SQL identifier.");
  }
  return `"${identifier}"`;
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && identifierPattern.test(value);
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
