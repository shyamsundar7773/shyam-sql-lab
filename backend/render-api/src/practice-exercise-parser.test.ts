import assert from "node:assert/strict";
import { test } from "node:test";

import { parsePracticeExercise, PracticeExerciseSetupError } from "./practice-exercise-parser.js";

test("parses a named Markdown table and infers column types", () => {
  const parsed = parsePracticeExercise(`List active users.

\`users\`
| user_id (INTEGER) | username | active |
| --- | --- | --- |
| 1 | John Doe | true |
| 2 | Jane Doe | false |`);

  assert.match(parsed.prompt, /List active users/);
  assert.deepEqual(parsed.tables, [{
    name: "users",
    columns: [
      { name: "user_id", type: "INTEGER" },
      { name: "username", type: "TEXT" },
      { name: "active", type: "BOOLEAN" },
    ],
    rows: [
      { user_id: 1, username: "John Doe", active: true },
      { user_id: 2, username: "Jane Doe", active: false },
    ],
  }]);
});

test("parses CREATE TABLE definitions and quoted INSERT values", () => {
  const parsed = parsePracticeExercise(`Find customers in New York.
CREATE TABLE customers (
  customer_id INTEGER PRIMARY KEY,
  customer_name TEXT,
  city VARCHAR(40),
  note TEXT
);
INSERT INTO customers (customer_id, customer_name, city, note) VALUES
  (1, 'Ava Smith', 'New York', 'likes tea, coffee'),
  (2, 'O''Neil', 'Boston', NULL);`);

  assert.deepEqual(parsed.tables, [{
    name: "customers",
    columns: [
      { name: "customer_id", type: "INTEGER" },
      { name: "customer_name", type: "TEXT" },
      { name: "city", type: "TEXT" },
      { name: "note", type: "TEXT" },
    ],
    rows: [
      { customer_id: 1, customer_name: "Ava Smith", city: "New York", note: "likes tea, coffee" },
      { customer_id: 2, customer_name: "O'Neil", city: "Boston", note: null },
    ],
  }]);
});

test("preserves comment markers inside quoted sample values", () => {
  const parsed = parsePracticeExercise(`Read the customer note.
CREATE TABLE customers (customer_id INTEGER, note TEXT);
INSERT INTO customers VALUES (1, 'ships -- do not delete');`);

  assert.equal(parsed.tables[0].rows[0].note, "ships -- do not delete");
});

test("matches SQL table and column identifiers case-insensitively", () => {
  const parsed = parsePracticeExercise(`Show all users.
CREATE TABLE Users (User_ID INTEGER, User_Name TEXT);
INSERT INTO users (user_id, USER_NAME) VALUES (1, 'Ada Lovelace');`);

  assert.deepEqual(parsed.tables[0].rows, [{ User_ID: 1, User_Name: "Ada Lovelace" }]);
});

test("parses related tables from a single exercise", () => {
  const parsed = parsePracticeExercise(`Show each customer and their orders.
CREATE TABLE customers (customer_id INTEGER, customer_name TEXT);
CREATE TABLE orders (order_id INTEGER, customer_id INTEGER, order_date DATE);
INSERT INTO customers VALUES (1, 'Ava');
INSERT INTO orders VALUES (8, 1, '2026-01-02');`);

  assert.deepEqual(parsed.tables.map((table) => table.name), ["customers", "orders"]);
  assert.deepEqual(parsed.tables[1].rows, [
    { order_id: 8, customer_id: 1, order_date: "2026-01-02" },
  ]);
});

test("does not interpret SQL keywords in the problem statement as executable sample data", () => {
  const parsed = parsePracticeExercise(`Write an INSERT INTO users statement for the new user.

\`users\`
| user_id | username |
| --- | --- |
| 1 | Ava |`);

  assert.equal(parsed.tables[0].name, "users");
  assert.deepEqual(parsed.tables[0].rows, [{ user_id: 1, username: "Ava" }]);
});

test("parses tab-separated plain-text tables", () => {
  const parsed = parsePracticeExercise(`Find each customer's city.
Table: customers
customer_id\tcustomer_name\tcity
1\tAva Smith\tNew York
2\tBen Ray\tAustin`);

  assert.deepEqual(parsed.tables[0].columns, [
    { name: "customer_id", type: "INTEGER" },
    { name: "customer_name", type: "TEXT" },
    { name: "city", type: "TEXT" },
  ]);
  assert.deepEqual(parsed.tables[0].rows[0], {
    customer_id: 1,
    customer_name: "Ava Smith",
    city: "New York",
  });
});

test("rejects unnamed, incomplete, conflicting, and data-free Markdown tables", () => {
  for (const source of [
    "| id | name |\n| --- | --- |\n| 1 | Ava |",
    "`customers`\n| id | name |\n| --- | --- |",
    "`customers`\n| id | name |\n| --- | --- |\n| 1 | Ava | 2 |",
    "`customers`\n| id | name |\n| --- | --- |\n| 1 | Ava |\n| not-an-id | 3 |",
    "CREATE TABLE customers (id INTEGER\n",
  ]) {
    assert.throws(
      () => parsePracticeExercise(source),
      (error: unknown) => error instanceof PracticeExerciseSetupError,
    );
  }
});

test("rejects problem-only and oversized input with actionable setup errors", () => {
  assert.throws(
    () => parsePracticeExercise("Find customers with completed orders."),
    /No runnable tables found.*Include a table definition and sample rows/i,
  );
  assert.throws(
    () => parsePracticeExercise("x".repeat(20_001)),
    /under 20,000 characters/i,
  );
  const rows = Array.from({ length: 26 }, (_, index) => `| ${index + 1} |`).join("\n");
  assert.throws(
    () => parsePracticeExercise(`customers\n| id |\n| --- |\n${rows}`),
    /safe practice limits/i,
  );
});

test("rejects unsupported literals rather than executing pasted SQL", () => {
  assert.throws(
    () => parsePracticeExercise("CREATE TABLE users (id INTEGER); INSERT INTO users VALUES (random());"),
    /sample value.*unsupported/i,
  );
});
