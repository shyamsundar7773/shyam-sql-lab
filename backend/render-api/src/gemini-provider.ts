export const defaultGeminiModel = "gemini-3.5-flash-lite";
export const geminiGenerateContentBaseUrl =
  "https://generativelanguage.googleapis.com/v1beta/models";

export type GeminiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GeminiChatRequest = {
  messages: GeminiMessage[];
  maxOutputTokens: number;
  temperature: number;
  responseMimeType?: "application/json";
};

export type GeminiCompletion = {
  reply: string;
  finishReason: string | null;
  incomplete: boolean;
  completionTokens: number | null;
};

export type GeminiFailureCategory =
  | "authentication_error"
  | "model_not_found"
  | "rate_limit"
  | "context_limit"
  | "bad_request"
  | "server_error"
  | "provider_error";

export function resolveGeminiModel(model?: string | null): string {
  return model?.trim() || defaultGeminiModel;
}

export function buildGeminiGenerateContentRequest(
  request: GeminiChatRequest,
): Record<string, unknown> {
  const systemInstructions = request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content);
  const contents = request.messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  return {
    ...(systemInstructions.length > 0
      ? { systemInstruction: { parts: [{ text: systemInstructions.join("\n\n") }] } }
      : {}),
    contents,
    generationConfig: {
      maxOutputTokens: request.maxOutputTokens,
      temperature: request.temperature,
      ...(request.responseMimeType ? { responseMimeType: request.responseMimeType } : {}),
    },
  };
}

export async function sendGeminiChatCompletion(
  apiKey: string,
  model: string,
  request: GeminiChatRequest,
  fetcher: typeof fetch = fetch,
  timeoutMs = 45_000,
): Promise<Response> {
  return fetcher(
    `${geminiGenerateContentBaseUrl}/${encodeURIComponent(resolveGeminiModel(model))}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(buildGeminiGenerateContentRequest(request)),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
}

export function parseGeminiCompletion(value: unknown): GeminiCompletion | null {
  if (!isRecord(value) || !Array.isArray(value.candidates)) {
    return null;
  }
  const candidate = value.candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) {
    return null;
  }
  const text = candidate.content.parts
    .filter(isRecord)
    .map((part) => part.text)
    .filter((part): part is string => typeof part === "string")
    .join("");
  if (!text.trim()) {
    return null;
  }
  const finishReason = typeof candidate.finishReason === "string"
    ? candidate.finishReason
    : null;
  const usageMetadata = isRecord(value.usageMetadata) ? value.usageMetadata : null;
  return {
    reply: text,
    finishReason,
    incomplete: finishReason === "MAX_TOKENS",
    completionTokens: usageMetadata &&
      typeof usageMetadata.candidatesTokenCount === "number" &&
      Number.isFinite(usageMetadata.candidatesTokenCount)
      ? usageMetadata.candidatesTokenCount
      : null,
  };
}

export function classifyGeminiProviderFailure(
  status: number,
  value: unknown,
): GeminiFailureCategory {
  const error = isRecord(value) && isRecord(value.error) ? value.error : null;
  const details = error
    ? [error.status, error.message, ...(Array.isArray(error.details) ? error.details.map((detail) =>
        isRecord(detail) ? JSON.stringify(detail) : "",
      ) : [])]
      .filter((part): part is string => typeof part === "string")
      .join(" ")
      .toLowerCase()
    : "";

  if (status === 401 || status === 403 || /api.?key|unauthenticated|permission denied/.test(details)) {
    return "authentication_error";
  }
  if (status === 404 || /model.{0,30}(not found|does not exist|unsupported)/.test(details)) {
    return "model_not_found";
  }
  if (status === 429 || /resource_exhausted|rate.?limit|quota exceeded|too many requests/.test(details)) {
    return "rate_limit";
  }
  if (/context|input token|prompt.{0,20}(too large|exceed)|token count.{0,20}(exceed|limit)/.test(details)) {
    return "context_limit";
  }
  if (status >= 500) {
    return "server_error";
  }
  if (status >= 400) {
    return "bad_request";
  }
  return "provider_error";
}

export function classifyGeminiTransportFailure(error: unknown): "timeout" | "network_error" {
  return error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    ? "timeout"
    : "network_error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
