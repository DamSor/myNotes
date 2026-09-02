import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockSupabase } from "./__tests__/helpers";

vi.mock("@/lib/services/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/llm")>();
  return {
    ...actual,
    chatCompletion: vi.fn(),
    isLlmConfigured: vi.fn().mockReturnValue(true),
  };
});

import { chatCompletion, isLlmConfigured, LlmRequestError } from "@/lib/services/llm";
import { buildUserPrompt, truncateNotes, generateDigest, DigestError, type NoteRow } from "@/lib/services/digest";

function note(id: string, content: string, createdAt = "2026-09-01T00:00:00Z"): NoteRow {
  return { id, content, created_at: createdAt };
}

describe("buildUserPrompt", () => {
  it("formats a single note without header when truncatedCount is 0", () => {
    const result = buildUserPrompt([note("1", "Hello")], 0);
    expect(result).toContain("--- Note 1");
    expect(result).toContain("Hello");
    expect(result).not.toContain("omitted");
  });

  it("formats multiple notes in order", () => {
    const result = buildUserPrompt([note("1", "First"), note("2", "Second")], 0);
    expect(result).toContain("--- Note 1");
    expect(result).toContain("--- Note 2");
    const idx1 = result.indexOf("First");
    const idx2 = result.indexOf("Second");
    expect(idx1).toBeLessThan(idx2);
  });

  it("includes truncation notice when truncatedCount > 0", () => {
    const result = buildUserPrompt([note("1", "Kept")], 3);
    expect(result).toContain("3 oldest note(s) were omitted");
    expect(result).toContain("Kept");
  });
});

describe("truncateNotes", () => {
  it("keeps all notes when total size is within limit", () => {
    const notes = [note("1", "short"), note("2", "also short")];
    const { kept, truncatedCount } = truncateNotes(notes);
    expect(kept).toHaveLength(2);
    expect(truncatedCount).toBe(0);
  });

  it("drops oldest notes when total exceeds limit", () => {
    const notes = [
      note("1", "A".repeat(40_000), "2026-01-01"),
      note("2", "B".repeat(10_000), "2026-01-02"),
      note("3", "C".repeat(10_000), "2026-01-03"),
    ];
    const { kept, truncatedCount } = truncateNotes(notes);
    expect(truncatedCount).toBe(1);
    expect(kept).toHaveLength(2);
    expect(kept[0].id).toBe("2");
    expect(kept[1].id).toBe("3");
  });

  it("hard-truncates a single note exceeding the limit", () => {
    const notes = [note("1", "X".repeat(60_000))];
    const { kept, truncatedCount } = truncateNotes(notes);
    expect(kept).toHaveLength(1);
    expect(kept[0].content).toHaveLength(50_000);
    expect(truncatedCount).toBe(0);
  });
});

describe("generateDigest — error propagation", () => {
  beforeEach(() => {
    vi.mocked(isLlmConfigured).mockReturnValue(true);
    vi.mocked(chatCompletion).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws DigestError 503 when LLM is not configured", async () => {
    vi.mocked(isLlmConfigured).mockReturnValue(false);
    const { client } = createMockSupabase([]);

    const err = await generateDigest(client, "user-a", "tag-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DigestError);
    expect(err).toHaveProperty("statusCode", 503);
  });

  it("throws DigestError 422 when no notes are found", async () => {
    const { client } = createMockSupabase([
      { data: null, error: null },
      { data: [], error: null },
    ]);

    const err = await generateDigest(client, "user-a", "tag-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DigestError);
    expect(err).toHaveProperty("statusCode", 422);
  });

  it("re-throws LlmRequestError and does not insert ai_content", async () => {
    const { client, builder } = createMockSupabase([
      { data: null, error: null },
      { data: [note("n1", "content")], error: null },
    ]);
    vi.mocked(chatCompletion).mockRejectedValue(new LlmRequestError("llm failed", 500));

    const err = await generateDigest(client, "user-a", "tag-1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmRequestError);
    expect(builder.insert).not.toHaveBeenCalled();
  });
});

describe("generateDigest — data isolation", () => {
  beforeEach(() => {
    vi.mocked(isLlmConfigured).mockReturnValue(true);
    vi.mocked(chatCompletion).mockResolvedValue({ text: "digest content" });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("scopes all queries by the provided user_id", async () => {
    const digestRow = {
      id: "d1",
      user_id: "user-a",
      source_tag_id: "tag-1",
      kind: "digest",
      body: "digest content",
      created_at: "2026-09-01T00:00:00Z",
      updated_at: "2026-09-01T00:00:00Z",
      deleted_at: null,
    };
    const { client, builder } = createMockSupabase([
      { data: null, error: null },
      { data: [note("n1", "User A note")], error: null },
      { data: digestRow, error: null },
    ]);

    await generateDigest(client, "user-a", "tag-1");

    const userIdCalls = (builder.eq.mock.calls as unknown[][]).filter(([key]) => key === "user_id");
    expect(userIdCalls.length).toBeGreaterThanOrEqual(2);
    for (const [, value] of userIdCalls) {
      expect(value).toBe("user-a");
    }
  });
});
