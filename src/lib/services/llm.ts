import { OPENROUTER_API_KEY } from "astro:env/server";
import type { LlmCompletion, LlmCompletionOptions, LlmMessage } from "@/types";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_HTTP_REFERER = "https://my-notes.damian-sordyl.workers.dev";
const OPENROUTER_APP_TITLE = "MyNotes";

// Pinned cheap/fast Haiku-class slug (verified against openrouter.ai/models, Aug 2026).
export const DEFAULT_LLM_MODEL = "anthropic/claude-haiku-4.5";

interface OpenRouterChatResponse {
  error?: { message?: string } | string;
  choices?: { message?: { content?: unknown } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export function isLlmConfigured(apiKey?: string): boolean {
  return Boolean(apiKey ?? OPENROUTER_API_KEY);
}

export class LlmNotConfiguredError extends Error {
  constructor(message = "OpenRouter is not configured") {
    super(message);
    this.name = "LlmNotConfiguredError";
  }
}

export class LlmRequestError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "LlmRequestError";
    this.status = status;
  }
}

function providerErrorMessage(payload: OpenRouterChatResponse): string | undefined {
  const error = payload.error;
  if (typeof error === "string") {
    return error;
  }
  if (typeof error?.message === "string") {
    return error.message;
  }
  return undefined;
}

function completionText(payload: OpenRouterChatResponse): string | undefined {
  const content = payload.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : undefined;
}

function completionUsage(payload: OpenRouterChatResponse): LlmCompletion["usage"] {
  const usage = payload.usage;
  if (
    usage === undefined ||
    typeof usage.prompt_tokens !== "number" ||
    typeof usage.completion_tokens !== "number" ||
    typeof usage.total_tokens !== "number"
  ) {
    return undefined;
  }
  return {
    promptTokens: usage.prompt_tokens,
    completionTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
  };
}

export async function chatCompletion(messages: LlmMessage[], opts?: LlmCompletionOptions): Promise<LlmCompletion> {
  const resolvedKey = opts?.apiKey ?? OPENROUTER_API_KEY;
  if (!resolvedKey) {
    throw new LlmNotConfiguredError();
  }
  if (messages.length === 0) {
    throw new LlmRequestError("messages must not be empty");
  }

  const body: {
    model: string;
    messages: LlmMessage[];
    provider: { data_collection: "deny" };
    temperature?: number;
    max_tokens?: number;
  } = {
    model: opts?.model ?? DEFAULT_LLM_MODEL,
    messages,
    provider: { data_collection: "deny" },
  };
  if (opts?.temperature !== undefined) {
    body.temperature = opts.temperature;
  }
  if (opts?.maxTokens !== undefined) {
    body.max_tokens = opts.maxTokens;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 25_000);

  let res: Response;
  try {
    res = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolvedKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": OPENROUTER_HTTP_REFERER,
        "X-Title": OPENROUTER_APP_TITLE,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    // eslint-disable-next-line no-console -- intentional server-side error log
    console.error("chatCompletion: OpenRouter fetch failed", e);
    const message =
      e instanceof DOMException && e.name === "AbortError"
        ? "OpenRouter request timed out"
        : "OpenRouter request failed";
    throw new LlmRequestError(message);
  } finally {
    clearTimeout(timeout);
  }

  let payload: OpenRouterChatResponse;
  try {
    payload = (await res.json()) as OpenRouterChatResponse;
  } catch (e) {
    // eslint-disable-next-line no-console -- intentional server-side error log
    console.error("chatCompletion: OpenRouter response was not JSON", e);
    throw new LlmRequestError("OpenRouter returned a non-JSON response", res.status);
  }

  if (!res.ok) {
    const detail = providerErrorMessage(payload) ?? res.statusText;
    const message = `OpenRouter request failed (${res.status}): ${detail}`;
    // eslint-disable-next-line no-console -- intentional server-side error log
    console.error("chatCompletion: OpenRouter non-2xx", message);
    throw new LlmRequestError(message, res.status);
  }

  const text = completionText(payload);
  if (text === undefined) {
    // eslint-disable-next-line no-console -- intentional server-side error log
    console.error("chatCompletion: OpenRouter response missing completion text");
    throw new LlmRequestError("OpenRouter response missing completion text", res.status);
  }

  if (text.trim().length === 0) {
    // eslint-disable-next-line no-console -- intentional server-side error log
    console.error("chatCompletion: OpenRouter returned an empty completion");
    throw new LlmRequestError("OpenRouter returned an empty completion", res.status);
  }

  return { text, usage: completionUsage(payload) };
}
