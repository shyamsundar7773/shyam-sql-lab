import cors from "cors";
import dotenv from "dotenv";
import express, { type ErrorRequestHandler } from "express";

import {
  executePracticeSql,
  validateGeneratedQuestions,
  type GeneratedQuestion,
} from "./practice-service.js";

dotenv.config();

export const app = express();
const port = process.env.PORT || 3000;
const maximumOfficialContentLength = 20_000;
const maximumHistoryItems = 20;
const maximumHistoryMessageLength = 4_000;
const practiceDifficulties = new Set(["Beginner", "Intermediate", "Advanced"]);
const practiceQuestionTypes = new Set(["SELECT", "WHERE", "JOIN", "GROUP BY", "AGGREGATION"]);

app.use(cors());
app.use(express.json({ limit: "128kb" }));

const healthCheck = (_request: express.Request, response: express.Response) => {
  response.json({
    status: "ok",
    service: "shyam-sql-lab-api",
  });
};

app.get("/api/health", healthCheck);
app.post("/api/health", healthCheck);

app.post("/api/learning-chat", async (request, response) => {
  const input = parseChatRequest(request.body);
  if (!input) {
    response.status(400).json({ error: "The topic, lesson, history, and question are required." });
    return;
  }

  const authorization = request.header("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseApiKey =
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();

  if (!accessToken) {
    response.status(401).json({ error: "Sign in to ask a learning question." });
    return;
  }
  if (!supabaseUrl || !supabaseApiKey) {
    response.status(503).json({ error: "The learning chat service is not configured." });
    return;
  }

  let authResponse: Response;
  try {
    authResponse = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
      headers: {
        apikey: supabaseApiKey,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    response.status(503).json({ error: "Could not verify your session. Please try again." });
    return;
  }

  if (!authResponse.ok) {
    response.status(401).json({ error: "Your session is invalid or has expired. Sign in again." });
    return;
  }

  const authenticatedUser: unknown = await authResponse.json().catch(() => null);
  if (!isRecord(authenticatedUser) || typeof authenticatedUser.id !== "string") {
    response.status(401).json({ error: "Could not verify your signed-in account." });
    return;
  }

  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  if (!groqApiKey) {
    response.status(503).json({ error: "AI replies are not configured yet." });
    return;
  }

  try {
    const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
        messages: [
          {
            role: "system",
            content: [
              "You are Shyam SQL Lab's SQL learning tutor.",
              "Answer clearly and concisely, grounded in the current topic and official lesson.",
              "Use SQL examples where useful. Never claim to execute a query.",
              `Category: ${input.category}`,
              `Module: ${input.module}`,
              `Topic: ${input.topic}`,
              `Official topic content: ${input.officialContent}`,
            ].join("\n\n"),
          },
          ...input.history,
          { role: "user", content: input.question },
        ],
        max_completion_tokens: 700,
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!aiResponse.ok) {
      response.status(502).json({ error: "The AI tutor is temporarily unavailable. Please retry." });
      return;
    }

    const completion: unknown = await aiResponse.json().catch(() => null);
    const reply = getCompletionText(completion);
    if (!reply) {
      response.status(502).json({ error: "The AI tutor returned an empty reply. Please retry." });
      return;
    }

    response.json({ reply, mode: "ai" });
  } catch {
    response.status(502).json({ error: "The AI tutor could not be reached. Please retry." });
  }
});

app.post("/api/practice/generate", async (request, response) => {
  const input = parsePracticeGenerationRequest(request.body);
  if (!input) {
    response.status(400).json({ error: "Provide a valid category, module, topic, subtopic, difficulty, question type, and a count from 1 to 10." });
    return;
  }

  if (!(await verifyAccessToken(request, response))) {
    return;
  }

  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  if (!groqApiKey) {
    response.status(503).json({ error: "AI practice generation is not configured yet." });
    return;
  }

  try {
    const completion = await requestGroqCompletion(groqApiKey, [
      {
        role: "system",
        content: [
          "Create SQL practice questions for a learning application. Return only a JSON object with a questions array.",
          "Generate exactly the requested number of distinct, solvable questions. Provide synthetic table data and correct SQLite-compatible column types.",
          "Each question must have title, prompt, explanation, concepts, and tables. Each table has name, columns [{name,type}], rows [{...}].",
          "Column types must be TEXT, INTEGER, REAL, or BOOLEAN. Row keys must exactly match the table columns. Use identifiers matching [A-Za-z_][A-Za-z0-9_]{0,47}.",
          "Use 2-8 rows per table where useful. Do not include solution SQL, scripts, markdown, or any instructions to execute writes.",
          "Make each question self-contained; JOIN questions must include at least two related tables.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify(input),
      },
    ], 8_000);
    const payload = parseJsonObject(completion);
    if (!payload || !validateGeneratedQuestions(payload.questions, input.count)) {
      response.status(502).json({ error: "The practice generator returned invalid question data. Please retry." });
      return;
    }
    response.json({ questions: payload.questions });
  } catch {
    response.status(502).json({ error: "The practice generator is temporarily unavailable. Please retry." });
  }
});

app.post("/api/practice/execute", async (request, response) => {
  if (!(await verifyAccessToken(request, response))) {
    return;
  }
  if (
    !isRecord(request.body) ||
    typeof request.body.sql !== "string" ||
    request.body.sql.length > 10_000 ||
    !validateGeneratedQuestions([request.body.question], 1)
  ) {
    response.status(400).json({ error: "A valid practice question and SQL statement are required." });
    return;
  }

  try {
    const result = executePracticeSql(
      request.body.question as GeneratedQuestion,
      request.body.sql,
    );
    response.json(result);
  } catch (error) {
    response.json({
      ok: false,
      columns: [],
      rows: [],
      error: getErrorMessage(error, "The SQL statement could not be executed."),
    });
  }
});

app.post("/api/practice/evaluate", async (request, response) => {
  if (!(await verifyAccessToken(request, response))) {
    return;
  }
  const input = parsePracticeEvaluationRequest(request.body);
  if (!input) {
    response.status(400).json({ error: "A practice question, submitted SQL, result, message, and valid conversation history are required." });
    return;
  }

  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  if (!groqApiKey) {
    response.status(503).json({ error: "AI practice evaluation is not configured yet." });
    return;
  }

  try {
    const reply = await requestGroqCompletion(groqApiKey, [
      {
        role: "system",
        content: [
          "You are Shyam SQL Lab's supportive SQL practice tutor. This is practice, never an exam or pass/fail verdict.",
          "Evaluate the user's approach against the exact question. Explain what is correct, what needs improvement, and why.",
          "Use the SQL output only as execution evidence; do not claim to execute queries yourself.",
          "Answer follow-up doubts, show alternate SQL approaches, and give examples when asked.",
          `Exact practice question: ${input.question.prompt}`,
          `Question context: ${input.question.explanation}`,
          `Concepts: ${input.question.concepts.join(", ")}`,
          `Tables: ${JSON.stringify(input.question.tables.map((table) => ({
            name: table.name,
            columns: table.columns,
            rows: table.rows,
          })))}`,
          `User's submitted SQL: ${input.sql || "(empty)"}`,
          `Actual SQL engine result: ${JSON.stringify(input.result)}`,
        ].join("\n\n"),
      },
      ...input.history,
      { role: "user", content: input.message },
    ], 1_500);
    response.json({ reply, mode: "ai" });
  } catch {
    response.status(502).json({ error: "The AI evaluator is temporarily unavailable. Please retry." });
  }
});

app.use(((error, _request, response, _next) => {
  const statusCode =
    isRecord(error) && typeof error.status === "number" && [400, 413].includes(error.status)
      ? error.status
      : 500;
  const message =
    statusCode === 413
      ? "The request body is too large."
      : statusCode === 400
        ? "The request body is invalid."
        : "The server could not process the request.";
  response.status(statusCode).json({ error: message });
}) satisfies ErrorRequestHandler);

type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

type ChatRequest = {
  category: string;
  module: string;
  topic: string;
  officialContent: string;
  history: ChatHistoryItem[];
  question: string;
};

type PracticeGenerationRequest = {
  category: string;
  module: string;
  topic: string;
  subtopic: string;
  difficulty: string;
  questionType: string;
  count: number;
  learningContext: string;
};

type PracticeEvaluationRequest = {
  question: GeneratedQuestion;
  sql: string;
  result: unknown;
  history: ChatHistoryItem[];
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePracticeGenerationRequest(value: unknown): PracticeGenerationRequest | null {
  if (!isRecord(value)) {
    return null;
  }
  const { category, module, topic, subtopic, difficulty, questionType, count, learningContext } = value;
  if (
    !isNonEmptyString(category, 160) ||
    !isNonEmptyString(module, 160) ||
    !isNonEmptyString(topic, 160) ||
    !isNonEmptyString(subtopic, 160) ||
    typeof difficulty !== "string" ||
    !practiceDifficulties.has(difficulty) ||
    typeof questionType !== "string" ||
    !practiceQuestionTypes.has(questionType) ||
    typeof count !== "number" ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 10 ||
    typeof learningContext !== "string" ||
    learningContext.length > maximumOfficialContentLength
  ) {
    return null;
  }
  return {
    category: category.trim(),
    module: module.trim(),
    topic: topic.trim(),
    subtopic: subtopic.trim(),
    difficulty,
    questionType,
    count,
    learningContext: learningContext.trim(),
  };
}

function parsePracticeEvaluationRequest(value: unknown): PracticeEvaluationRequest | null {
  if (!isRecord(value) || !validateGeneratedQuestions([value.question], 1)) {
    return null;
  }
  if (
    typeof value.sql !== "string" ||
    value.sql.length > 10_000 ||
    !isNonEmptyString(value.message, maximumHistoryMessageLength) ||
    !Array.isArray(value.history) ||
    value.history.length > maximumHistoryItems ||
    value.history.some(
      (item) =>
        !isRecord(item) ||
        (item.role !== "user" && item.role !== "assistant") ||
        !isNonEmptyString(item.content, maximumHistoryMessageLength),
    )
  ) {
    return null;
  }
  return {
    question: value.question as GeneratedQuestion,
    sql: value.sql,
    result: value.result,
    history: value.history.map((item) => ({
      role: item.role as ChatHistoryItem["role"],
      content: (item as Record<string, string>).content.trim(),
    })),
    message: value.message.trim(),
  };
}

async function verifyAccessToken(
  request: express.Request,
  response: express.Response,
): Promise<boolean> {
  const accessToken = request.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseApiKey =
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim();

  if (!accessToken) {
    response.status(401).json({ error: "Sign in to use SQL practice." });
    return false;
  }
  if (!supabaseUrl || !supabaseApiKey) {
    response.status(503).json({ error: "The SQL practice service is not configured." });
    return false;
  }

  try {
    const authResponse = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
      headers: {
        apikey: supabaseApiKey,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!authResponse.ok) {
      response.status(401).json({ error: "Your session is invalid or has expired. Sign in again." });
      return false;
    }
    return true;
  } catch {
    response.status(503).json({ error: "Could not verify your session. Please try again." });
    return false;
  }
}

async function requestGroqCompletion(
  apiKey: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  maxCompletionTokens: number,
) {
  const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
      messages,
      max_completion_tokens: maxCompletionTokens,
      temperature: 0.4,
      ...(messages[0]?.content.includes("Return only a JSON object")
        ? { response_format: { type: "json_object" } }
        : {}),
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!aiResponse.ok) {
    throw new Error("The AI provider rejected the request.");
  }
  const completion: unknown = await aiResponse.json().catch(() => null);
  const text = getCompletionText(completion);
  if (!text) {
    throw new Error("The AI provider returned an empty reply.");
  }
  return text;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function parseChatRequest(value: unknown): ChatRequest | null {
  if (!isRecord(value)) {
    return null;
  }

  const { category, module, topic, officialContent, history, question } = value;
  if (
    !isNonEmptyString(category, 160) ||
    !isNonEmptyString(module, 160) ||
    !isNonEmptyString(topic, 160) ||
    !isNonEmptyString(officialContent, maximumOfficialContentLength) ||
    !isNonEmptyString(question, maximumHistoryMessageLength) ||
    !Array.isArray(history) ||
    history.length > maximumHistoryItems
  ) {
    return null;
  }

  const validatedHistory: ChatHistoryItem[] = [];
  for (const item of history) {
    if (
      !isRecord(item) ||
      (item.role !== "user" && item.role !== "assistant") ||
      !isNonEmptyString(item.content, maximumHistoryMessageLength)
    ) {
      return null;
    }
    validatedHistory.push({ role: item.role, content: item.content.trim() });
  }

  return {
    category: category.trim(),
    module: module.trim(),
    topic: topic.trim(),
    officialContent: officialContent.trim(),
    history: validatedHistory,
    question: question.trim(),
  };
}

function isNonEmptyString(value: unknown, maximumLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximumLength
  );
}

function getCompletionText(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    return null;
  }
  const firstChoice: unknown = value.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return null;
  }
  const content = firstChoice.message.content;
  return typeof content === "string" && content.trim() ? content.trim() : null;
}

if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`Shyam SQL Lab API listening on port ${port}`);
  });
}
