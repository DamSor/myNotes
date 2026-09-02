import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/services/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/llm")>();
  return {
    ...actual,
    chatCompletion: vi.fn(),
  };
});

import { chatCompletion, LlmRequestError } from "@/lib/services/llm";
import { generateWeeklySummaryForUser } from "@/lib/services/weekly-summary";
import type { NoteRow } from "@/lib/services/digest";

function createMockSupabase(results: { data: unknown; error: unknown }[]) {
  let idx = 0;
  const next = () => results[idx++] ?? { data: null, error: null };

  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const m of ["select", "insert", "update", "eq", "gt", "is", "in", "order", "limit"]) {
    builder[m] = vi.fn().mockReturnThis();
  }
  builder.maybeSingle = vi.fn(() => Promise.resolve(next()));
  builder.single = vi.fn(() => Promise.resolve(next()));

  Object.defineProperty(builder, "then", {
    value(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(next()).then(onFulfilled, onRejected);
    },
    configurable: true,
    enumerable: false,
  });

  const client = { from: vi.fn(() => builder) };
  return { client: client as unknown as SupabaseClient, builder };
}

function note(id: string, content: string, createdAt = "2026-09-01T00:00:00Z"): NoteRow {
  return { id, content, created_at: createdAt };
}

const threeNotes = [note("1", "Note one"), note("2", "Note two"), note("3", "Note three")];

describe("generateWeeklySummaryForUser", () => {
  beforeEach(() => {
    vi.mocked(chatCompletion).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null and skips LLM when fewer than 3 notes", async () => {
    const { client } = createMockSupabase([{ data: [note("1", "a"), note("2", "b")], error: null }]);

    const result = await generateWeeklySummaryForUser(client, "user-a", "2026-08-25T00:00:00Z", "key");
    expect(result).toBeNull();
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it("inserts weekly-failed row and re-throws when LLM fails", async () => {
    const { client, builder } = createMockSupabase([
      { data: threeNotes, error: null },
      { data: null, error: null },
    ]);
    vi.mocked(chatCompletion).mockRejectedValue(new LlmRequestError("timeout", 500));

    const err = await generateWeeklySummaryForUser(client, "user-a", "2026-08-25T00:00:00Z", "key").catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(LlmRequestError);
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ kind: "weekly-failed", user_id: "user-a" }));
  });

  it("inserts weekly-failed row when DB insert fails after LLM success", async () => {
    const { client, builder } = createMockSupabase([
      { data: threeNotes, error: null },
      { data: null, error: { message: "insert failed" } },
      { data: null, error: null },
    ]);
    vi.mocked(chatCompletion).mockResolvedValue({ text: "summary" });

    const err = await generateWeeklySummaryForUser(client, "user-a", "2026-08-25T00:00:00Z", "key").catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(Error);
    expect(builder.insert).toHaveBeenCalledTimes(2);
    const lastInsertArgs = builder.insert.mock.calls[1] as [Record<string, unknown>];
    expect(lastInsertArgs[0]).toMatchObject({ kind: "weekly-failed" });
  });
});
