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

test("practice query supports aggregates and classifies disallowed functions as policy rejections", () => {
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
    /operation is not allowed.*randomblob function is not allowed/i,
  );
});

test("practice accepts valid employee filtering and aggregation queries", () => {
  const employeeQuestion: GeneratedQuestion = {
    ...question,
    title: "Sales employees",
    prompt: "Find all employees who belong to the Sales department.",
    solutionSql: "SELECT * FROM employees WHERE department = 'Sales'",
    tables: [{
      name: "employees",
      columns: [
        { name: "name", type: "TEXT" },
        { name: "department", type: "TEXT" },
      ],
      rows: [
        { name: "Asha", department: "Sales" },
        { name: "Ben", department: "HR" },
        { name: "Chen", department: "Sales" },
      ],
    }],
  };

  assert.deepEqual(
    executePracticeSql(
      employeeQuestion,
      "SELECT * FROM employees WHERE department = 'Sales';",
    ).rows,
    [
      { name: "Asha", department: "Sales" },
      { name: "Chen", department: "Sales" },
    ],
  );
  assert.deepEqual(
    executePracticeSql(
      employeeQuestion,
      "SELECT department, COUNT(*) AS employee_count FROM employees GROUP BY department",
    ).rows,
    [
      { department: "HR", employee_count: 1 },
      { department: "Sales", employee_count: 2 },
    ],
  );
});

test("practice accepts explicit, comma-style, and more than three joins", () => {
  const joinQuestion: GeneratedQuestion = {
    ...question,
    tables: [
      {
        name: "employees",
        columns: [
          { name: "name", type: "TEXT" },
          { name: "department_id", type: "INTEGER" },
        ],
        rows: [{ name: "Asha", department_id: 1 }],
      },
      {
        name: "departments",
        columns: [
          { name: "id", type: "INTEGER" },
          { name: "location_id", type: "INTEGER" },
        ],
        rows: [{ id: 1, location_id: 1 }],
      },
      {
        name: "locations",
        columns: [
          { name: "id", type: "INTEGER" },
          { name: "region_id", type: "INTEGER" },
        ],
        rows: [{ id: 1, region_id: 1 }],
      },
      {
        name: "regions",
        columns: [
          { name: "id", type: "INTEGER" },
          { name: "category_id", type: "INTEGER" },
        ],
        rows: [{ id: 1, category_id: 1 }],
      },
      {
        name: "categories",
        columns: [{ name: "id", type: "INTEGER" }],
        rows: [{ id: 1 }],
      },
    ],
  };
  const baseQuery = "SELECT e.name FROM employees e";
  const joins = [
    " JOIN departments d ON d.id = e.department_id",
    " JOIN locations l ON l.id = d.location_id",
    " JOIN regions r ON r.id = l.region_id",
    " JOIN categories c ON c.id = r.category_id",
  ];

  for (let count = 0; count <= 3; count += 1) {
    assert.equal(
      executePracticeSql(joinQuestion, baseQuery + joins.slice(0, count).join("")).ok,
      true,
      `${count} explicit joins should be accepted`,
    );
  }
  assert.equal(executePracticeSql(joinQuestion, baseQuery + joins.join("")).ok, true);
  assert.equal(
    executePracticeSql(joinQuestion, "SELECT a.name FROM employees a, employees b").ok,
    true,
  );
});

test("the reported INSERT SELECT query runs in its isolated question database", () => {
  const insertQuestion: GeneratedQuestion = {
    ...question,
    tables: [
      {
        name: "users",
        columns: [
          { name: "user_id", type: "INTEGER" },
          { name: "username", type: "TEXT" },
          { name: "email", type: "TEXT" },
        ],
        rows: [{
          user_id: 1,
          username: "john_doe",
          email: "john@example.com",
        }],
      },
      {
        name: "users_archive",
        columns: [
          { name: "user_id", type: "INTEGER" },
          { name: "username", type: "TEXT" },
          { name: "email", type: "TEXT" },
        ],
        rows: [],
      },
    ],
  };
  const sql = `INSERT INTO users_archive (user_id, username, email)
SELECT user_id, username, email
FROM users
WHERE user_id = 1
  AND username = 'john_doe'
  AND email = 'john@example.com';`;

  assert.equal(
    validateGeneratedQuestions([{ ...insertQuestion, solutionSql: sql }], 1, true),
    true,
    "INSERT SELECT is a valid executable solution in the isolated question database",
  );
  assert.deepEqual(executePracticeSql(insertQuestion, sql), {
    ok: true,
    columns: [],
    rows: [],
    rowsAffected: 1,
    rowLimit: 200,
    truncated: false,
  });
  assert.deepEqual(
    executePracticeSql(insertQuestion, "SELECT * FROM users_archive").rows,
    [],
    "each execution uses a fresh in-memory database",
  );
  assert.deepEqual(
    executePracticeSql(
      insertQuestion,
      `INSERT INTO users_archive (user_id, username, email)
SELECT user_id, username, email
FROM users
WHERE user_id = 1
  AND username = 'john_doe'
  AND email = 'john@example.com'
RETURNING user_id, username, email;`,
    ).rows,
    [{ user_id: 1, username: "john_doe", email: "john@example.com" }],
  );
});

test("practice preserves SQLite syntax errors separately from policy rejections", () => {
  assert.throws(
    () => executePracticeSql(question, "SELECT * FORM customers"),
    /near "FORM": syntax error/i,
  );
});

test("practice confines permitted writes and rejects unsafe operations distinctly", () => {
  assert.deepEqual(
    executePracticeSql(question, "DELETE FROM customers WHERE status = 'inactive'"),
    {
      ok: true,
      columns: [],
      rows: [],
      rowsAffected: 1,
      rowLimit: 200,
      truncated: false,
    },
  );
  assert.throws(
    () => executePracticeSql(question, "CREATE TABLE injected (value TEXT)"),
    (error: unknown) =>
      error instanceof Error &&
      error.name === "PracticeQueryPolicyError" &&
      /not allowed in the isolated practice database/.test(error.message),
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
    /not allowed in the isolated practice database/,
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

test("practice questions require a valid single-statement SQL solution", () => {
  assert.equal(validateGeneratedQuestions([question], 1, true), true);
  const missingSolution = { ...question };
  delete (missingSolution as Partial<GeneratedQuestion>).solutionSql;
  assert.equal(validateGeneratedQuestions([missingSolution], 1, true), false);
  assert.equal(validateGeneratedQuestions([{ ...question, solutionSql: "DELETE FROM customers" }], 1, true), true);
  assert.equal(
    validateGeneratedQuestions([{ ...question, solutionSql: "DELETE FROM customers; SELECT 1" }], 1, true),
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
