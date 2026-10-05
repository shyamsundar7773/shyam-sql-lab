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
  const invalidPath = await fetch(`${baseUrl}/api/learning-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      categoryId: "sql-foundations",
      topicId: "select-statements",
      subtopicId: "group-by-basics",
      category: "SQL Foundations",
      topic: "SELECT Statements",
      officialContent: '{"explanation":["Selecting columns."]}',
      history: [],
      question: "Explain SELECT.",
    }),
  });
  assert.equal(invalidPath.status, 400);

  const response = await fetch(`${baseUrl}/api/learning-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      categoryId: "sql-foundations",
      topicId: "select-statements",
      subtopicId: "selecting-columns",
      category: "SQL Foundations",
      topic: "SELECT Statements",
      officialContent: '{"explanation":["Matching keys return rows."]}',
      history: [],
      question: "Explain SELECT Statements.",
    }),
  });

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), {
    error: "Sign in to ask a learning question.",
  });
});

test("Topic Chat accepts a normal subtopic-grounded follow-up without practice questions", async () => {
  const originalFetch = globalThis.fetch;
  const previousEnvironment = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    groqKey: process.env.GROQ_API_KEY,
  };
  const groqRequests: Array<{ messages: Array<{ role: string; content: string }> }> = [];
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
      groqRequests.push(
        JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> },
      );
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "Hi! What would you like to learn?" } }] }),
        { status: 200 },
      );
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  };

  try {
    const response = await fetch(`${baseUrl}/api/learning-chat`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        categoryId: "sql-foundations",
        topicId: "select-statements",
        subtopicId: "selecting-columns",
        category: "SQL Foundations",
        topic: "SELECT Statements",
        officialContent: JSON.stringify({
          canonicalPath: {
            categoryId: "sql-foundations",
            topicId: "select-statements",
            subtopicId: "selecting-columns",
          },
          officialLesson: {
            title: "Selecting Columns",
            explanation: ["SELECT chooses output columns."],
            examples: [],
          },
        }),
        history: [],
        question: "hi",
      }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      reply: "Hi! What would you like to learn?",
      mode: "ai",
    });
    assert.equal(groqRequests.length, 1);
    assert.match(groqRequests[0].messages[0].content, /category_id=sql-foundations/);
    assert.match(groqRequests[0].messages[0].content, /topic_id=select-statements/);
    assert.match(groqRequests[0].messages[0].content, /subtopic_id=selecting-columns/);
    assert.equal(groqRequests[0].messages.at(-1)?.content, "hi");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnvironment.supabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousEnvironment.supabaseUrl;
    if (previousEnvironment.supabaseKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousEnvironment.supabaseKey;
    if (previousEnvironment.groqKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = previousEnvironment.groqKey;
  }
});

