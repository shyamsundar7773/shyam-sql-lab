import cors from "cors";
import dotenv from "dotenv";
import express, { type ErrorRequestHandler } from "express";

dotenv.config();

export const app = express();
const port = process.env.PORT || 3000;
const maximumOfficialContentLength = 20_000;
const maximumHistoryItems = 20;
const maximumHistoryMessageLength = 4_000;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
