import assert from "node:assert/strict";
import { test } from "node:test";

import {
  executePracticeSql,
  validateGeneratedQuestions,
  type GeneratedQuestion,
} from "./practice-service.js";

const question: GeneratedQuestion = {
  title: "Active customers",
  prompt: "Return active customers.",
  explanation: "Filter the customers by status.",
  solutionSql: "SELECT name FROM customers WHERE status = 'active'",
  concepts: ["SELECT", "WHERE"],
  tables: [
    {
      name: "customers",
      columns: [
        { name: "name", type: "TEXT" },
        { name: "status", type: "TEXT" },
      ],
      rows: [
        { name: "Mina", status: "active" },
        { name: "Ravi", status: "inactive" },
      ],
    },
  ],
};

test("practice query executes against an isolated SQLite dataset", () => {
  assert.deepEqual(
    executePracticeSql(question, "SELECT name FROM customers WHERE status = 'active'"),
    {
      ok: true,
      columns: ["name"],
      rows: [{ name: "Mina" }],
      rowLimit: 200,
      truncated: false,
    },
  );
});

test("practice query supports aggregates and rejects unbounded SQLite functions", () => {
  assert.deepEqual(
    executePracticeSql(question, "SELECT COUNT(*) AS total FROM customers"),
    {
      ok: true,
      columns: ["total"],
      rows: [{ total: 2 }],
      rowLimit: 200,
      truncated: false,
    },
  );
  assert.throws(
    () => executePracticeSql(question, "SELECT randomblob(100000000)"),
    /not authorized/i,
  );
});

test("practice SQL rejects write statements and multiple statements", () => {
  assert.throws(
    () => executePracticeSql(question, "DELETE FROM customers"),
    /read-only/,
  );
  assert.throws(
    () => executePracticeSql(question, "SELECT * FROM customers; DROP TABLE customers"),
    /one SQL statement/,
  );
  assert.throws(
    () =>
      executePracticeSql(
        question,
        "WITH RECURSIVE counter(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM counter) SELECT value FROM counter",
      ),
    /not authorized/i,
  );
  assert.throws(
    () => executePracticeSql(question, "SELECT a.name FROM customers a, customers b"),
    /explicit JOIN/,
  );
});

test("practice question validation rejects unsafe schema identifiers", () => {
  const invalidQuestion = {
    ...question,
    tables: [{ ...question.tables[0], name: "customers; DROP TABLE customers" }],
  };
  assert.equal(validateGeneratedQuestions([invalidQuestion], 1), false);
  assert.equal(validateGeneratedQuestions([question], 1), true);
});

test("newly generated questions require a valid read-only SQL solution", () => {
  assert.equal(validateGeneratedQuestions([question], 1, true), true);
  const missingSolution = { ...question };
  delete (missingSolution as Partial<GeneratedQuestion>).solutionSql;
  assert.equal(validateGeneratedQuestions([missingSolution], 1, true), false);
  assert.equal(
    validateGeneratedQuestions([{ ...question, solutionSql: "DELETE FROM customers" }], 1, true),
    false,
  );
  assert.equal(
    validateGeneratedQuestions(
      [{ ...question, solutionSql: "SELECT name FROM missing_table" }],
      1,
      true,
    ),
    false,
  );
});
