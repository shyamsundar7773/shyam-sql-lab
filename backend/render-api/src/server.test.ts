import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";

let baseUrl: string;
let server: Server;

before(async () => {
  process.env.NODE_ENV = "test";
  const { app } = await import("./server.js");
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("The test server did not bind to a TCP port."));
        return;
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
    server.once("error", reject);
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("health check responds successfully to GET and POST", async () => {
  for (const method of ["GET", "POST"]) {
    const response = await fetch(`${baseUrl}/api/health`, { method });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      service: "shyam-sql-lab-api",
    });
  }
});

test("learning chat validates the expected request fields", async () => {
  const response = await fetch(`${baseUrl}/api/learning-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  test("learning chat returns a JSON error for malformed JSON", async () => {
    const response = await fetch(`${baseUrl}/api/learning-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "The request body is invalid.",
    });
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "The topic, lesson, history, and question are required.",
  });
});

test("learning chat rejects requests without authentication", async () => {
  const response = await fetch(`${baseUrl}/api/learning-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "SQL",
      module: "SQL Fundamentals",
      topic: "INNER JOIN",
      officialContent: '{"explanation":["Matching keys return rows."]}',
      history: [],
      question: "Explain INNER JOIN.",
    }),
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Sign in to ask a learning question.",
  });
});

test("SQL practice generation rejects unauthenticated requests before contacting AI", async () => {
  const response = await fetch(`${baseUrl}/api/practice/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: "SQL Foundations",
      module: "Query Basics",
      topic: "SELECT",
      subtopic: "Columns",
      difficulty: "Beginner",
      questionType: "SELECT",
      count: 1,
      learningContext: "Practice selecting columns.",
    }),
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Sign in to use SQL practice.",
  });
});

test("SQL practice execution and evaluator reject unauthenticated requests", async () => {
  const question = {
    title: "Read users",
    prompt: "Return users.",
    explanation: "Read rows from the table.",
    concepts: ["SELECT"],
    tables: [
      {
        name: "users",
        columns: [{ name: "name", type: "TEXT" }],
        rows: [{ name: "Sam" }],
      },
    ],
  };
  for (const [path, body] of [
    ["/api/practice/execute", { question, sql: "SELECT * FROM users" }],
    [
      "/api/practice/evaluate",
      {
        question,
        sql: "SELECT * FROM users",
        result: { ok: true, columns: ["name"], rows: [{ name: "Sam" }] },
        history: [],
        message: "Explain this query.",
      },
    ],
  ] as const) {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Sign in to use SQL practice.",
    });
  }
});

