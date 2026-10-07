import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildGeminiGenerateContentRequest,
  classifyGeminiProviderFailure,
  classifyGeminiTransportFailure,
  defaultGeminiModel,
  geminiGenerateContentBaseUrl,
  parseGeminiCompletion,
  resolveGeminiModel,
  sendGeminiChatCompletion,
  type GeminiChatRequest,
} from "./gemini-provider.js";

const request: GeminiChatRequest = {
  messages: [
    { role: "system", content: "Be a concise SQL tutor." },
    { role: "user", content: "What is SQL?" },
    { role: "assistant", content: "SQL is a language for relational data." },
    { role: "user", content: "Give an example." },
  ],
  maxOutputTokens: 512,
  temperature: 0.4,
  responseMimeType: "application/json",
};

test("Gemini builds the backend REST request with system instruction and chat history", () => {
  assert.equal(defaultGeminiModel, "gemini-3.5-flash-lite");
  assert.equal(resolveGeminiModel(""), defaultGeminiModel);
  assert.equal(resolveGeminiModel("gemini-test"), "gemini-test");
  assert.deepEqual(buildGeminiGenerateContentRequest(request), {
    systemInstruction: { parts: [{ text: "Be a concise SQL tutor." }] },
    contents: [
      { role: "user", parts: [{ text: "What is SQL?" }] },
      { role: "model", parts: [{ text: "SQL is a language for relational data." }] },
      { role: "user", parts: [{ text: "Give an example." }] },
    ],
    generationConfig: {
      maxOutputTokens: 512,
      temperature: 0.4,
      responseMimeType: "application/json",
    },
  });
});

test("Gemini sends a successful request using backend-only API-key authentication", async () => {
  let url = "";
  let init: RequestInit | undefined;
  const response = await sendGeminiChatCompletion(
    "fake-test-key",
    defaultGeminiModel,
    request,
    async (input, options) => {
      url = String(input);
      init = options;
      return new Response("{}", { status: 200 });
    },
  );
  assert.equal(response.status, 200);
  assert.equal(
    url,
    `${geminiGenerateContentBaseUrl}/gemini-3.5-flash-lite:generateContent`,
  );
  assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "fake-test-key");
  assert.equal(init?.method, "POST");
});

test("Gemini parses a successful response and preserves STOP finish reason", () => {
  assert.deepEqual(parseGeminiCompletion({
    candidates: [{
      content: { parts: [{ text: "SQL is a query language." }] },
      finishReason: "STOP",
    }],
    usageMetadata: { candidatesTokenCount: 18 },
  }), {
    reply: "SQL is a query language.",
    finishReason: "STOP",
    incomplete: false,
    completionTokens: 18,
  });
});

test("Gemini marks MAX_TOKENS responses incomplete", () => {
  const completion = parseGeminiCompletion({
    candidates: [{
      content: { parts: [{ text: "An unfinished explanation" }] },
      finishReason: "MAX_TOKENS",
    }],
  });
  assert.equal(completion?.finishReason, "MAX_TOKENS");
  assert.equal(completion?.incomplete, true);
});

test("Gemini classifies authentication errors", () => {
  assert.equal(classifyGeminiProviderFailure(401, {}), "authentication_error");
  assert.equal(classifyGeminiProviderFailure(403, { error: { status: "PERMISSION_DENIED" } }), "authentication_error");
});

test("Gemini classifies model-not-found errors", () => {
  assert.equal(classifyGeminiProviderFailure(404, {}), "model_not_found");
});

test("Gemini classifies rate limits", () => {
  assert.equal(classifyGeminiProviderFailure(429, {}), "rate_limit");
  assert.equal(classifyGeminiProviderFailure(400, { error: { status: "RESOURCE_EXHAUSTED" } }), "rate_limit");
});

test("Gemini classifies context errors separately", () => {
  assert.equal(
    classifyGeminiProviderFailure(400, { error: { message: "Input token count exceeds the maximum context length." } }),
    "context_limit",
  );
});

test("Gemini classifies upstream 5xx errors", () => {
  assert.equal(classifyGeminiProviderFailure(503, {}), "server_error");
});

test("Gemini rejects malformed successful responses", () => {
  assert.equal(parseGeminiCompletion({ candidates: [] }), null);
  assert.equal(parseGeminiCompletion({
    candidates: [{ content: { parts: [] }, finishReason: "STOP" }],
  }), null);
});

test("Gemini distinguishes timeout and network failures", () => {
  assert.equal(classifyGeminiTransportFailure(new DOMException("Timed out", "TimeoutError")), "timeout");
  assert.equal(classifyGeminiTransportFailure(new TypeError("fetch failed")), "network_error");
});
