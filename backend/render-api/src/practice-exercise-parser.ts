import type { PracticeTable } from "./practice-service.js";

const maximumExerciseLength = 20_000;
const identifier = /^[A-Za-z_][A-Za-z0-9_]{0,47}$/;

export type ParsedPracticeExercise = {
  prompt: string;
  tables: PracticeTable[];
};

export class PracticeExerciseSetupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PracticeExerciseSetupError";
  }
}

export function parsePracticeExercise(source: string): ParsedPracticeExercise {
  if (!source.trim()) {
    throw setupError("Paste the exercise statement and its table structure or sample data in the question box.");
  }
  if (source.length > maximumExerciseLength) {
    throw setupError("This exercise is too large to parse. Keep the pasted question and sample data under 20,000 characters.");
  }

  const tables = new Map<string, PracticeTable>();
  const sql = stripLineComments(source);
  parseCreateTables(sql, tables);
  parseInserts(sql, tables);
  parseMarkdownTables(source, tables);
  parsePlainTextTables(source, tables);

  if (!tables.size) {
    throw setupError("No runnable tables found. Include a table definition and sample rows, such as a CREATE TABLE statement or a named Markdown table.");
  }

  const prompt = source.trim();
  if (prompt.length > 20_000) {
    throw setupError("This exercise is too large to evaluate. Keep the pasted content under 20,000 characters.");
  }

  let totalRows = 0;
  for (const table of tables.values()) {
    totalRows += table.rows.length;
    if (table.rows.length > 25 || totalRows > 70 || table.columns.length > 20) {
      throw setupError("The exercise exceeds the safe practice limits (4 tables, 20 columns per table, 25 rows per table, 70 rows total).");
    }
  }
  if (tables.size > 4) {
    throw setupError("The exercise exceeds the safe practice limit of 4 tables.");
  }

  return { prompt, tables: [...tables.values()] };
}

function parseCreateTables(source: string, tables: Map<string, PracticeTable>) {
  const pattern = /(?:^|[;\r\n])\s*(?:```(?:sql)?\s*)?CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(["`[]?)([A-Za-z_][A-Za-z0-9_]{0,47})["`\]]?\s*\(/gim;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const name = match[2];
    const openIndex = pattern.lastIndex - 1;
    const closeIndex = findMatchingParen(source, openIndex);
    if (closeIndex < 0) throw setupError(`The CREATE TABLE definition for "${name}" is incomplete.`);
    const columns: PracticeTable["columns"] = [];
    for (const definition of splitTopLevel(source.slice(openIndex + 1, closeIndex), ",")) {
      const trimmed = definition.trim();
      if (/^(?:PRIMARY|FOREIGN|UNIQUE|CONSTRAINT|CHECK)\b/i.test(trimmed)) continue;
      const columnMatch = /^(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_]{0,47}))\s+([A-Za-z]+(?:\s*\([^)]*\))?)/.exec(trimmed);
      if (!columnMatch) throw setupError(`A column in the "${name}" table could not be read. Use simple column names and SQLite data types.`);
      const columnName = columnMatch.slice(1, 5).find(Boolean)!;
      if (!identifier.test(columnName)) throw setupError(`The "${name}" table contains an unsupported column name.`);
      const type = normalizeType(columnMatch[5]);
      if (!type) throw setupError(`The "${columnName}" column uses an unsupported type. Use TEXT, INTEGER, REAL, or BOOLEAN.`);
      columns.push({ name: columnName, type });
    }
    addTable(tables, { name, columns, rows: [] });
    pattern.lastIndex = closeIndex + 1;
  }
}

