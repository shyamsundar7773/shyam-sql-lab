import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";

import { sqlLearningCategories } from "../../../src/data/sqlLearningContent.js";
import {
  createTopicLessonSections,
  getNextRuntimeItemPath,
  getRuntimeSequenceItem,
  topicChatIncompleteNotice,
} from "../../../src/lib/topic-lesson.js";

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

function parseGeminiMockRequest(url: string, body: BodyInit | null | undefined) {
  const request = JSON.parse(String(body)) as {
    systemInstruction?: { parts?: { text?: string }[] };
    contents?: { role?: string; parts?: { text?: string }[] }[];
    generationConfig?: {
      maxOutputTokens?: number;
      responseMimeType?: string;
    };
  };
  const model = /\/models\/([^:]+):generateContent/.exec(url)?.[1] ?? "";
  const systemText = request.systemInstruction?.parts
    ?.map((part) => part.text ?? "")
    .join("\n") ?? "";
  return {
    model: decodeURIComponent(model),
    max_tokens: request.generationConfig?.maxOutputTokens,
    max_completion_tokens: request.generationConfig?.maxOutputTokens,
    response_format: request.generationConfig?.responseMimeType === "application/json"
      ? { type: "json_object" }
      : undefined,
    messages: [
      ...(systemText ? [{ role: "system", content: systemText }] : []),
      ...(request.contents ?? []).map((item) => ({
        role: item.role === "model" ? "assistant" : item.role ?? "user",
        content: item.parts?.map((part) => part.text ?? "").join("\n") ?? "",
      })),
    ],
  };
}

function geminiMockCompletion(
  text: string,
  finishReason = "STOP",
  completionTokens = 32,
) {
  const normalizedFinishReason = finishReason === "stop"
    ? "STOP"
    : finishReason === "length"
      ? "MAX_TOKENS"
      : finishReason;
  return JSON.stringify({
    candidates: [{
      content: { parts: [{ text }] },
      finishReason: normalizedFinishReason,
    }],
    usageMetadata: { candidatesTokenCount: completionTokens },
  });
}

test("health check responds successfully to GET and POST", async () => {
  for (const method of ["GET", "POST"]) {
    const response = await fetch(`${baseUrl}/api/health`, { method });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: "ok",
      service: "shyam-sql-lab-api",
      buildRevision: process.env.RENDER_GIT_COMMIT?.slice(0, 12) ?? null,
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
    code: "INVALID_CHAT_REQUEST",
    error: "Provide valid canonical IDs, up to 20 history messages, and a question.",
  });
});

