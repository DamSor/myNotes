import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const envMock = vi.hoisted((): { apiKey: string | undefined } => ({
  apiKey: "test-openrouter-key",
}));

vi.mock("astro:env/server", () => ({
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_KEY: "test-anon-key",
  get OPENROUTER_API_KEY() {
    return envMock.apiKey;
  },
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
}));

import { chatCompletion, LlmRequestError, LlmNotConfiguredError } from "@/lib/services/llm";

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, statusText: "OK", json: () => Promise.resolve(body) } as Response;
}

function errResponse(body: unknown, status: number): Response {
  return { ok: false, status, statusText: "Error", json: () => Promise.resolve(body) } as Response;
}

function validPayload(text: string) {
  return {
    choices: [{ message: { content: text } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

const msgs: Parameters<typeof chatCompletion>[0] = [{ role: "user", content: "test" }];

describe("chatCompletion", () => {
  beforeEach(() => {
    envMock.apiKey = "test-openrouter-key";
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws LlmNotConfiguredError when no API key is available", async () => {
    envMock.apiKey = undefined;
    await expect(chatCompletion(msgs)).rejects.toThrow(LlmNotConfiguredError);
  });

  it("throws LlmRequestError on empty messages array", async () => {
    await expect(chatCompletion([])).rejects.toThrow("messages must not be empty");
  });

  it("throws LlmRequestError on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network")));
    const err = await chatCompletion(msgs).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmRequestError);
    expect(err).toHaveProperty("message", "OpenRouter request failed");
  });

  it("throws LlmRequestError with timeout message on AbortError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));
    const err = await chatCompletion(msgs).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmRequestError);
    expect(err).toHaveProperty("message", "OpenRouter request timed out");
  });

  it("throws LlmRequestError on non-JSON response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.reject(new SyntaxError("bad json")),
      }),
    );
    const err = await chatCompletion(msgs).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmRequestError);
    expect(err).toHaveProperty("status", 200);
  });

  it("throws LlmRequestError on HTTP 429 rate limit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errResponse({ error: "rate limited" }, 429)));
    const err = await chatCompletion(msgs).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmRequestError);
    expect(err).toHaveProperty("status", 429);
  });

  it("throws LlmRequestError on HTTP 500 server error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errResponse({ error: "internal" }, 500)));
    const err = await chatCompletion(msgs).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmRequestError);
    expect(err).toHaveProperty("status", 500);
  });

  it("throws LlmRequestError on 200 with empty choices array", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ choices: [] })));
    const err = await chatCompletion(msgs).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmRequestError);
    expect(err).toHaveProperty("status", 200);
  });

  it("throws LlmRequestError on 200 with missing content field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ choices: [{ message: {} }] })));
    const err = await chatCompletion(msgs).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmRequestError);
  });

  it("throws LlmRequestError on 200 with empty string content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse(validPayload(""))));
    const err = await chatCompletion(msgs).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmRequestError);
    expect(err).toHaveProperty("status", 200);
  });

  it("throws LlmRequestError on 200 with whitespace-only content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse(validPayload("   \n  "))));
    const err = await chatCompletion(msgs).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmRequestError);
  });

  it("returns text and usage on valid completion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse(validPayload("Hello world"))));
    const result = await chatCompletion(msgs);
    expect(result.text).toBe("Hello world");
    expect(result.usage).toEqual({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
  });
});