test("Notes organization rejects requests without authentication", async () => {
  const response = await fetch(`${baseUrl}/api/notes/organize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chunks: ["A SQL SELECT query returns requested columns."],
    }),
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Sign in to use SQL practice.",
  });
});

test("Notes organizer preserves valid taxonomy and marks unknown IDs for review", async () => {
  const originalFetch = globalThis.fetch;
  const previousEnvironment = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    groqKey: process.env.GROQ_API_KEY,
  };
  let organizedItem = {
    title: "Selecting columns",
    content: "Use SELECT to choose the columns returned by a query.",
    categoryId: "sql-foundations",
    categoryName: "SQL Foundations",
    categoryIsNew: false,
    moduleId: "query-basics",
    moduleName: "Query Basics",
    moduleIsNew: false,
    topicId: "query-structure",
    topicName: "The shape of a SQL query",
    topicIsNew: false,
    subtopicId: "select-list",
    needsChanges: false,
    reason: "This chunk explains the SELECT list.",
  };
  let completionText = JSON.stringify({ items: [organizedItem] });
  let jsonModeRequested = false;
  let groqResponseStatus = 200;

  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.GROQ_API_KEY = "test-groq-key";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "test-user" }), { status: 200 });
    }
    if (url === "https://api.groq.com/openai/v1/chat/completions") {
      const requestBody = JSON.parse(String(init?.body)) as {
        response_format?: { type?: string };
      };
      jsonModeRequested = requestBody.response_format?.type === "json_object";
      return new Response(
        JSON.stringify({ choices: [{ message: { content: completionText } }] }),
        { status: groqResponseStatus },
      );
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  };

  try {
    completionText = `\`\`\`json\n${JSON.stringify({ items: [organizedItem] })}\n\`\`\``;
    const response = await fetch(`${baseUrl}/api/notes/organize`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chunks: ["A SQL SELECT query returns requested columns."],
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(jsonModeRequested, true);
    assert.deepEqual(await response.json(), {
      items: [organizedItem],
      categoriesAdded: 0,
      topicsAdded: 0,
      itemsNeedChanges: 0,
    });

    organizedItem = {
      ...organizedItem,
      topicId: "invented-topic",
      topicName: "An unrecognized topic",
    };
    completionText = JSON.stringify({
      items: [
        organizedItem,
        { title: "Incomplete AI suggestion" },
        {
          title: "Warehouse schemas",
          content: "A warehouse organizes analytical data.",
          categoryId: null,
          categoryName: "Data Warehousing",
          categoryIsNew: true,
          moduleId: null,
          moduleName: "Dimensional Models",
          moduleIsNew: true,
          topicId: null,
          topicName: "Star Schemas",
          topicIsNew: true,
          subtopicId: null,
          needsChanges: false,
          reason: "A new category and topic were identified.",
        },
        {
          title: "Filtering",
          content: "Filtering notes.",
          categoryId: null,
          categoryName: "SQL Foundations",
          categoryIsNew: true,
          moduleId: null,
          moduleName: "Query Basics",
          moduleIsNew: true,
          topicId: null,
          topicName: "Filtering returned rows",
          topicIsNew: true,
          subtopicId: null,
          needsChanges: false,
          reason: "A new topic belongs to an existing category and module.",
        },
      ],
    });
    const invalidResponse = await fetch(`${baseUrl}/api/notes/organize`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chunks: [
          "A SQL SELECT query returns requested columns.",
          "A second piece of original learning material.",
          "A warehouse organizes analytical data.",
          "Filtering notes.",
        ],
      }),
    });
    assert.equal(invalidResponse.status, 200);
    assert.deepEqual(await invalidResponse.json(), {
      items: [
        {
          ...organizedItem,
          categoryId: null,
          categoryIsNew: false,
          moduleId: null,
          moduleIsNew: false,
          topicId: null,
          topicIsNew: false,
          subtopicId: null,
          needsChanges: true,
        },
        {
          title: "Incomplete AI suggestion",
          content: "A second piece of original learning material.",
          categoryId: null,
          categoryName: "",
          categoryIsNew: false,
          moduleId: null,
          moduleName: "",
          moduleIsNew: false,
          topicId: null,
          topicName: "",
          topicIsNew: false,
          subtopicId: null,
          needsChanges: true,
          reason: "The organizer response was incomplete; the original content was preserved for review.",
        },
        {
          title: "Warehouse schemas",
          content: "A warehouse organizes analytical data.",
          categoryId: null,
          categoryName: "Data Warehousing",
          categoryIsNew: true,
          moduleId: null,
          moduleName: "Dimensional Models",
          moduleIsNew: true,
          topicId: null,
          topicName: "Star Schemas",
          topicIsNew: true,
          subtopicId: null,
          needsChanges: false,
          reason: "A new category and topic were identified.",
        },
        {
          title: "Filtering",
          content: "Filtering notes.",
          categoryId: "sql-foundations",
          categoryName: "SQL Foundations",
          categoryIsNew: false,
          moduleId: "query-basics",
          moduleName: "Query Basics",
          moduleIsNew: false,
          topicId: null,
          topicName: "Filtering returned rows",
          topicIsNew: true,
          subtopicId: null,
          needsChanges: false,
          reason: "A new topic belongs to an existing category and module.",
        },
      ],
      categoriesAdded: 1,
      topicsAdded: 2,
      itemsNeedChanges: 2,
    });

    groqResponseStatus = 429;
    const providerFailure = await fetch(`${baseUrl}/api/notes/organize`, {
      method: "POST",
      headers: {
        Authorization: "Bearer organizer-test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chunks: ["A SQL SELECT query returns requested columns."],
      }),
    });
    assert.equal(providerFailure.status, 502);
    assert.deepEqual(await providerFailure.json(), {
      code: "AI_PROVIDER_REJECTED",
      error: "AI note organization is temporarily unavailable. Please retry.",
    });

  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment("SUPABASE_URL", previousEnvironment.supabaseUrl);
    restoreEnvironment("SUPABASE_PUBLISHABLE_KEY", previousEnvironment.supabaseKey);
    restoreEnvironment("GROQ_API_KEY", previousEnvironment.groqKey);
  }
});