test("learning chat rejects requests without authentication", async () => {
  const invalidPath = await fetch(`${baseUrl}/api/learning-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      categoryId: "sql-database-fundamentals",
      topicId: "what-is-sql",
      subtopicId: "what-is-data",
      history: [],
      question: "Explain SELECT.",
    }),
  });
  assert.equal(invalidPath.status, 400);
  assert.deepEqual(await invalidPath.json(), {
    code: "INVALID_CURRICULUM_PATH",
    error: "The selected categoryId, topicId, and subtopicId do not resolve to one canonical curriculum path.",
  });
  for (const invalidIds of [
    {
      categoryId: "missing-category",
      topicId: "select-statements",
      subtopicId: "selecting-columns",
    },
    {
      categoryId: "sql-data-types",
      topicId: "what-is-sql",
      subtopicId: "introduction-to-sql",
    },
    {
      categoryId: "sql-foundations",
      topicId: "missing-topic",
      subtopicId: "selecting-columns",
    },
  ]) {
    const invalidParent = await fetch(`${baseUrl}/api/learning-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...invalidIds, history: [], question: "Explain this." }),
    });
    assert.equal(invalidParent.status, 400);
    assert.equal((await invalidParent.json() as { code: string }).code, "INVALID_CURRICULUM_PATH");
  }

  const response = await fetch(`${baseUrl}/api/learning-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      categoryId: "sql-database-fundamentals",
      topicId: "what-is-sql",
      subtopicId: "introduction-to-sql",
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
    geminiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL,
  };
  const geminiRequests: Array<{
    model: string;
    max_tokens: number;
    messages: Array<{ role: string; content: string }>;
  }> = [];
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "test-user" }), { status: 200 });
    }
    if (url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent") {
      geminiRequests.push(
        parseGeminiMockRequest(url, init?.body) as {
          model: string;
          max_tokens: number;
          messages: Array<{ role: string; content: string }>;
        },
      );
      return new Response(
        geminiMockCompletion(
          "A SELECT statement chooses which columns appear in a query result.\n\nFor example, `SELECT employee_name FROM employees;` returns only the employee_name column. Use a comma-separated list after SELECT when you need multiple columns; the selected column order determines the output order.",
          "STOP",
          72,
        ),
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
        officialContent: "Client lesson must not become authoritative curriculum content.",
        savedLearningNotes: [{
          title: "My SELECT note",
          source: "user",
          content: "Saved note relevant to selecting columns.",
        }],
        history: [
          { role: "user", content: "What is a column?" },
          { role: "assistant", content: "A column stores one kind of value in a table." },
        ],
        question: "Explain selecting columns.",
      }),
    });
    assert.equal(response.status, 200);
    const responseBody = await response.json() as {
      reply: string;
      mode: string;
      incomplete: boolean;
      lessonProgress: {
        sectionIndex: number;
        sectionTitle: string;
        sectionComplete: boolean;
        hasNextSection: boolean;
        nextSectionTitle: string | null;
      };
    };
    const selectingColumns = sqlLearningCategories
      .find((category) => category.id === "sql-foundations")!
      .topics.find((topic) => topic.id === "select-statements")!
      .subtopics.find((subtopic) => subtopic.id === "selecting-columns")!;
    const selectingColumnSections = createTopicLessonSections(selectingColumns);
    assert.deepEqual(responseBody, {
      reply: `## Lesson Section 1 of ${selectingColumnSections.length}: ${selectingColumnSections[0].title}\n\nA SELECT statement chooses which columns appear in a query result.\n\nFor example, \`SELECT employee_name FROM employees;\` returns only the employee_name column. Use a comma-separated list after SELECT when you need multiple columns; the selected column order determines the output order.`,
      mode: "ai",
      incomplete: false,
      lessonProgress: {
        sectionIndex: 1,
        sectionTitle: selectingColumnSections[0].title,
        sectionComplete: true,
        hasNextSection: true,
        nextSectionTitle: selectingColumnSections[1].title,
      },
    });
    assert.equal(geminiRequests.length, 1);
    assert.equal(geminiRequests[0].model, "gemini-3.5-flash-lite");
    assert.equal(geminiRequests[0].max_tokens, 4_096);
    assert.match(geminiRequests[0].messages[0].content, /category_id=sql-foundations/);
    assert.match(geminiRequests[0].messages[0].content, /topic_id=select-statements/);
    assert.match(geminiRequests[0].messages[0].content, /subtopic_id=selecting-columns/);
    assert.match(
      geminiRequests[0].messages[0].content,
      /CURRENT CURRICULUM UNIT:\nCategory: SQL Foundations\nTopic: SELECT Statements\nSubtopic: Selecting Columns/,
    );
    assert.match(geminiRequests[0].messages[0].content, /You are teaching ONE CURRENT RUNTIME LEARNING ITEM/);
    assert.match(geminiRequests[0].messages[0].content, /Teach the CURRENT RUNTIME LEARNING ITEM, not the whole subtopic/);
    assert.match(geminiRequests[0].messages[0].content, /Do not output a giant structured lesson, document, Part I\/II outline/);
    assert.match(geminiRequests[0].messages[0].content, /CURRENT RUNTIME LEARNING ITEM:\nItem 1 of \d+: Core Idea: Selecting Columns/);
    assert.match(geminiRequests[0].messages[0].content, /Teach only this item\. Finish it before stopping/);
    assert.match(geminiRequests[0].messages[0].content, /Do not start the next runtime item/);
    assert.match(geminiRequests[0].messages[0].content, /The runtime list is navigation metadata only/);
    assert.match(
      geminiRequests[0].messages[0].content,
      /A SELECT statement defines which columns should appear in a SQL query result/,
    );
    assert.match(geminiRequests[0].messages[0].content, /Saved note relevant to selecting columns/);
    assert.equal(
      geminiRequests[0].messages[0].content.includes("Client lesson must not become authoritative"),
      false,
    );
    assert.deepEqual(geminiRequests[0].messages.slice(-3), [
      { role: "user", content: "What is a column?" },
      { role: "assistant", content: "A column stores one kind of value in a table." },
      { role: "user", content: "Explain selecting columns." },
    ]);

    const newCategoryResponse = await fetch(`${baseUrl}/api/learning-chat`, {
      method: "POST",
      headers: {
        Authorization: ["Bearer", "test-token"].join(" "),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        categoryId: "sql-database-fundamentals",
        topicId: "what-is-sql",
        subtopicId: "introduction-to-sql",
        moduleId: "obsolete-and-ignored",
        history: [],
        question: "What does SQL do?",
      }),
    });
    assert.equal(
      newCategoryResponse.status,
      200,
      JSON.stringify(await newCategoryResponse.json()),
    );
    assert.equal(geminiRequests.length, 2);
    assert.match(geminiRequests[1].messages[0].content, /category_id=sql-database-fundamentals/);
    assert.match(geminiRequests[1].messages[0].content, /topic_id=what-is-sql/);
    assert.match(geminiRequests[1].messages[0].content, /subtopic_id=introduction-to-sql/);
    assert.match(
      geminiRequests[1].messages[0].content,
      /Structured Query Language is the standardized programming language used to manage, query, and manipulate data stored in relational databases\./,
    );
    assert.match(geminiRequests[1].messages[0].content, /The current item is the content target\. The sequence list is just a learning plan for navigation\./i);
    assert.equal(geminiRequests[1].messages.at(-1)?.content, "What does SQL do?");

    const separateSubtopic = await fetch(`${baseUrl}/api/learning-chat`, {
      method: "POST",
      headers: {
        Authorization: ["Bearer", "test-token"].join(" "),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        categoryId: "sql-database-fundamentals",
        topicId: "what-is-sql",
        subtopicId: "purpose-of-sql",
        history: [],
        question: "Why use SQL?",
      }),
    });
    assert.equal(separateSubtopic.status, 200);
    assert.equal(geminiRequests.length, 3);
    assert.match(geminiRequests[2].messages[0].content, /subtopic_id=purpose-of-sql/);
    assert.match(
      geminiRequests[2].messages[0].content,
      /The main purpose of SQL is to provide a unified way to retrieve, insert, update, delete, and manage database records efficiently\./,
    );
    assert.equal(
      geminiRequests[2].messages[0].content.includes(
        "Structured Query Language is the standardized programming language",
      ),
      false,
    );
    assert.equal(geminiRequests[2].messages.at(-1)?.content, "Why use SQL?");

    const selectingColumnsSectionHeading =
      `## Lesson Section 1 of ${selectingColumnSections.length}: ${selectingColumnSections[0].title}\n\n`;
    for (const question of ["Give me another example.", "Go deeper."]) {
      const followUpResponse = await fetch(`${baseUrl}/api/learning-chat`, {
        method: "POST",
        headers: {
          Authorization: ["Bearer", "test-token"].join(" "),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          categoryId: "sql-foundations",
          topicId: "select-statements",
          subtopicId: "selecting-columns",
          history: [
            { role: "user", content: "Explain selecting columns." },
            {
              role: "assistant",
              content: `${selectingColumnsSectionHeading}A SELECT statement chooses query result columns.`,
            },
          ],
          question,
        }),
      });
      assert.equal(followUpResponse.status, 200);
    }
    assert.equal(geminiRequests.length, 5);
    for (const requestBody of geminiRequests.slice(3)) {
      assert.match(requestBody.messages[0].content, /Category: SQL Foundations\nTopic: SELECT Statements\nSubtopic: Selecting Columns/);
      assert.match(requestBody.messages[0].content, /Do not teach or preview the next subtopic/);
      assert.match(requestBody.messages[0].content, /CURRENT RUNTIME LEARNING ITEM:\nItem 1 of \d+: Core Idea: Selecting Columns/);
      assert.match(requestBody.messages.at(-1)?.content ?? "", /another example|go deeper/i);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnvironment.supabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousEnvironment.supabaseUrl;
    if (previousEnvironment.supabaseKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousEnvironment.supabaseKey;
    if (previousEnvironment.geminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousEnvironment.geminiKey;
    if (previousEnvironment.geminiModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousEnvironment.geminiModel;
  }
});

test("Topic Chat Continue advances sections only within the current subtopic", async () => {
  const originalFetch = globalThis.fetch;
  const previousEnvironment = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    geminiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL,
  };
  const providerRequests: {
    messages: { role: string; content: string }[];
  }[] = [];
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "test-user" }), { status: 200 });
    }
    if (url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent") {
      providerRequests.push(parseGeminiMockRequest(url, init?.body) as {
        messages: { role: string; content: string }[];
      });
      return new Response(geminiMockCompletion("A complete explanation for this section.", "STOP", 35), {
        status: 200,
      });
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  };

  try {
    const category = sqlLearningCategories.find((item) => item.id === "sql-database-fundamentals")!;
    const topic = category.topics.find((item) => item.id === "what-is-sql")!;
    const subtopic = topic.subtopics[0];
    const sections = createTopicLessonSections(subtopic);
    const requestHeaders = {
      Authorization: ["Bearer", "test-token"].join(" "),
      "Content-Type": "application/json",
    };
    const path = {
      categoryId: category.id,
      topicId: topic.id,
      subtopicId: subtopic.id,
    };
    const firstQuestion = "Teach me this subtopic properly from the basics.";
    const firstResponse = await fetch(`${baseUrl}/api/learning-chat`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({ ...path, history: [], question: firstQuestion }),
    });
    assert.equal(firstResponse.status, 200);
    let result = await firstResponse.json() as {
      reply: string;
      lessonProgress: {
        sectionIndex: number;
        sectionTitle: string;
        sectionComplete: boolean;
        hasNextSection: boolean;
        nextSectionTitle: string | null;
      };
    };
    assert.deepEqual(result.lessonProgress, {
      sectionIndex: 1,
      sectionTitle: sections[0].title,
      sectionComplete: true,
      hasNextSection: true,
      nextSectionTitle: sections[1].title,
    });
    let history: { role: string; content: string }[] = [
      { role: "user", content: firstQuestion },
      { role: "assistant", content: result.reply },
    ];

    for (let sectionIndex = 2; sectionIndex <= sections.length; sectionIndex += 1) {
      const question = `Continue to the next lesson section: ${sections[sectionIndex - 1].title}.`;
      const response = await fetch(`${baseUrl}/api/learning-chat`, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify({
          ...path,
          history,
          question,
          lessonAction: { type: "next-section" },
        }),
      });
      assert.equal(response.status, 200);
      result = await response.json() as typeof result;
      assert.equal(result.lessonProgress.sectionIndex, sectionIndex);
      assert.equal(result.lessonProgress.sectionTitle, sections[sectionIndex - 1].title);
      assert.equal(result.lessonProgress.sectionComplete, true);
      assert.equal(result.lessonProgress.hasNextSection, sectionIndex < sections.length);
      assert.equal(
        result.lessonProgress.nextSectionTitle,
        sections[sectionIndex]?.title ?? null,
      );
      assert.match(
        providerRequests.at(-1)?.messages[0].content ?? "",
        /CURRENT RUNTIME LEARNING ITEM:\s*\n/i,
      );
      assert.match(
        providerRequests.at(-1)?.messages[0].content ?? "",
        new RegExp(`CURRENT RUNTIME LEARNING ITEM:\\s*\\n.*${sections[sectionIndex - 1].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
      );
      assert.match(
        providerRequests.at(-1)?.messages[0].content ?? "",
        /Advance only after the current runtime item is fully taught/,
      );
      history = [
        ...history,
        { role: "user", content: question },
        { role: "assistant", content: result.reply },
      ];
    }

    const providerRequestCount = providerRequests.length;
    const invalidAdvance = await fetch(`${baseUrl}/api/learning-chat`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        ...path,
        history,
        question: "Continue to another section.",
        lessonAction: { type: "next-section" },
      }),
    });
    assert.equal(invalidAdvance.status, 400);
    assert.deepEqual(await invalidAdvance.json(), {
      code: "INVALID_LESSON_PROGRESSION",
      error: "Complete the current lesson section before requesting its next section.",
    });
    assert.equal(providerRequests.length, providerRequestCount);
    assert.ok(providerRequests.every((request) =>
      request.messages[0].content.includes(
        `category_id=${category.id}, topic_id=${topic.id}, subtopic_id=${subtopic.id}`,
      ),
    ));
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnvironment.supabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousEnvironment.supabaseUrl;
    if (previousEnvironment.supabaseKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousEnvironment.supabaseKey;
    if (previousEnvironment.geminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousEnvironment.geminiKey;
    if (previousEnvironment.geminiModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousEnvironment.geminiModel;
  }
});

test("Topic Chat detects output limits and continues from the saved reply", async () => {
  const originalFetch = globalThis.fetch;
  const previousEnvironment = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    geminiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL,
  };
  const providerReply = `Partial explanation:\n\n${"Each row represents one order. ".repeat(180)}`;
  const continuationReply = "That completes the explanation.";
  const providerResponses = [
    { content: providerReply, finishReason: "length" },
    { content: continuationReply, finishReason: "stop" },
    { content: continuationReply, finishReason: "stop" },
  ];
  const geminiRequests: Array<{
    model: string;
    max_tokens: number;
    messages: Array<{ role: string; content: string }>;
  }> = [];
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_MODEL = "gemini-3.5-flash-lite";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "test-user" }), { status: 200 });
    }
    if (url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent") {
      geminiRequests.push(parseGeminiMockRequest(url, init?.body) as {
        model: string;
        max_tokens: number;
        messages: Array<{ role: string; content: string }>;
      });
      const next = providerResponses.shift();
      if (!next) {
        throw new Error("Unexpected extra Topic Chat provider request.");
      }
      return new Response(geminiMockCompletion(
        next.content,
        next.finishReason,
        next.finishReason === "length" ? 4_096 : 8,
      ), { status: 200 });
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  };

  try {
    const requestHeaders = {
      Authorization: ["Bearer", "test-token"].join(" "),
      "Content-Type": "application/json",
    };
    const question = "Explain how to count orders by day.";
    const firstResponse = await fetch(`${baseUrl}/api/learning-chat`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        categoryId: "sql-foundations",
        topicId: "select-statements",
        subtopicId: "selecting-columns",
        history: [],
        question,
      }),
    });
    assert.equal(firstResponse.status, 200);
    const firstResult = await firstResponse.json() as {
      reply: string;
      mode: string;
      incomplete: boolean;
      lessonProgress: {
        sectionIndex: number;
        sectionTitle: string;
        sectionComplete: boolean;
        hasNextSection: boolean;
        nextSectionTitle: string | null;
      };
    };
    assert.equal(firstResult.mode, "ai");
    assert.equal(firstResult.incomplete, true);
    assert.equal(
      firstResult.reply,
      `## Lesson Section 1 of ${createTopicLessonSections(
        sqlLearningCategories.find((item) => item.id === "sql-foundations")!
          .topics.find((item) => item.id === "select-statements")!
          .subtopics.find((item) => item.id === "selecting-columns")!,
      ).length}: Core Idea: Selecting Columns\n\n${providerReply}\n\n${topicChatIncompleteNotice}`,
    );
    assert.ok(firstResult.reply.length > 4_000);
    assert.equal(firstResult.lessonProgress.sectionComplete, false);
    assert.equal(firstResult.lessonProgress.hasNextSection, false);
    assert.equal(firstResult.lessonProgress.nextSectionTitle, null);

    const continuationResponse = await fetch(`${baseUrl}/api/learning-chat`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        categoryId: "sql-foundations",
        topicId: "select-statements",
        subtopicId: "selecting-columns",
        history: [
          { role: "user", content: question },
          { role: "assistant", content: firstResult.reply },
        ],
        question: "continue",
      }),
    });
    assert.equal(continuationResponse.status, 200);
    const continuedResult = await continuationResponse.json() as {
      reply: string;
      mode: string;
      incomplete: boolean;
      lessonProgress: {
        sectionIndex: number;
        sectionTitle: string;
        sectionComplete: boolean;
        hasNextSection: boolean;
        nextSectionTitle: string | null;
      };
    };
    assert.deepEqual(continuedResult, {
      reply: `${firstResult.reply.match(/^## Lesson Section \d+ of \d+: .+\n\n/)?.[0] ?? ""}${continuationReply}`,
      mode: "ai",
      incomplete: false,
      lessonProgress: {
        sectionIndex: 1,
        sectionTitle: "Core Idea: Selecting Columns",
        sectionComplete: true,
        hasNextSection: true,
        nextSectionTitle: createTopicLessonSections(
          sqlLearningCategories.find((item) => item.id === "sql-foundations")!
            .topics.find((item) => item.id === "select-statements")!
            .subtopics.find((item) => item.id === "selecting-columns")!,
        )[1].title,
      },
    });

    assert.equal(geminiRequests.length, 2);
    assert.ok(geminiRequests.every((requestBody) =>
      requestBody.model === "gemini-3.5-flash-lite",
    ));
    assert.ok(geminiRequests.every((requestBody) =>
      requestBody.max_tokens === 4_096,
    ));
    const continuationMessages = geminiRequests[1].messages;
    assert.match(
      continuationMessages[0].content,
      /Continue the CURRENT RUNTIME ITEM from where the previous reply stopped/i,
    );
    assert.match(
      continuationMessages[0].content,
      /CURRENT CURRICULUM UNIT:\nCategory: SQL Foundations\nTopic: SELECT Statements\nSubtopic: Selecting Columns/,
    );
    assert.match(continuationMessages[0].content, /A manually typed continue also continues this same item/);
    assert.match(continuationMessages[0].content, /Do not advance to the next runtime item unless this item is truly finished/);
    assert.match(continuationMessages[0].content, /category_id=sql-foundations/);
    assert.match(continuationMessages[0].content, /topic_id=select-statements/);
    assert.match(continuationMessages[0].content, /subtopic_id=selecting-columns/);
    assert.deepEqual(continuationMessages.slice(-3), [
      { role: "user", content: question },
      { role: "assistant", content: firstResult.reply },
      { role: "user", content: "continue" },
    ]);

    const finishResponse = await fetch(`${baseUrl}/api/learning-chat`, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify({
        categoryId: "sql-foundations",
        topicId: "select-statements",
        subtopicId: "selecting-columns",
        history: [
          { role: "user", content: question },
          { role: "assistant", content: firstResult.reply },
        ],
        question: "Finish the current lesson section.",
        lessonAction: { type: "finish-section" },
      }),
    });
    assert.equal(finishResponse.status, 200);
    const finishedResult = await finishResponse.json() as typeof continuedResult;
    assert.equal(finishedResult.lessonProgress.sectionIndex, 1);
    assert.equal(finishedResult.lessonProgress.sectionComplete, true);
    assert.match(geminiRequests[2].messages[0].content, /Continue the CURRENT RUNTIME ITEM/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnvironment.supabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousEnvironment.supabaseUrl;
    if (previousEnvironment.supabaseKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousEnvironment.supabaseKey;
    if (previousEnvironment.geminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousEnvironment.geminiKey;
    if (previousEnvironment.geminiModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = previousEnvironment.geminiModel;
  }
});

test("Topic Chat returns structured provider errors without masking them", async () => {
  const originalFetch = globalThis.fetch;
  const previousEnvironment = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    geminiKey: process.env.GEMINI_API_KEY,
  };
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "test-user" }), { status: 200 });
    }
    if (url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent") {
      return new Response(JSON.stringify({ error: { message: "Provider unavailable." } }), {
        status: 503,
      });
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  };

  try {
    const response = await fetch(`${baseUrl}/api/learning-chat`, {
      method: "POST",
      headers: {
        Authorization: ["Bearer", "test-token"].join(" "),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        categoryId: "sql-foundations",
        topicId: "select-statements",
        subtopicId: "selecting-columns",
        history: [],
        question: "Explain selecting columns.",
      }),
    });
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      code: "TOPIC_CHAT_SERVER_ERROR",
      error: "The AI tutor could not complete this request. Your runtime learning state was preserved; retry the same item.",
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnvironment.supabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousEnvironment.supabaseUrl;
    if (previousEnvironment.supabaseKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousEnvironment.supabaseKey;
    if (previousEnvironment.geminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousEnvironment.geminiKey;
  }
});