test("SQL practice generation rejects unauthenticated requests before contacting AI", async () => {
  const response = await fetch(`${baseUrl}/api/practice/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      categoryId: "sql-foundations",
      topicId: "select-statements",
      subtopicId: "selecting-columns",
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

test("Notes organizer preserves taxonomy, budgets batches, and handles provider rate limits", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  const organizerWarnings: string[] = [];
  const organizerErrors: string[] = [];
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
    moduleId: "sql-foundations",
    moduleName: "SQL Foundations",
    moduleIsNew: false,
    topicId: "select-statements",
    topicName: "SELECT Statements",
    topicIsNew: false,
    subtopicId: "selecting-columns",
    needsChanges: false,
    reason: "This chunk explains the SELECT list.",
  };
  let completionText = JSON.stringify({ items: [organizedItem] });
  let jsonModeRequested = false;
  let groqResponseStatus = 200;
  let groqResponseHeaders = new Headers();
  let groqErrorBody: unknown = { error: { message: "Provider rejected the request." } };
  let groqResponseStatusSequence: number[] | null = null;
  let groqResponseHeadersSequence: Headers[] | null = null;
  let autoCompletion = false;
  const groqRequests: Array<{
    max_completion_tokens: number;
    response_format?: { type?: string };
    messages: Array<{ role: string; content: string }>;
  }> = [];
  const groqRequestBodies: string[] = [];
  const mockGroqPayloadLimitBytes = 20_000;

  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.GROQ_API_KEY = "test-groq-key";
  console.warn = (...args) => organizerWarnings.push(args.map(String).join(" "));
  console.error = (...args) => organizerErrors.push(args.map(String).join(" "));
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "test-user" }), { status: 200 });
    }
    if (url === "https://api.groq.com/openai/v1/chat/completions") {
      const serializedRequest = String(init?.body);
      const requestBody = JSON.parse(serializedRequest) as {
        max_completion_tokens: number;
        response_format?: { type?: string };
        messages: Array<{ role: string; content: string }>;
      };
      groqRequests.push(requestBody);
      groqRequestBodies.push(serializedRequest);
      jsonModeRequested = requestBody.response_format?.type === "json_object";
      if (Buffer.byteLength(serializedRequest) > mockGroqPayloadLimitBytes) {
        return new Response(JSON.stringify({ error: "Request payload too large." }), { status: 413 });
      }
      const responseStatus = groqResponseStatusSequence?.shift() ?? groqResponseStatus;
      const responseHeaders = groqResponseHeadersSequence?.shift() ?? groqResponseHeaders;
      if (responseStatus !== 200) {
        return new Response(JSON.stringify(groqErrorBody), {
          status: responseStatus,
          headers: responseHeaders,
        });
      }
      let responseText = completionText;
      if (autoCompletion) {
        const userMessage = requestBody.messages.find((message) => message.role === "user")?.content ?? "{}";
        const sentInput = JSON.parse(userMessage) as { chunks: string[] };
        responseText = JSON.stringify({
          items: sentInput.chunks.map((content, index) => ({
            ...organizedItem,
            title: `Organized item ${index + 1}`,
            content,
          })),
        });
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: responseText } }] }),
        { status: 200, headers: responseHeaders },
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
          moduleName: "SQL Foundations",
          moduleIsNew: false,
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
          moduleId: "sql-foundations",
          moduleName: "SQL Foundations",
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

    const retryChunks = Array.from(
      { length: 10 },
      (_, index) => `Unresolved SQL note ${index + 1}: ${"source text ".repeat(70)}`,
    );
    const previousResult = retryChunks.map((_, index) => ({
      ...organizedItem,
      title: `Unresolved note ${index + 1}`,
      content: "x".repeat(3_500),
      needsChanges: true,
      reason: "The suggested location needs review against the current Learning Path.",
    }));
    assert.ok(JSON.stringify(previousResult).length < 50_000);
    assert.ok(Buffer.byteLength(JSON.stringify(previousResult)) > mockGroqPayloadLimitBytes);
    const firstRetryRequestIndex = groqRequests.length;
    autoCompletion = true;
    completionText = JSON.stringify({
      items: retryChunks.map((_, index) => ({
        ...organizedItem,
        title: `Reorganized note ${index + 1}`,
      })),
    });
    const reorganizedResponse = await fetch(`${baseUrl}/api/notes/organize`, {
      method: "POST",
      headers: {
        Authorization: "Bearer organizer-test-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chunks: retryChunks,
        previousResult,
      }),
    });
    assert.equal(reorganizedResponse.status, 200);
    const retryRequests = groqRequests.slice(firstRetryRequestIndex);
    const retryPayloads = retryRequests.map((requestBody) => JSON.parse(
      requestBody.messages.find((message) => message.role === "user")?.content ?? "{}",
    ) as { chunks: string[]; previousResult: Array<Record<string, unknown>> });
    assert.ok(retryRequests.length > 1, "oversized request is split into sequential batches");
    assert.ok(retryRequests.every((requestBody) => requestBody.max_completion_tokens === 3_000));
    assert.deepEqual(retryPayloads.flatMap((payload) => payload.chunks), retryChunks.map((chunk) => chunk.trim()));
    assert.deepEqual(retryPayloads.flatMap((payload) => payload.previousResult).map((item) => item.title),
      previousResult.map((item) => item.title));
    assert.equal(retryPayloads[0]?.previousResult[0]?.reason, previousResult[0]?.reason);
    assert.equal(retryPayloads[0]?.previousResult[0]?.needsChanges, true);
    assert.equal("content" in (retryPayloads[0]?.previousResult[0] ?? {}), false);
    assert.ok(groqRequestBodies.slice(firstRetryRequestIndex)
      .every((body) => Buffer.byteLength(body) <= mockGroqPayloadLimitBytes));

    const largeSourceChunks = [
      `SELECT * FROM notes WHERE topic_id = 42; -- ${"{}[](),.;:=<>+-*/ ".repeat(80).trimEnd()}`,
      `${"漢字かなカナ".repeat(45)}${"🧪🚀✨".repeat(45)}`,
      `Source chunk C ${"original text ".repeat(90).trimEnd()}`,
    ];
    const firstBudgetedCall = groqRequests.length;
    groqResponseHeadersSequence = [
      new Headers({
        "x-ratelimit-remaining-tokens": "3685",
        "x-ratelimit-reset-tokens": "32.362s",
      }),
      new Headers(),
    ];
    const budgetStartTime = Date.now();
    const splitResponse = await fetch(`${baseUrl}/api/notes/organize`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chunks: largeSourceChunks }),
    });
    assert.equal(splitResponse.status, 200);
    const splitRequests = groqRequests.slice(firstBudgetedCall);
    const splitPayloads = splitRequests.map((requestBody) => JSON.parse(
      requestBody.messages.find((message) => message.role === "user")?.content ?? "{}",
    ) as { chunks: string[] });
    assert.ok(splitRequests.length > 1, "request token budget splits batches");
    assert.deepEqual(splitPayloads.flatMap((payload) => payload.chunks), largeSourceChunks);
    const chunkOccurrences = splitPayloads.flatMap((payload) => payload.chunks);
    assert.equal(new Set(chunkOccurrences).size, largeSourceChunks.length);
    assert.deepEqual(chunkOccurrences, largeSourceChunks);
    assert.ok(splitPayloads.flatMap((payload) => payload.chunks).some((chunk) => /漢字|🧪/.test(chunk)));
    assert.ok(splitPayloads.flatMap((payload) => payload.chunks).some((chunk) => /[{}[\];:=<>+*/]/.test(chunk)));
    assert.ok(Date.now() - budgetStartTime >= 32_000, "a 32-second token reset is respected");
    assert.ok(splitRequests.every((requestBody) => requestBody.max_completion_tokens === 3_000));

    groqResponseHeadersSequence = [
      new Headers({
        "x-ratelimit-remaining-tokens": "0",
        "x-ratelimit-reset-tokens": "60.001s",
      }),
    ];
    const overMaximumResetCallCount = groqRequests.length;
    const overMaximumReset = await fetch(`${baseUrl}/api/notes/organize`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chunks: largeSourceChunks }),
    });
    assert.equal(overMaximumReset.status, 502);
    assert.equal(groqRequests.length - overMaximumResetCallCount, 1,
      "token reset beyond 60 seconds is not waited through");
    assert.ok(organizerErrors.some((line) =>
      line.includes('"retryAfterMs":60001') && line.includes('"retryable":false'),
    ));
    groqResponseHeadersSequence = null;

    const oversizedChunk = "!;".repeat(5_000);
    const oversizedCallCount = groqRequests.length;
    const oversizedChunkResponse = await fetch(`${baseUrl}/api/notes/organize`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chunks: [oversizedChunk] }),
    });
    assert.equal(oversizedChunkResponse.status, 413);
    const oversizedChunkBody = await oversizedChunkResponse.json();
    assert.deepEqual(oversizedChunkBody, {
      code: "ORGANIZER_REQUEST_TOO_LARGE",
      error: "A note is too large to organize safely in one request.",
    });
    assert.equal(groqRequests.length, oversizedCallCount, "a single oversized chunk is rejected before provider calls");
    assert.ok(!JSON.stringify(oversizedChunkBody).includes(oversizedChunk));

    groqResponseStatus = 429;
    groqErrorBody = {
      error: {
        code: "insufficient_quota",
        type: "insufficient_quota",
        message: "Account quota exhausted for SELECT notes; api_key=gsk_sensitive_fake_key",
      },
    };
    groqResponseHeaders = new Headers();
    const quotaCallCount = groqRequests.length;
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
    const providerFailureBody = await providerFailure.json();
    assert.deepEqual(providerFailureBody, {
      code: "AI_PROVIDER_REJECTED",
      error: "AI note organization is temporarily unavailable. Please retry.",
    });
    assert.equal(groqRequests.length - quotaCallCount, 1, "quota 429 is not retried");
    const providerSensitiveText = "Account quota exhausted for SELECT notes; api_key=gsk_sensitive_fake_key";
    assert.ok(!organizerWarnings.join("\n").includes(providerSensitiveText));
    assert.ok(!organizerErrors.join("\n").includes(providerSensitiveText));
    assert.ok(!organizerWarnings.join("\n").includes("SELECT notes"));
    assert.ok(!organizerErrors.join("\n").includes("SELECT notes"));
    assert.ok(!organizerWarnings.join("\n").includes("gsk_sensitive_fake_key"));
    assert.ok(!organizerErrors.join("\n").includes("gsk_sensitive_fake_key"));
    assert.ok(!JSON.stringify(providerFailureBody).includes("gsk_sensitive_fake_key"));
    assert.ok(!JSON.stringify(providerFailureBody).includes("SELECT notes"));

    groqResponseStatus = 200;
    groqResponseStatusSequence = [429, 200];
    groqResponseHeadersSequence = [
      new Headers({ "retry-after": "0.02" }),
      new Headers(),
    ];
    groqErrorBody = {
      error: {
        code: "rate_limit_exceeded",
        type: "rate_limit_error",
        message: "Rate limit exceeded.",
      },
    };
    const transientCallCount = groqRequests.length;
    const retryStartTime = Date.now();
    const recoveredRateLimit = await fetch(`${baseUrl}/api/notes/organize`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chunks: ["A SQL SELECT query returns requested columns."] }),
    });
    assert.equal(recoveredRateLimit.status, 200);
    assert.equal(groqRequests.length - transientCallCount, 2, "transient 429 is retried once");
    assert.ok(Date.now() - retryStartTime >= 15, "retry-after delay is honored");
    assert.ok(organizerWarnings.some((line) =>
      line.includes('"providerType":"rate_limit"') &&
      line.includes('"retryAfterMs":20') &&
      line.includes('"rateLimit":{"retryAfter":"0.02"'),
    ));
    assert.ok(organizerWarnings.every((line) => !line.includes("A SQL SELECT query")));

    groqResponseStatusSequence = [429, 429, 200];
    groqResponseHeadersSequence = [
      new Headers({ "retry-after": "0" }),
      new Headers({ "retry-after": "0" }),
      new Headers(),
    ];
    const exhaustedRetryCount = groqRequests.length;
    const exhaustedRetry = await fetch(`${baseUrl}/api/notes/organize`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chunks: ["A SQL SELECT query returns requested columns."] }),
    });
    assert.equal(exhaustedRetry.status, 502);
    assert.equal(groqRequests.length - exhaustedRetryCount, 2, "a persistent transient 429 is retried only once");

    groqResponseStatusSequence = null;
    groqResponseHeadersSequence = null;
    groqResponseStatus = 429;
    groqResponseHeaders = new Headers({ "retry-after": "60.001" });
    const boundedWaitCount = groqRequests.length;
    const boundedWaitStart = Date.now();
    const boundedWaitFailure = await fetch(`${baseUrl}/api/notes/organize`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chunks: ["A SQL SELECT query returns requested columns."] }),
    });
    assert.equal(boundedWaitFailure.status, 502);
    assert.equal(groqRequests.length - boundedWaitCount, 1, "retry wait beyond the bound is not attempted");
    assert.ok(Date.now() - boundedWaitStart < 1_000, "excessive Retry-After does not block the API");

  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
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
    const invalidPath = await fetch(`${baseUrl}/api/practice/generate`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: "sql-foundations",
        topicId: "aggregations",
        subtopicId: "group-by-basics",
        difficulty: "Beginner",
        questionType: "SELECT",
        count: 1,
        learningContext: "This path has an invalid category/topic relationship.",
      }),
    });
    assert.equal(invalidPath.status, 400);
    assert.equal(providerRequests.length, 0);

    const generated = await fetch(`${baseUrl}/api/practice/generate`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: "sql-foundations",
        topicId: "select-statements",
        subtopicId: "filtering-rows",
        difficulty: "Beginner",
        questionType: "WHERE",
        count: 1,
        learningContext: "Practice filtering rows.",
      }),
    });
    assert.equal(generated.status, 200);
    assert.deepEqual(await generated.json(), { questions: [question] });
    assert.deepEqual(
      JSON.parse(providerRequests[0].messages[1].content),
      {
        categoryId: "sql-foundations",
        topicId: "select-statements",
        subtopicId: "filtering-rows",
        category: "SQL Foundations",
        topic: "SELECT Statements",
        subtopic: "Filtering Rows",
        difficulty: "Beginner",
        questionType: "WHERE",
        count: 1,
        learningContext: "Practice filtering rows.",
      },
    );

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
          categoryId: "sql-foundations",
          topicId: "select-statements",
          subtopicId: "filtering-rows",
          category: "SQL Foundations",
          topic: "SELECT Statements",
          subtopic: "Filtering Rows",
        },
        question,
        draftSql: "SELECT name FROM customers WHERE status = 'active'",
        execution: {
          status: "succeeded",
          sql: "SELECT name FROM customers WHERE status = 'active'",
          result: { ok: true, columns: ["name"], rows: [{ name: "Mina" }] },
        },
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
    assert.match(providerRequests[0].messages[0].content, /sql-foundations/);
    assert.match(providerRequests[0].messages[0].content, /select-statements/);
    assert.match(providerRequests[0].messages[0].content, /filtering-rows/);
    assert.match(providerRequests[1].messages[0].content, /Return the active customer names/);
    assert.match(providerRequests[1].messages[0].content, /Category: SQL Foundations/);
    assert.match(providerRequests[1].messages[0].content, /Canonical curriculum IDs: category_id=sql-foundations, topic_id=select-statements, subtopic_id=filtering-rows/);
    assert.match(providerRequests[1].messages[0].content, /Topic: SELECT Statements/);
    assert.match(providerRequests[1].messages[0].content, /Subtopic: Filtering Rows/);
    assert.match(providerRequests[1].messages[0].content, /Expected correct SQL answer: SELECT name FROM customers WHERE status = 'active'/);
    assert.match(providerRequests[1].messages[0].content, /The SQL and result below are from a real execution attempt/);
    assert.match(providerRequests[1].messages[0].content, /"status":"succeeded"/);
    assert.match(providerRequests[1].messages[0].content, /SELECT name FROM customers/);
    assert.match(providerRequests[1].messages[0].content, /"name":"Mina"/);
    assert.equal(providerRequests[1].messages[1].content, "Can you explain WHERE?");
    assert.equal(providerRequests[1].messages[2].content, "Show an alternate approach.");

    const unexecuted = await fetch(`${baseUrl}/api/practice/evaluate`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        context: {
          categoryId: "sql-foundations",
          topicId: "select-statements",
          subtopicId: "filtering-rows",
          category: "SQL Foundations",
          topic: "SELECT Statements",
          subtopic: "Filtering Rows",
        },
        question,
        draftSql: "SELECT name FROM customers",
        execution: { status: "not_executed" },
        history: [],
        message: "Is my query correct?",
      }),
    });
    assert.equal(unexecuted.status, 200);
    assert.match(
      providerRequests[2].messages[0].content,
      /No executed SQL answer exists yet/,
    );
    assert.match(
      providerRequests[2].messages[0].content,
      /If asked for evaluation, explain that there is no executed answer to evaluate/,
    );
    assert.match(
      providerRequests[2].messages[0].content,
      /Current SQL editor draft \(not necessarily executed\): SELECT name FROM customers/,
    );
    assert.match(
      providerRequests[2].messages[0].content,
      /SQL execution context: \{"status":"not_executed"\}/,
    );

    const failedExecution = await fetch(`${baseUrl}/api/practice/evaluate`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        context: {
          categoryId: "sql-foundations",
          topicId: "select-statements",
          subtopicId: "filtering-rows",
          category: "SQL Foundations",
          topic: "SELECT Statements",
          subtopic: "Filtering Rows",
        },
        question,
        draftSql: "SELECT missing FROM customers",
        execution: {
          status: "failed",
          sql: "SELECT missing FROM customers",
          result: {
            ok: false,
            columns: [],
            rows: [],
            error: "no such column: missing",
          },
        },
        history: [],
        message: "Why did this fail?",
      }),
    });
    assert.equal(failedExecution.status, 200);
    assert.match(
      providerRequests[3].messages[0].content,
      /A failed execution has an actual SQL error/,
    );
    assert.match(providerRequests[3].messages[0].content, /no such column: missing/);

    const invalidExecution = await fetch(`${baseUrl}/api/practice/evaluate`, {
      method: "POST",
      headers: { ...authorization, "Content-Type": "application/json" },
      body: JSON.stringify({
        context: {
          categoryId: "sql-foundations",
          topicId: "select-statements",
          subtopicId: "filtering-rows",
          category: "SQL Foundations",
          topic: "SELECT Statements",
          subtopic: "Filtering Rows",
        },
        question,
        draftSql: "SELECT 1",
        execution: {
          status: "succeeded",
          sql: "SELECT 1",
          result: { ok: false, columns: [], rows: [], error: "syntax error" },
        },
        history: [],
        message: "Evaluate.",
      }),
    });
    assert.equal(invalidExecution.status, 400);
    assert.equal(providerRequests.length, 4);
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