test("authenticated SQL practice routes generate, execute, and evaluate without live providers", async () => {
  const originalFetch = globalThis.fetch;
  const previousEnvironment = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    groqKey: process.env.GROQ_API_KEY,
  };
  const question = {
    title: "Read active customers",
    prompt: "Return the active customer names.",
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
  const providerRequests: Array<{ messages: Array<{ role: string; content: string }> }> = [];

  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.GROQ_API_KEY = "test-groq-key";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }
    if (url.endsWith("/auth/v1/user")) {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-session");
      return new Response(JSON.stringify({ id: "test-user" }), { status: 200 });
    }
    if (url === "https://api.groq.com/openai/v1/chat/completions") {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{ role: string; content: string }>;
      };
      providerRequests.push(body);
      const isGeneration = body.messages[0]?.content.includes("Return only a JSON object");
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: isGeneration
                  ? JSON.stringify({ questions: [question] })
                  : "Your WHERE filter matches the requested active customers.",
              },
            },
          ],
        }),
        { status: 200 },
      );
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  };

  try {
    const authorization = { Authorization: "Bearer test-session" };
    const generated = await fetch(`${baseUrl}/api/practice/generate`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        category: "SQL Foundations",
        module: "Query Basics",
        topic: "WHERE",
        subtopic: "Filtering rows",
        difficulty: "Beginner",
        questionType: "WHERE",
        count: 1,
        learningContext: "Practice filtering rows.",
      }),
    });
    assert.equal(generated.status, 200);
    assert.deepEqual(await generated.json(), { questions: [question] });

    const executed = await fetch(`${baseUrl}/api/practice/execute`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        sql: "SELECT name FROM customers WHERE status = 'active'",
      }),
    });
    assert.equal(executed.status, 200);
    assert.deepEqual(await executed.json(), {
      ok: true,
      columns: ["name"],
      rows: [{ name: "Mina" }],
      rowLimit: 200,
      truncated: false,
    });

    const evaluated = await fetch(`${baseUrl}/api/practice/evaluate`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        context: {
          category: "SQL Foundations",
          module: "Query Basics",
          topic: "WHERE",
          subtopic: "Filtering rows",
        },
        question,
        sql: "SELECT name FROM customers WHERE status = 'active'",
        result: { ok: true, columns: ["name"], rows: [{ name: "Mina" }] },
        history: [{ role: "user", content: "Can you explain WHERE?" }],
        message: "Show an alternate approach.",
      }),
    });
    assert.equal(evaluated.status, 200);
    assert.deepEqual(await evaluated.json(), {
      reply: "Your WHERE filter matches the requested active customers.",
      mode: "ai",
    });

    assert.equal(providerRequests.length, 2);
    assert.match(providerRequests[1].messages[0].content, /Return the active customer names/);
    assert.match(providerRequests[1].messages[0].content, /Category: SQL Foundations/);
    assert.match(providerRequests[1].messages[0].content, /Module: Query Basics/);
    assert.match(providerRequests[1].messages[0].content, /Topic: WHERE/);
    assert.match(providerRequests[1].messages[0].content, /Subtopic: Filtering rows/);
    assert.match(providerRequests[1].messages[0].content, /Expected correct SQL answer: SELECT name FROM customers WHERE status = 'active'/);
    assert.match(providerRequests[1].messages[0].content, /SELECT name FROM customers/);
    assert.match(providerRequests[1].messages[0].content, /"name":"Mina"/);
    assert.equal(providerRequests[1].messages[1].content, "Can you explain WHERE?");
    assert.equal(providerRequests[1].messages[2].content, "Show an alternate approach.");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnvironment("SUPABASE_URL", previousEnvironment.supabaseUrl);
    restoreEnvironment("SUPABASE_PUBLISHABLE_KEY", previousEnvironment.supabaseKey);
    restoreEnvironment("GROQ_API_KEY", previousEnvironment.groqKey);
  }
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