test("Topic Chat provider failure preserves the prior state and a retry targets the same runtime item", async () => {
  const originalFetch = globalThis.fetch;
  const previousEnvironment = {
    nodeEnv: process.env.NODE_ENV,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    geminiKey: process.env.GEMINI_API_KEY,
  };
  const providerRequests: { messages: { role: string; content: string }[] }[] = [];
  let failNextTeachingRequest = false;
  process.env.NODE_ENV = "development";
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "test-user" }), { status: 200 });
    }
    if (url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent") {
      const body = parseGeminiMockRequest(url, init?.body) as {
        messages: { role: string; content: string }[];
      };
      providerRequests.push(body);
      if (failNextTeachingRequest) {
        failNextTeachingRequest = false;
        return new Response(JSON.stringify({
          error: {
            type: "server_error",
            code: "upstream_error",
            message: "Provider unavailable.",
          },
        }), { status: 503 });
      }
      const systemPrompt = body.messages[0]?.content ?? "";
      const content = systemPrompt.includes("Generate navigation metadata only")
        ? JSON.stringify({
            sequence: [
              { title: "What SQL Stands For" },
              { title: "Declarative vs Procedural" },
              { title: "DDL" },
              { title: "DML" },
              { title: "Basic Retrieval" },
            ],
          })
        : JSON.stringify({
            reply: "Focused teaching for the current runtime item.",
            itemComplete: true,
          });
      return new Response(geminiMockCompletion(content, "stop", 60), { status: 200 });
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  };

  try {
    const canonicalPath = {
      categoryId: "sql-database-fundamentals",
      topicId: "what-is-sql",
      subtopicId: "introduction-to-sql",
    };
    const postChat = (question: string, runtimeState?: unknown) =>
      fetch(`${baseUrl}/api/learning-chat`, {
        method: "POST",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...canonicalPath, question, history: [], runtimeState }),
      });
    const planResponse = await postChat("Give me a logical learning sequence for Introduction to SQL.");
    assert.equal(planResponse.status, 200);
    const plan = await planResponse.json() as { runtimeState: Record<string, unknown> };

    const firstResponse = await postChat("start with 1", plan.runtimeState);
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json() as {
      runtimeState: {
        categoryId: string;
        topicId: string;
        subtopicId: string;
        sequence: { id: string; title: string }[];
        currentPath: number[];
        completion: string;
        sequenceFinished?: boolean;
      };
    };
    assert.deepEqual(first.runtimeState.currentPath, [0]);
    assert.equal(first.runtimeState.completion, "complete");

    const secondResponse = await postChat("continue", first.runtimeState);
    assert.equal(secondResponse.status, 200);
    const second = await secondResponse.json() as { runtimeState: typeof first.runtimeState };
    assert.deepEqual(second.runtimeState.currentPath, [1]);
    assert.equal(second.runtimeState.completion, "complete");
    const lastKnownGoodState = structuredClone(second.runtimeState);

    failNextTeachingRequest = true;
    const failedResponse = await postChat("continue", lastKnownGoodState);
    assert.equal(failedResponse.status, 502);
    const failed = await failedResponse.json() as {
      code: string;
      error: string;
      runtimeState?: unknown;
      diagnostic?: Record<string, unknown>;
    };
    assert.equal(failed.code, "TOPIC_CHAT_SERVER_ERROR");
    assert.match(failed.error, /runtime learning state was preserved/i);
    assert.equal(failed.runtimeState, undefined);
    assert.deepEqual(lastKnownGoodState, second.runtimeState);
    assert.equal(lastKnownGoodState.sequenceFinished, false);
    assert.deepEqual(lastKnownGoodState.currentPath, [1]);
    assert.equal(failed.diagnostic?.providerStatus, 503);
    assert.equal(failed.diagnostic?.providerErrorCategory, "server_error");
    assert.equal(failed.diagnostic?.compactRetryAttempted, false);
    assert.equal(failed.diagnostic?.errorCode, "TOPIC_CHAT_SERVER_ERROR");
    assert.equal(failed.diagnostic?.runtimeItemId, "ddl");
    assert.deepEqual(failed.diagnostic?.runtimeItemPath, [2]);
    assert.equal(failed.diagnostic?.requestNumber !== undefined, true);
    assert.equal(typeof failed.diagnostic?.totalPromptCharacters, "number");
    assert.equal(typeof failed.diagnostic?.historyCharacters, "number");
    assert.equal(failedResponse.headers.get("X-Topic-Chat-Request-ID"), failed.diagnostic?.requestId);
    assert.doesNotMatch(failed.error, /NEXT SUBTOPIC/i);

    const retryResponse = await postChat("continue", lastKnownGoodState);
    assert.equal(retryResponse.status, 200);
    const retry = await retryResponse.json() as {
      reply: string;
      runtimeState: typeof first.runtimeState;
    };
    assert.deepEqual(retry.runtimeState.currentPath, [2]);
    assert.equal(retry.runtimeState.sequence[2]?.title, "DDL");
    assert.equal(retry.runtimeState.sequenceFinished, false);
    assert.deepEqual(
      [
        retry.runtimeState.categoryId,
        retry.runtimeState.topicId,
        retry.runtimeState.subtopicId,
      ],
      [canonicalPath.categoryId, canonicalPath.topicId, canonicalPath.subtopicId],
    );
    assert.doesNotMatch(retry.reply, /NEXT SUBTOPIC/i);
    assert.match(providerRequests.at(-1)?.messages[0]?.content ?? "", /Current runtime teaching item: DDL/);
    assert.deepEqual(providerRequests[3]?.messages[0], providerRequests[4]?.messages[0]);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnvironment.nodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else process.env.NODE_ENV = previousEnvironment.nodeEnv;
    if (previousEnvironment.supabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousEnvironment.supabaseUrl;
    if (previousEnvironment.supabaseKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousEnvironment.supabaseKey;
    if (previousEnvironment.geminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousEnvironment.geminiKey;
  }
});