function parseInserts(source: string, tables: Map<string, PracticeTable>) {
  const pattern = /(?:^|[;\r\n])\s*(?:```(?:sql)?\s*)?INSERT\s+INTO\s+(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_]{0,47}))\s*/gim;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const tableName = match.slice(1, 5).find(Boolean)!;
    if (!identifier.test(tableName)) throw setupError("An INSERT statement contains an unsupported table name.");
    let cursor = skipWhitespace(source, pattern.lastIndex);
    let insertColumns: string[] | null = null;
    if (source[cursor] === "(") {
      const close = findMatchingParen(source, cursor);
      if (close < 0) throw setupError(`The INSERT statement for "${tableName}" is incomplete.`);
      insertColumns = splitTopLevel(source.slice(cursor + 1, close), ",").map(parseIdentifier);
      cursor = skipWhitespace(source, close + 1);
    }
    const valuesMatch = /^VALUES\b/i.exec(source.slice(cursor));
    if (!valuesMatch) throw setupError(`The INSERT statement for "${tableName}" must use VALUES with literal sample rows.`);
    cursor = skipWhitespace(source, cursor + valuesMatch[0].length);
    const rows: Array<Array<string | number | boolean | null>> = [];
    while (source[cursor] === "(") {
      const close = findMatchingParen(source, cursor);
      if (close < 0) throw setupError(`A sample row for "${tableName}" is incomplete.`);
      rows.push(splitTopLevel(source.slice(cursor + 1, close), ",").map(parseLiteral));
      cursor = skipWhitespace(source, close + 1);
      if (source[cursor] !== ",") break;
      cursor = skipWhitespace(source, cursor + 1);
    }
    if (!rows.length) throw setupError(`The INSERT statement for "${tableName}" has no sample rows.`);

    let table = tables.get(tableName.toLowerCase());
    if (!table) {
      if (!insertColumns?.length) {
        throw setupError(`Add a CREATE TABLE definition or a column list to the INSERT statement for "${tableName}".`);
      }
      table = {
        name: tableName,
        columns: insertColumns.map((name, index) => {
          const values = rows.map((row) => row[index]);
          const type = inferType(values);
          return { name, type };
        }),
        rows: [],
      };
      addTable(tables, table);
      table = tables.get(tableName.toLowerCase())!;
    }

    const columns = insertColumns ?? table.columns.map((column) => column.name);
    const normalizedColumns: string[] = [];
    for (const column of columns) {
      const match = table.columns.find((item) => item.name.toLowerCase() === column.toLowerCase());
      if (!match) {
        throw setupError(`The INSERT columns do not match the "${tableName}" table definition.`);
      }
      normalizedColumns.push(match.name);
    }
    if (
      normalizedColumns.length !== table.columns.length ||
      new Set(normalizedColumns).size !== normalizedColumns.length
    ) {
      throw setupError(`The INSERT columns do not match the "${tableName}" table definition.`);
    }
    for (const values of rows) {
      if (values.length !== normalizedColumns.length) throw setupError(`A sample row for "${tableName}" has the wrong number of values.`);
      const row: Record<string, string | number | boolean | null> = {};
      for (const [index, column] of normalizedColumns.entries()) row[column] = values[index];
      table.rows.push(row);
    }
    pattern.lastIndex = cursor;
  }
}

function parseMarkdownTables(source: string, tables: Map<string, PracticeTable>) {
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const header = parsePipeRow(lines[index]);
    const divider = parsePipeRow(lines[index + 1]);
    if (!header || !divider || !divider.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))) continue;
    const name = findTableLabel(lines, index);
    if (!name) throw setupError("A Markdown table needs a table name immediately above it (for example, `customers`).");
    if (!identifier.test(name)) throw setupError(`The table name "${name}" is not supported.`);
    const columns = header.map(parseMarkdownColumn);
    const names = new Set<string>();
    for (const column of columns) {
      if (names.has(column.name.toLowerCase())) throw setupError(`The "${name}" table contains duplicate column names.`);
      names.add(column.name.toLowerCase());
    }
    const rows: string[][] = [];
    let rowIndex = index + 2;
    while (rowIndex < lines.length) {
      const cells = parsePipeRow(lines[rowIndex]);
      if (!cells) break;
      if (cells.length !== columns.length) throw setupError(`A row in the "${name}" Markdown table has the wrong number of columns.`);
      rows.push(cells);
      rowIndex += 1;
    }
    if (!rows.length) throw setupError(`The "${name}" Markdown table has no sample rows.`);
    const normalizedColumns = columns.map((column, columnIndex) => ({
      ...column,
      type: column.type ?? inferCellType(rows.map((row) => row[columnIndex])),
    }));
    const parsedRows = rows.map((row) => Object.fromEntries(row.map((cell, cellIndex) => [
      normalizedColumns[cellIndex].name,
      parseCell(cell, normalizedColumns[cellIndex].type),
    ])));
    addTable(tables, { name, columns: normalizedColumns, rows: parsedRows });
    index = rowIndex - 1;
  }
}

function parsePlainTextTables(source: string, tables: Map<string, PracticeTable>) {
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length - 2; index += 1) {
    const name = parseTableLabel(lines[index]);
    if (!name || !identifier.test(name) || !lines[index + 1].includes("\t")) continue;
    const header = lines[index + 1].split("\t").map((cell) => cell.trim());
    const rows: string[][] = [];
    let rowIndex = index + 2;
    while (rowIndex < lines.length && lines[rowIndex].includes("\t")) {
      const cells = lines[rowIndex].split("\t").map((cell) => cell.trim());
      if (cells.length !== header.length) throw setupError(`A row in the "${name}" tab-separated table has the wrong number of columns.`);
      rows.push(cells);
      rowIndex += 1;
    }
    if (!rows.length) continue;
    const columns = header.map((column) => parseMarkdownColumn(column));
    const parsedRows = rows.map((row) => Object.fromEntries(row.map((cell, cellIndex) => [
      columns[cellIndex].name,
      parseCell(cell, columns[cellIndex].type ?? inferCellType(rows.map((sample) => sample[cellIndex]))),
    ])));
    const typedColumns = columns.map((column, columnIndex) => ({
      name: column.name,
      type: column.type ?? inferCellType(rows.map((row) => row[columnIndex])),
    }));
    addTable(tables, { name, columns: typedColumns, rows: parsedRows });
    index = rowIndex - 1;
  }
}

function parsePipeRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;
  const content = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return content.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, "|").trim());
}

function parseMarkdownColumn(value: string) {
  const match = /^\s*([A-Za-z_][A-Za-z0-9_]{0,47})(?:\s*(?:\((TEXT|INTEGER|REAL|BOOLEAN)\)|:\s*(TEXT|INTEGER|REAL|BOOLEAN)))?\s*$/i.exec(value);
  if (!match) throw setupError(`The column heading "${value.trim()}" is not a supported identifier.`);
  return { name: match[1], type: (match[2] ?? match[3])?.toUpperCase() as PracticeTable["columns"][number]["type"] | undefined };
}

function parseCell(value: string, type: PracticeTable["columns"][number]["type"]): string | number | boolean | null {
  const cell = value.trim();
  if (/^null$/i.test(cell)) return null;
  if (type === "BOOLEAN") {
    if (/^(true|1)$/i.test(cell)) return true;
    if (/^(false|0)$/i.test(cell)) return false;
    throw setupError(`The value "${cell}" is not a valid BOOLEAN sample.`);
  }
  if (type === "INTEGER") {
    if (!/^[+-]?\d+$/.test(cell)) throw setupError(`The value "${cell}" is not a valid INTEGER sample.`);
    return Number(cell);
  }
  if (type === "REAL") {
    const valueNumber = Number(cell);
    if (!cell || !Number.isFinite(valueNumber)) throw setupError(`The value "${cell}" is not a valid REAL sample.`);
    return valueNumber;
  }
  if (type === "TEXT") return cell.replace(/^(['"])(.*)\1$/, "$2").replace(/''/g, "'");
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(cell)) return Number(cell);
  if (/^(true|false)$/i.test(cell)) return /^true$/i.test(cell);
  return cell.replace(/^(['"])(.*)\1$/, "$2").replace(/''/g, "'");
}

function inferCellType(values: string[]): PracticeTable["columns"][number]["type"] {
  const populated = values.filter((value) => !/^null$/i.test(value.trim()));
  if (!populated.length) throw setupError("A sample column contains only NULL values. Add its data type to the table heading.");
  if (populated.every((value) => !/^[+-]?\d+$/.test(value.trim()) && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()) && !/^(true|false)$/i.test(value.trim()))) {
    return "TEXT";
  }
  if (populated.every((value) => /^(true|false)$/i.test(value.trim()))) return "BOOLEAN";
  if (populated.every((value) => /^[+-]?\d+$/.test(value.trim()))) return "INTEGER";
  if (populated.every((value) => /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))) return "REAL";
  throw setupError("A sample column contains conflicting value types. Add an explicit type to its Markdown heading.");
}

function parseLiteral(value: string): string | number | boolean | null {
  const literal = value.trim();
  if (/^NULL$/i.test(literal)) return null;
  if (/^TRUE$/i.test(literal)) return true;
  if (/^FALSE$/i.test(literal)) return false;
  if (/^'(?:[^']|'')*'$/.test(literal)) return literal.slice(1, -1).replace(/''/g, "'");
  if (/^"(?:[^"]|"")*"$/.test(literal)) return literal.slice(1, -1).replace(/""/g, '"');
  if (/^[+-]?\d+$/.test(literal)) return Number(literal);
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(literal)) return Number(literal);
  throw setupError(`The sample value "${literal.slice(0, 40)}" is unsupported. Use quoted text, numbers, TRUE, FALSE, or NULL.`);
}

function inferType(values: Array<string | number | boolean | null>): PracticeTable["columns"][number]["type"] {
  const populated = values.filter((value) => value !== null);
  if (!populated.length) throw setupError("A sample column contains only NULL values. Add its data type to the table definition.");
  if (populated.every((value) => typeof value === "boolean")) return "BOOLEAN";
  if (populated.every((value) => typeof value === "number" && Number.isInteger(value))) return "INTEGER";
  if (populated.every((value) => typeof value === "number")) return "REAL";
  if (populated.every((value) => typeof value === "string")) return "TEXT";
  throw setupError("A sample column contains conflicting value types. Add an explicit column type.");
}

function normalizeType(value: string): PracticeTable["columns"][number]["type"] | null {
  const type = value.toUpperCase().split(/[ (]/, 1)[0];
  if (["TEXT", "CHAR", "CHARACTER", "VARCHAR", "CLOB", "DATE", "DATETIME"].includes(type)) return "TEXT";
  if (["INT", "INTEGER", "BIGINT", "SMALLINT"].includes(type)) return "INTEGER";
  if (["REAL", "FLOAT", "DOUBLE", "NUMERIC", "DECIMAL"].includes(type)) return "REAL";
  if (type === "BOOLEAN" || type === "BOOL") return "BOOLEAN";
  return null;
}

function addTable(tables: Map<string, PracticeTable>, table: PracticeTable) {
  const key = table.name.toLowerCase();
  const existing = tables.get(key);
  if (existing) {
    if (
      existing.name !== table.name ||
      JSON.stringify(existing.columns) !== JSON.stringify(table.columns) ||
      existing.rows.length + table.rows.length > 25
    ) {
      throw setupError(`Conflicting or repeated definitions were found for the "${table.name}" table.`);
    }
    existing.rows.push(...table.rows);
    return;
  }
  if (tables.size >= 4) throw setupError("The exercise exceeds the safe practice limit of 4 tables.");
  tables.set(key, table);
}

function parseTableLabel(line: string): string | null {
  return /^(?:#{1,6}\s*)?(?:Table:\s*)?(?:`([^`]+)`|([A-Za-z_][A-Za-z0-9_]{0,47})):?\s*$/.exec(line.trim())?.slice(1).find(Boolean) ?? null;
}

function findTableLabel(lines: string[], tableIndex: number): string | null {
  for (let index = tableIndex - 1; index >= Math.max(0, tableIndex - 3); index -= 1) {
    if (!lines[index].trim()) continue;
    return parseTableLabel(lines[index]);
  }
  return null;
}

function splitTopLevel(value: string, delimiter: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index + 1] === quote) index += 1;
      else if (character === quote) quote = "";
    } else if (character === "'" || character === '"') quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === delimiter && depth === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
}

function findMatchingParen(value: string, openIndex: number): number {
  let depth = 0;
  let quote = "";
  for (let index = openIndex; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index + 1] === quote) index += 1;
      else if (character === quote) quote = "";
    } else if (character === "'" || character === '"') quote = character;
    else if (character === "(") depth += 1;
    else if (character === ")" && --depth === 0) return index;
  }
  return -1;
}

function parseIdentifier(value: string): string {
  const identifierValue = value.trim().replace(/^["`[]|["`\]]$/g, "");
  if (!identifier.test(identifierValue)) throw setupError("An INSERT statement contains an unsupported column name.");
  return identifierValue;
}

function skipWhitespace(value: string, start: number) {
  while (/\s/.test(value[start] ?? "")) start += 1;
  return start;
}

function stripLineComments(value: string) {
  const characters = value.split("");
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index + 1] === quote) index += 1;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if (character === "-" && value[index + 1] === "-") {
      while (index < value.length && value[index] !== "\n") {
        characters[index] = " ";
        index += 1;
      }
    }
  }
  return characters.join("");
}

function setupError(message: string) {
  return new PracticeExerciseSetupError(message);
}