test("Topic Chat persists a dynamic sequence and teaches only the explicitly selected runtime item", async () => {
  const originalFetch = globalThis.fetch;
  const previousEnvironment = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    geminiKey: process.env.GEMINI_API_KEY,
  };
  const providerRequests: { messages: { role: string; content: string }[] }[] = [];
  let truncateNextRuntimeReply = false;
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "test-user" }), { status: 200 });
    }
    if (url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent") {
      const body = parseGeminiMockRequest(url, init?.body) as {
        messages: { role: string; content: string }[];
      };
      providerRequests.push(body);
      const systemPrompt = body.messages[0]?.content ?? "";
      const content = systemPrompt.includes("Generate navigation metadata only")
        ? JSON.stringify({
            sequence: [
              {
                title: "What SQL Is & Why It Matters",
                items: [
                  { title: "What SQL Stands For" },
                  { title: "Declarative vs. Procedural" },
                ],
              },
              { title: "Relational-Database Basics" },
              { title: "Data Types & Constraints" },
            ],
          })
        : JSON.stringify({
            reply: "SQL stands for Structured Query Language: a structured way to ask a database questions.",
            itemComplete: body.messages.at(-1)?.content !== "hi",
          });
      const finishReason = truncateNextRuntimeReply ? "length" : "stop";
      truncateNextRuntimeReply = false;
      return new Response(geminiMockCompletion(content, finishReason, 55), { status: 200 });
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  };

  try {
    const headers = {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    };
    const path = {
      categoryId: "sql-database-fundamentals",
      topicId: "what-is-sql",
      subtopicId: "introduction-to-sql",
    };
    const postChat = (payload: Record<string, unknown>) =>
      fetch(`${baseUrl}/api/learning-chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...path, ...payload }),
      });

    const planResponse = await postChat({
      history: [],
      question: "Give me a logical learning sequence for Introduction to SQL.",
    });
    assert.equal(planResponse.status, 200);
    const plan = await planResponse.json() as {
      reply: string;
      intent: string;
      runtimeState: {
        categoryId: string;
        topicId: string;
        subtopicId: string;
        sequence: { id: string; title: string; items?: { id: string; title: string }[] }[];
        currentPath: number[] | null;
        completion: string;
        responseIncomplete: boolean;
        latestIntent: string;
      };
    };
    assert.equal(plan.intent, "sequence-generation");
    assert.equal(plan.runtimeState.currentPath, null);
    assert.equal(plan.runtimeState.completion, "not-started");
    assert.equal(plan.runtimeState.sequence[0].items?.[0].title, "What SQL Stands For");
    assert.match(plan.reply, /Relational-Database Basics/);
    assert.equal(plan.reply.includes("Learning Block 1"), false);
    const storedRuntimeState = plan.runtimeState;

    const groupResponse = await postChat({
      history: [],
      question: "ok lets move on to 1st part",
      runtimeState: storedRuntimeState,
    });
    assert.equal(groupResponse.status, 200);
    const group = await groupResponse.json() as {
      runtimeState: typeof storedRuntimeState & { currentPath: number[]; completion: string };
    };
    assert.deepEqual(group.runtimeState.currentPath, [0]);
    assert.equal(group.runtimeState.completion, "not-started");

    const nestedResponse = await postChat({
      history: [],
      question: "i mean only this - 1️⃣ What SQL Stands For",
      runtimeState: group.runtimeState,
    });
    assert.equal(nestedResponse.status, 200);
    const nested = await nestedResponse.json() as {
      reply: string;
      intent: string;
      runtimeState: typeof storedRuntimeState & {
        currentPath: number[];
        completion: string;
        responseIncomplete: boolean;
      };
    };
    assert.equal(nested.intent, "explicit-runtime-item-selection");
    assert.deepEqual(nested.runtimeState.currentPath, [0, 0]);
    assert.equal(nested.runtimeState.completion, "complete");
    assert.equal(nested.runtimeState.responseIncomplete, false);
    assert.equal(
      getRuntimeSequenceItem(nested.runtimeState.sequence, nested.runtimeState.currentPath)?.id,
      "what-sql-stands-for",
    );
    assert.deepEqual(
      getNextRuntimeItemPath(nested.runtimeState.sequence, nested.runtimeState.currentPath),
      [0, 1],
    );
    const nestedPrompt = providerRequests.at(-1)?.messages[0].content ?? "";
    assert.match(nestedPrompt, /Current runtime item ID: what-sql-stands-for/);
    assert.match(nestedPrompt, /Current runtime item path: \[0,0\]/);
    assert.match(nestedPrompt, /Current runtime teaching item: What SQL Stands For/);
    assert.match(nestedPrompt, /Do not teach sibling items/);
    assert.match(nestedPrompt, /Canonical curriculum IDs: category_id=sql-database-fundamentals, topic_id=what-is-sql, subtopic_id=introduction-to-sql/);
    assert.doesNotMatch(nestedPrompt, /Current runtime teaching item: Declarative vs\. Procedural/);
    assert.doesNotMatch(nestedPrompt, /Current runtime teaching item: Introduction to SQL/);

    const nextResponse = await postChat({
      history: [],
      question: "Continue.",
      lessonAction: { type: "continue-runtime-item" },
      runtimeState: nested.runtimeState,
    });
    assert.equal(nextResponse.status, 200);
    const next = await nextResponse.json() as {
      runtimeState: typeof nested.runtimeState;
    };
    assert.deepEqual(next.runtimeState.currentPath, [0, 1]);
    assert.equal(next.runtimeState.completion, "complete");
    assert.match(providerRequests.at(-1)?.messages[0].content ?? "", /Current runtime teaching item: Declarative vs\. Procedural/);
    assert.equal(next.runtimeState.categoryId, path.categoryId);
    assert.equal(next.runtimeState.topicId, path.topicId);
    assert.equal(next.runtimeState.subtopicId, path.subtopicId);

    const greetingResponse = await postChat({
      history: [],
      question: "hi",
      runtimeState: next.runtimeState,
    });
    assert.equal(greetingResponse.status, 200);
    const greeting = await greetingResponse.json() as {
      intent: string;
      runtimeState: typeof next.runtimeState;
    };
    assert.equal(greeting.intent, "ordinary-topic-question");
    assert.deepEqual(greeting.runtimeState.currentPath, [0, 1]);
    assert.equal(greeting.runtimeState.sequence.length, 3);
    assert.equal(greeting.runtimeState.completion, "complete");
    assert.equal(greeting.runtimeState.latestIntent, "ordinary-topic-question");

    const incompleteState = {
      ...next.runtimeState,
      currentPath: [1],
      completion: "incomplete",
      responseIncomplete: true,
    };
    truncateNextRuntimeReply = true;
    const interruptedResponse = await postChat({
      history: [],
      question: "Continue.",
      lessonAction: { type: "continue-runtime-item" },
      runtimeState: incompleteState,
    });
    assert.equal(interruptedResponse.status, 200);
    const interrupted = await interruptedResponse.json() as {
      runtimeState: typeof incompleteState;
      incomplete: boolean;
    };
    assert.deepEqual(interrupted.runtimeState.currentPath, [1]);
    assert.equal(interrupted.incomplete, true);
    assert.equal(interrupted.runtimeState.completion, "incomplete");
    assert.equal(interrupted.runtimeState.responseIncomplete, true);
    const finishSameItemResponse = await postChat({
      history: [],
      question: "Continue.",
      lessonAction: { type: "continue-runtime-item" },
      runtimeState: interrupted.runtimeState,
    });
    assert.equal(finishSameItemResponse.status, 200);
    const finishedSameItem = await finishSameItemResponse.json() as {
      runtimeState: typeof incompleteState;
    };
    assert.deepEqual(finishedSameItem.runtimeState.currentPath, [1]);
    assert.equal(finishedSameItem.runtimeState.completion, "complete");
    assert.match(providerRequests.at(-1)?.messages[0].content ?? "", /Current runtime teaching item: Relational-Database Basics/);

    const invalidRuntimeState = await postChat({
      history: [],
      question: "hi",
      runtimeState: { ...storedRuntimeState, categoryId: "wrong-category" },
    });
    assert.equal(invalidRuntimeState.status, 400);
    assert.deepEqual(await invalidRuntimeState.json(), {
      code: "INVALID_RUNTIME_STATE",
      error: "Runtime learning state is malformed or belongs to a different canonical curriculum path.",
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnvironment.supabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousEnvironment.supabaseUrl;
    if (previousEnvironment.supabaseKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousEnvironment.supabaseKey;
    if (previousEnvironment.geminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousEnvironment.geminiKey;
  }
});

test("Topic Chat continues a long multi-turn runtime session and retries context limits once with compact context", async () => {
  const originalFetch = globalThis.fetch;
  const previousEnvironment = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    geminiKey: process.env.GEMINI_API_KEY,
  };
  const providerRequests: { messages: { role: string; content: string }[] }[] = [];
  const itemReplyCounts = new Map<string, number>();
  let rejectNextWithContextLimit = false;
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "test-user" }), { status: 200 });
    }
    if (url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent") {
      const body = parseGeminiMockRequest(url, init?.body) as {
        messages: { role: string; content: string }[];
      };
      providerRequests.push(body);
      if (rejectNextWithContextLimit) {
        rejectNextWithContextLimit = false;
        return new Response(JSON.stringify({
          error: {
            type: "invalid_request_error",
            code: "context_length_exceeded",
            message: "maximum context length exceeded",
          },
        }), { status: 400 });
      }
      const systemPrompt = body.messages[0]?.content ?? "";
      const content = systemPrompt.includes("Generate navigation metadata only")
        ? JSON.stringify({
            sequence: [
              {
                title: "What SQL Is & Why It Matters",
                items: [
                  { title: "What SQL Stands For" },
                  { title: "Declarative vs Procedural" },
                ],
              },
              { title: "Core Relational Concepts" },
              { title: "Data Types & Constraints" },
              { title: "Creating Database Objects" },
              { title: "Inserting Data" },
            ],
          })
        : (() => {
            const itemId = /Current runtime item ID: ([^\r\n]+)/.exec(systemPrompt)?.[1] ?? "unknown";
            const itemCount = (itemReplyCounts.get(itemId) ?? 0) + 1;
            itemReplyCounts.set(itemId, itemCount);
            const itemComplete = itemId !== "declarative-vs-procedural" || itemCount > 1;
            return JSON.stringify({
              reply: `Focused teaching response. ${"Useful SQL explanation and examples. ".repeat(120)}`,
              itemComplete,
            });
          })();
      return new Response(geminiMockCompletion(content, "stop", 300), { status: 200 });
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  };

  try {
    const canonicalPath = {
      categoryId: "sql-database-fundamentals",
      topicId: "what-is-sql",
      subtopicId: "introduction-to-sql",
    };
    const postChat = (question: string, runtimeState?: unknown, history: unknown[] = []) =>
      fetch(`${baseUrl}/api/learning-chat`, {
        method: "POST",
        headers: {
          Authorization: ["Bearer", "test-token"].join(" "),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...canonicalPath, question, history, runtimeState }),
      });
    const largeHistory = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? "assistant" : "user",
      content: `${index % 2 === 0 ? "Long SQL explanation and table. " : "Continue from this example. "}`.repeat(350),
    }));
    assert.ok(largeHistory.reduce((sum, message) => sum + message.content.length, 0) > 200_000);

    const planResponse = await postChat("Give me a logical learning sequence for Introduction to SQL.");
    assert.equal(planResponse.status, 200);
    const plan = await planResponse.json() as { runtimeState: Record<string, unknown> };
    const originalSequence = plan.runtimeState.sequence;

    const firstItemResponse = await postChat(
      "i mean only this - 1️⃣ What SQL Stands For",
      plan.runtimeState,
    );
    assert.equal(firstItemResponse.status, 200);
    const firstItem = await firstItemResponse.json() as { runtimeState: Record<string, unknown> };
    assert.deepEqual(firstItem.runtimeState.currentPath, [0, 0]);

    const secondItemResponse = await postChat("continue", firstItem.runtimeState);
    assert.equal(secondItemResponse.status, 200);
    const secondItem = await secondItemResponse.json() as {
      runtimeState: Record<string, unknown> & { currentPath: number[]; completion: string };
    };
    assert.deepEqual(secondItem.runtimeState.currentPath, [0, 1]);
    assert.equal(secondItem.runtimeState.completion, "not-started");
    assert.match(providerRequests[2]?.messages[0]?.content ?? "", /Teach the newly selected current runtime item from the beginning/);

    const continuedSecondResponse = await postChat("continue", secondItem.runtimeState);
    assert.equal(continuedSecondResponse.status, 200);
    const continuedSecond = await continuedSecondResponse.json() as {
      runtimeState: Record<string, unknown> & { currentPath: number[]; completion: string };
    };
    assert.deepEqual(continuedSecond.runtimeState.currentPath, [0, 1]);
    assert.equal(continuedSecond.runtimeState.completion, "complete");
    assert.match(providerRequests[3]?.messages[0]?.content ?? "", /Continue the current runtime item from the recent relevant context/);

    const coreConceptsResponse = await postChat("continue", continuedSecond.runtimeState);
    assert.equal(coreConceptsResponse.status, 200);
    const coreConcepts = await coreConceptsResponse.json() as {
      runtimeState: Record<string, unknown> & { currentPath: number[]; completion: string };
    };
    assert.deepEqual(coreConcepts.runtimeState.currentPath, [1]);
    assert.equal(
      getRuntimeSequenceItem(
        coreConcepts.runtimeState.sequence as { id: string; title: string; items?: never[] }[],
        coreConcepts.runtimeState.currentPath,
      )?.title,
      "Core Relational Concepts",
    );
    assert.equal(coreConcepts.runtimeState.completion, "complete");
    assert.match(providerRequests[4]?.messages[0]?.content ?? "", /Teach the newly selected current runtime item from the beginning/);

    rejectNextWithContextLimit = true;
    const nextItemResponse = await postChat("continue", coreConcepts.runtimeState, largeHistory);
    assert.equal(nextItemResponse.status, 200);
    const nextItem = await nextItemResponse.json() as {
      runtimeState: Record<string, unknown> & { currentPath: number[]; completion: string };
      intent: string;
    };
    assert.equal(nextItem.intent, "continue-runtime-item");
    assert.deepEqual(nextItem.runtimeState.currentPath, [2]);
    assert.equal(nextItem.runtimeState.completion, "complete");
    assert.deepEqual(nextItem.runtimeState.sequence, originalSequence);
    assert.deepEqual(
      [
        nextItem.runtimeState.categoryId,
        nextItem.runtimeState.topicId,
        nextItem.runtimeState.subtopicId,
      ],
      [canonicalPath.categoryId, canonicalPath.topicId, canonicalPath.subtopicId],
    );

    const retryRequests = providerRequests.slice(-2);
    assert.equal(retryRequests.length, 2);
    assert.match(retryRequests[0]?.messages[0]?.content ?? "", /Current runtime item ID: data-types-constraints/);
    assert.match(retryRequests[0]?.messages[0]?.content ?? "", /Current runtime item path: \[2\]/);
    const firstAttemptHistory = retryRequests[0]?.messages.slice(1, -1) ?? [];
    assert.ok(firstAttemptHistory.reduce((sum, message) => sum + message.content.length, 0) <= 6_000);
    assert.deepEqual(retryRequests[1]?.messages.slice(1, -1), []);
    assert.match(retryRequests[1]?.messages[0]?.content ?? "", /Current runtime item ID: data-types-constraints/);
    assert.match(retryRequests[1]?.messages[0]?.content ?? "", /Current runtime item path: \[2\]/);
    assert.ok((retryRequests[1]?.messages[0]?.content.length ?? 0) <
      (retryRequests[0]?.messages[0]?.content.length ?? 0));
    assert.equal(providerRequests.length, 7);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnvironment.supabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousEnvironment.supabaseUrl;
    if (previousEnvironment.supabaseKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousEnvironment.supabaseKey;
    if (previousEnvironment.geminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousEnvironment.geminiKey;
  }
});

test("typed Continue stays in the same nested runtime sequence across long multi-turn progress", async () => {
  const originalFetch = globalThis.fetch;
  const previousEnvironment = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    geminiKey: process.env.GEMINI_API_KEY,
  };
  const providerRequests: { messages: { role: string; content: string }[] }[] = [];
  const itemReplyCounts = new Map<string, number>();
  const runtimeSequence = [
    { title: "What SQL Stands For" },
    { title: "Declarative vs Procedural" },
    { title: "DDL" },
    { title: "DML" },
    {
      title: "Basic Retrieval",
      items: [
        { title: "SELECT" },
        { title: "WHERE" },
        { title: "ORDER BY" },
        { title: "GROUP BY" },
        { title: "JOIN" },
      ],
    },
  ];
  const requireAnExtraTurn = new Set(["dml", "where", "join"]);
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "test-user" }), { status: 200 });
    }
    if (url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent") {
      const body = parseGeminiMockRequest(url, init?.body) as {
        messages: { role: string; content: string }[];
      };
      providerRequests.push(body);
      const systemPrompt = body.messages[0]?.content ?? "";
      const content = systemPrompt.includes("Generate navigation metadata only")
        ? JSON.stringify({ sequence: runtimeSequence })
        : (() => {
            const itemId = /Current runtime item ID: ([^\r\n]+)/.exec(systemPrompt)?.[1] ?? "unknown";
            const replyCount = (itemReplyCounts.get(itemId) ?? 0) + 1;
            itemReplyCounts.set(itemId, replyCount);
            return JSON.stringify({
              reply: "Focused teaching for this runtime item with a concise SQL example.",
              itemComplete: !requireAnExtraTurn.has(itemId) || replyCount > 1,
            });
          })();
      return new Response(geminiMockCompletion(content, "stop", 80), { status: 200 });
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  };

  try {
    const canonicalPath = {
      categoryId: "sql-database-fundamentals",
      topicId: "what-is-sql",
      subtopicId: "introduction-to-sql",
    };
    const headers = {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    };
    const postChat = (question: string, state?: unknown, history: unknown[] = []) =>
      fetch(`${baseUrl}/api/learning-chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...canonicalPath, question, runtimeState: state, history }),
      });
    const largeHistory = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 === 0 ? "assistant" : "user",
      content: `${index % 2 === 0 ? "SQL example and explanation. " : "Please continue. "}`
        .repeat(700)
        .slice(0, index % 2 === 0 ? 11_500 : 9_500),
    }));
    assert.ok(largeHistory.reduce((total, message) => total + message.content.length, 0) > 200_000);

    const planResponse = await postChat(
      "Give me a logical learning sequence for Introduction to SQL.",
    );
    assert.equal(planResponse.status, 200);
    const plan = await planResponse.json() as {
      intent: string;
      runtimeState: {
        categoryId: string;
        topicId: string;
        subtopicId: string;
        sequence: { id: string; title: string; items?: { id: string; title: string }[] }[];
        currentPath: number[] | null;
        completion: string;
        sequenceFinished?: boolean;
      };
    };
    assert.equal(plan.intent, "sequence-generation");
    assert.equal(plan.runtimeState.currentPath, null);
    assert.equal(plan.runtimeState.completion, "not-started");
    assert.equal(plan.runtimeState.sequenceFinished, false);
    const storedSequence = plan.runtimeState.sequence;
    const expectedPaths = [
      [0], [1], [2], [3], [4, 0], [4, 1], [4, 2], [4, 3], [4, 4],
    ];
    const expectedTitles = [
      "What SQL Stands For",
      "Declarative vs Procedural",
      "DDL",
      "DML",
      "SELECT",
      "WHERE",
      "ORDER BY",
      "GROUP BY",
      "JOIN",
    ];

    let teachingResponse = await postChat(
      "1 What SQL Stands For",
      plan.runtimeState,
      largeHistory,
    );
    assert.equal(teachingResponse.status, 200);
    let teaching = await teachingResponse.json() as {
      reply: string;
      intent: string;
      runtimeState: typeof plan.runtimeState & {
        currentPath: number[];
        completion: string;
        responseIncomplete: boolean;
        sequenceFinished?: boolean;
      };
    };
    let continuationTurnCount = 0;
    for (let index = 0; index < expectedPaths.length; index += 1) {
      if (index > 0) {
        let settled = false;
        let attempts = 0;
        while (!settled) {
          teachingResponse = await postChat("continue", teaching.runtimeState, largeHistory);
          continuationTurnCount += 1;
          assert.equal(teachingResponse.status, 200, `continue ${index}, attempt ${attempts + 1}`);
          teaching = await teachingResponse.json() as typeof teaching;
          attempts += 1;
          assert.ok(attempts <= 3, `item ${expectedTitles[index]} should complete within three turns`);
          assert.deepEqual(
            teaching.runtimeState.currentPath,
            expectedPaths[index],
            `runtime path after continue ${index}, attempt ${attempts}`,
          );
          settled = teaching.runtimeState.completion === "complete";
          assert.deepEqual(teaching.runtimeState.sequence, storedSequence);
          assert.deepEqual(
            [
              teaching.runtimeState.categoryId,
              teaching.runtimeState.topicId,
              teaching.runtimeState.subtopicId,
            ],
            [canonicalPath.categoryId, canonicalPath.topicId, canonicalPath.subtopicId],
          );
        }
      }
      const expectedPath = expectedPaths[index]!;
      const expectedTitle = expectedTitles[index]!;
      const currentItem = getRuntimeSequenceItem(
        teaching.runtimeState.sequence,
        teaching.runtimeState.currentPath,
      );
      assert.equal(teaching.intent, index === 0
        ? "explicit-runtime-item-selection"
        : "continue-runtime-item");
      assert.deepEqual(teaching.runtimeState.currentPath, expectedPath, `path at item ${index + 1}`);
      assert.equal(currentItem?.title, expectedTitle, `item at path ${expectedPath.join(".")}`);
      assert.equal(teaching.runtimeState.completion, "complete");
      assert.equal(teaching.runtimeState.responseIncomplete, false);
      assert.equal(teaching.runtimeState.sequenceFinished, false);
      assert.deepEqual(teaching.runtimeState.sequence, storedSequence);
      assert.deepEqual(
        [
          teaching.runtimeState.categoryId,
          teaching.runtimeState.topicId,
          teaching.runtimeState.subtopicId,
        ],
        [canonicalPath.categoryId, canonicalPath.topicId, canonicalPath.subtopicId],
      );
      assert.doesNotMatch(teaching.reply, /NEXT SUBTOPIC/i);
      assert.match(
        providerRequests.at(-1)?.messages[0]?.content ?? "",
        new RegExp(`Current runtime teaching item: ${expectedTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      );
      const requestHistory = providerRequests.at(-1)?.messages.slice(1, -1) ?? [];
      assert.ok(requestHistory.reduce((total, message) => total + message.content.length, 0) <= 6_000);
    }
    assert.ok(continuationTurnCount >= 10, `expected at least 10 turns, got ${continuationTurnCount}`);

    const providerCallsBeforeFinish = providerRequests.length;
    const finishResponse = await postChat("continue", teaching.runtimeState, largeHistory);
    assert.equal(finishResponse.status, 200);
    const finished = await finishResponse.json() as {
      reply: string;
      runtimeState: typeof teaching.runtimeState;
    };
    assert.match(finished.reply, /Finished this part/);
    assert.deepEqual(finished.runtimeState.sequence, storedSequence);
    assert.deepEqual(finished.runtimeState.currentPath, [4, 4]);
    assert.equal(finished.runtimeState.sequenceFinished, true);
    assert.deepEqual(
      [
        finished.runtimeState.categoryId,
        finished.runtimeState.topicId,
        finished.runtimeState.subtopicId,
      ],
      [canonicalPath.categoryId, canonicalPath.topicId, canonicalPath.subtopicId],
    );
    assert.equal(providerRequests.length, providerCallsBeforeFinish);

    const repeatedFinishResponse = await postChat("continue", finished.runtimeState, largeHistory);
    assert.equal(repeatedFinishResponse.status, 200);
    const repeatedFinish = await repeatedFinishResponse.json() as typeof finished;
    assert.equal(repeatedFinish.runtimeState.sequenceFinished, true);
    assert.equal(providerRequests.length, providerCallsBeforeFinish);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnvironment.supabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousEnvironment.supabaseUrl;
    if (previousEnvironment.supabaseKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousEnvironment.supabaseKey;
    if (previousEnvironment.geminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousEnvironment.geminiKey;
  }
});

test("Topic Chat does not retry authentication, rate-limit, or non-context request failures", async () => {
  const originalFetch = globalThis.fetch;
  const previousEnvironment = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    geminiKey: process.env.GEMINI_API_KEY,
  };
  const providerStatuses = [
    {
      status: 401,
      body: { error: { type: "authentication_error", code: "invalid_api_key", message: "Invalid API key." } },
      code: "TOPIC_CHAT_AUTHENTICATION_ERROR",
    },
    {
      status: 404,
      body: { error: { type: "model_not_found", code: "model_not_found", message: "The selected model was not found." } },
      code: "TOPIC_CHAT_MODEL_NOT_FOUND",
    },
    {
      status: 429,
      body: { error: { type: "rate_limit_error", code: "rate_limit_exceeded", message: "Too many requests." } },
      code: "TOPIC_CHAT_RATE_LIMIT",
    },
    {
      status: 400,
      body: { error: { type: "invalid_request_error", code: "invalid_response_format", message: "Invalid response format." } },
      code: "TOPIC_CHAT_BAD_REQUEST",
    },
    {
      status: 503,
      body: { error: { type: "server_error", code: "provider_overloaded", message: "Provider overloaded." } },
      code: "TOPIC_CHAT_SERVER_ERROR",
    },
  ];
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
  let providerCalls = 0;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }
    if (url.endsWith("/auth/v1/user")) {
      return new Response(JSON.stringify({ id: "test-user" }), { status: 200 });
    }
    if (url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent") {
      const scenario = providerStatuses[providerCalls++];
      if (!scenario) {
        return new Response(JSON.stringify({ candidates: [] }), { status: 200 });
      }
      return new Response(JSON.stringify(scenario.body), { status: scenario.status });
    }
    throw new Error(`Unexpected outbound request: ${url}`);
  };

  try {
    const runtimeState = {
      categoryId: "sql-database-fundamentals",
      topicId: "what-is-sql",
      subtopicId: "introduction-to-sql",
      sequence: [
        { id: "first", title: "First item" },
        { id: "second", title: "Second item" },
        { id: "third", title: "Third item" },
      ],
      currentPath: [0],
      completion: "complete",
      responseIncomplete: false,
      latestIntent: "explicit-runtime-item-selection",
    };
    for (const scenario of providerStatuses) {
      const response = await fetch(`${baseUrl}/api/learning-chat`, {
        method: "POST",
        headers: {
          Authorization: ["Bearer", "test-token"].join(" "),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          categoryId: runtimeState.categoryId,
          topicId: runtimeState.topicId,
          subtopicId: runtimeState.subtopicId,
          question: "continue",
          runtimeState,
          history: [],
        }),
      });
      assert.equal(response.status, 502);
      const result = await response.json() as { code: string };
      assert.equal(result.code, scenario.code);
    }
    const malformedResponse = await fetch(`${baseUrl}/api/learning-chat`, {
      method: "POST",
      headers: {
        Authorization: ["Bearer", "test-token"].join(" "),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        categoryId: runtimeState.categoryId,
        topicId: runtimeState.topicId,
        subtopicId: runtimeState.subtopicId,
        question: "continue",
        runtimeState,
        history: [],
      }),
    });
    assert.equal(malformedResponse.status, 502);
    assert.equal(
      (await malformedResponse.json() as { code: string }).code,
      "TOPIC_CHAT_PROVIDER_INVALID_RESPONSE",
    );
    assert.equal(providerCalls, providerStatuses.length + 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousEnvironment.supabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousEnvironment.supabaseUrl;
    if (previousEnvironment.supabaseKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY;
    else process.env.SUPABASE_PUBLISHABLE_KEY = previousEnvironment.supabaseKey;
    if (previousEnvironment.geminiKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousEnvironment.geminiKey;
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
    geminiKey: process.env.GEMINI_API_KEY,
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
  let geminiResponseStatus = 200;
  let geminiResponseHeaders = new Headers();
  let geminiErrorBody: unknown = { error: { message: "Provider rejected the request." } };
  let geminiResponseStatusSequence: number[] | null = null;
  let geminiResponseHeadersSequence: Headers[] | null = null;
  let autoCompletion = false;
  const geminiRequests: Array<{
    max_completion_tokens: number;
    response_format?: { type?: string };
    messages: Array<{ role: string; content: string }>;
  }> = [];
  const geminiRequestBodies: string[] = [];
  const mockGeminiPayloadLimitBytes = 20_000;

  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  process.env.GEMINI_API_KEY = "test-gemini-key";
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
    if (url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent") {
      const serializedRequest = String(init?.body);
      const requestBody = parseGeminiMockRequest(url, serializedRequest) as {
        max_completion_tokens: number;
        response_format?: { type?: string };
        messages: Array<{ role: string; content: string }>;
      };
      geminiRequests.push(requestBody);
      geminiRequestBodies.push(serializedRequest);
      jsonModeRequested = requestBody.response_format?.type === "json_object";
      if (Buffer.byteLength(serializedRequest) > mockGeminiPayloadLimitBytes) {
        return new Response(JSON.stringify({ error: "Request payload too large." }), { status: 413 });
      }
      const responseStatus = geminiResponseStatusSequence?.shift() ?? geminiResponseStatus;
      const responseHeaders = geminiResponseHeadersSequence?.shift() ?? geminiResponseHeaders;
      if (responseStatus !== 200) {
        return new Response(JSON.stringify(geminiErrorBody), {
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
        geminiMockCompletion(responseText),
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
    assert.ok(Buffer.byteLength(JSON.stringify(previousResult)) > mockGeminiPayloadLimitBytes);
    const firstRetryRequestIndex = geminiRequests.length;
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
    const retryRequests = geminiRequests.slice(firstRetryRequestIndex);
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
    assert.ok(geminiRequestBodies.slice(firstRetryRequestIndex)
      .every((body) => Buffer.byteLength(body) <= mockGeminiPayloadLimitBytes));

    const largeSourceChunks = [
      `SELECT * FROM notes WHERE topic_id = 42; -- ${"{}[](),.;:=<>+-*/ ".repeat(80).trimEnd()}`,
      `${"漢字かなカナ".repeat(45)}${"🧪🚀✨".repeat(45)}`,
      `Source chunk C ${"original text ".repeat(90).trimEnd()}`,
    ];
    const firstBudgetedCall = geminiRequests.length;
    geminiResponseHeadersSequence = [
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
    const splitRequests = geminiRequests.slice(firstBudgetedCall);
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

    geminiResponseHeadersSequence = [
      new Headers({
        "x-ratelimit-remaining-tokens": "0",
        "x-ratelimit-reset-tokens": "60.001s",
      }),
    ];
    const overMaximumResetCallCount = geminiRequests.length;
    const overMaximumReset = await fetch(`${baseUrl}/api/notes/organize`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chunks: largeSourceChunks }),
    });
    assert.equal(overMaximumReset.status, 502);
    assert.equal(geminiRequests.length - overMaximumResetCallCount, 1,
      "token reset beyond 60 seconds is not waited through");
    assert.ok(organizerErrors.some((line) =>
      line.includes('"retryAfterMs":60001') && line.includes('"retryable":false'),
    ));
    geminiResponseHeadersSequence = null;

    const oversizedChunk = "!;".repeat(5_000);
    const oversizedCallCount = geminiRequests.length;
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
    assert.equal(geminiRequests.length, oversizedCallCount, "a single oversized chunk is rejected before provider calls");
    assert.ok(!JSON.stringify(oversizedChunkBody).includes(oversizedChunk));

    geminiResponseStatus = 429;
    geminiErrorBody = {
      error: {
        code: "insufficient_quota",
        type: "insufficient_quota",
        message: "Account quota exhausted for SELECT notes; api_key=gsk_sensitive_fake_key",
      },
    };
    geminiResponseHeaders = new Headers();
    const quotaCallCount = geminiRequests.length;
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
    assert.equal(geminiRequests.length - quotaCallCount, 1, "quota 429 is not retried");
    const providerSensitiveText = "Account quota exhausted for SELECT notes; api_key=gsk_sensitive_fake_key";
    assert.ok(!organizerWarnings.join("\n").includes(providerSensitiveText));
    assert.ok(!organizerErrors.join("\n").includes(providerSensitiveText));
    assert.ok(!organizerWarnings.join("\n").includes("SELECT notes"));
    assert.ok(!organizerErrors.join("\n").includes("SELECT notes"));
    assert.ok(!organizerWarnings.join("\n").includes("gsk_sensitive_fake_key"));
    assert.ok(!organizerErrors.join("\n").includes("gsk_sensitive_fake_key"));
    assert.ok(!JSON.stringify(providerFailureBody).includes("gsk_sensitive_fake_key"));
    assert.ok(!JSON.stringify(providerFailureBody).includes("SELECT notes"));

    geminiResponseStatus = 200;
    geminiResponseStatusSequence = [429, 200];
    geminiResponseHeadersSequence = [
      new Headers({ "retry-after": "0.02" }),
      new Headers(),
    ];
    geminiErrorBody = {
      error: {
        code: "rate_limit_exceeded",
        type: "rate_limit_error",
        message: "Rate limit exceeded.",
      },
    };
    const transientCallCount = geminiRequests.length;
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
    assert.equal(geminiRequests.length - transientCallCount, 2, "transient 429 is retried once");
    assert.ok(Date.now() - retryStartTime >= 15, "retry-after delay is honored");
    assert.ok(organizerWarnings.some((line) =>
      line.includes('"providerType":"rate_limit"') &&
      line.includes('"retryAfterMs":20') &&
      line.includes('"rateLimit":{"retryAfter":"0.02"'),
    ));
    assert.ok(organizerWarnings.every((line) => !line.includes("A SQL SELECT query")));

    geminiResponseStatusSequence = [429, 429, 200];
    geminiResponseHeadersSequence = [
      new Headers({ "retry-after": "0" }),
      new Headers({ "retry-after": "0" }),
      new Headers(),
    ];
    const exhaustedRetryCount = geminiRequests.length;
    const exhaustedRetry = await fetch(`${baseUrl}/api/notes/organize`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-access-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ chunks: ["A SQL SELECT query returns requested columns."] }),
    });
    assert.equal(exhaustedRetry.status, 502);
    assert.equal(geminiRequests.length - exhaustedRetryCount, 2, "a persistent transient 429 is retried only once");

    geminiResponseStatusSequence = null;
    geminiResponseHeadersSequence = null;
    geminiResponseStatus = 429;
    geminiResponseHeaders = new Headers({ "retry-after": "60.001" });
    const boundedWaitCount = geminiRequests.length;
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
    assert.equal(geminiRequests.length - boundedWaitCount, 1, "retry wait beyond the bound is not attempted");
    assert.ok(Date.now() - boundedWaitStart < 1_000, "excessive Retry-After does not block the API");

  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalConsoleWarn;
    console.error = originalConsoleError;
    restoreEnvironment("SUPABASE_URL", previousEnvironment.supabaseUrl);
    restoreEnvironment("SUPABASE_PUBLISHABLE_KEY", previousEnvironment.supabaseKey);
    restoreEnvironment("GEMINI_API_KEY", previousEnvironment.geminiKey);
  }
});

test("authenticated SQL practice routes generate, execute, and evaluate without live providers", async () => {
  const originalFetch = globalThis.fetch;
  const previousEnvironment = {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    geminiKey: process.env.GEMINI_API_KEY,
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
  process.env.GEMINI_API_KEY = "test-gemini-key";
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith(baseUrl)) {
      return originalFetch(input, init);
    }
    if (url.endsWith("/auth/v1/user")) {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-session");
      return new Response(JSON.stringify({ id: "test-user" }), { status: 200 });
    }
    if (url === "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent") {
      const body = parseGeminiMockRequest(url, init?.body) as {
        messages: Array<{ role: string; content: string }>;
      };
      providerRequests.push(body);
      const isGeneration = body.messages[0]?.content.includes("Return only a JSON object");
      return new Response(
        JSON.stringify({
          candidates: [{
            content: {
              parts: [{
                text: isGeneration
                  ? JSON.stringify({ questions: [question] })
                  : "Your WHERE filter matches the requested active customers.",
              }],
            },
            finishReason: "STOP",
          }],
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
    restoreEnvironment("GEMINI_API_KEY", previousEnvironment.geminiKey);
  }
});

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
