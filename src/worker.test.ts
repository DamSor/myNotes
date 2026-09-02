import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockSupabase } from "@/lib/services/__tests__/helpers";

vi.mock("@astrojs/cloudflare/handler", () => ({ handle: vi.fn() }));
vi.mock("@/lib/supabase-admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/services/weekly-summary", () => ({
  generateWeeklySummaryForUser: vi.fn().mockResolvedValue(null),
  hasWeeklySummaryInWindow: vi.fn().mockResolvedValue(false),
}));

import worker from "@/worker";
import { createAdminClient } from "@/lib/supabase-admin";
import { generateWeeklySummaryForUser, hasWeeklySummaryInWindow } from "@/lib/services/weekly-summary";

function userNotes(userId: string, count: number) {
  return Array.from({ length: count }, () => ({ user_id: userId }));
}

function setupNotesQuery(notesData: { user_id: string }[]) {
  const mock = createMockSupabase([{ data: notesData, error: null }]);
  vi.mocked(createAdminClient).mockReturnValue(mock.client);
  return mock;
}

const baseEnv = {
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  OPENROUTER_API_KEY: "test-openrouter-key",
  ASSETS: {},
};

async function runScheduled(envOverrides: Record<string, unknown> = {}) {
  const env = { ...baseEnv, ...envOverrides };
  const waitUntilMock = vi.fn();
  // @ts-expect-error -- minimal mock objects for test; full Cloudflare types not needed
  worker.scheduled({}, env, { waitUntil: waitUntilMock, passThroughOnException: vi.fn() });
  await (waitUntilMock.mock.calls[0]?.[0] as Promise<void> | undefined);
}

describe("runWeeklySummaries", () => {
  beforeEach(() => {
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(generateWeeklySummaryForUser).mockReset().mockResolvedValue(null);
    vi.mocked(hasWeeklySummaryInWindow).mockReset().mockResolvedValue(false);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns early when OPENROUTER_API_KEY is missing", async () => {
    await runScheduled({ OPENROUTER_API_KEY: "" });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("does not generate for user with only 2 notes (below threshold)", async () => {
    setupNotesQuery(userNotes("u1", 2));

    await runScheduled();

    expect(generateWeeklySummaryForUser).not.toHaveBeenCalled();
  });

  it("generates for user with exactly 3 notes (at threshold)", async () => {
    setupNotesQuery(userNotes("u1", 3));

    await runScheduled();

    expect(hasWeeklySummaryInWindow).toHaveBeenCalledWith(expect.anything(), "u1", expect.any(String));
    expect(generateWeeklySummaryForUser).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      expect.any(String),
      "test-openrouter-key",
    );
  });

  it("generates for user with 5 notes (above threshold)", async () => {
    setupNotesQuery(userNotes("u1", 5));

    await runScheduled();

    expect(generateWeeklySummaryForUser).toHaveBeenCalledTimes(1);
  });

  it("skips user when hasWeeklySummaryInWindow returns true (idempotency)", async () => {
    setupNotesQuery(userNotes("u1", 3));
    vi.mocked(hasWeeklySummaryInWindow).mockResolvedValue(true);

    await runScheduled();

    expect(hasWeeklySummaryInWindow).toHaveBeenCalled();
    expect(generateWeeklySummaryForUser).not.toHaveBeenCalled();
  });

  it("continues to User B when User A generation throws (per-user isolation)", async () => {
    setupNotesQuery([...userNotes("u1", 3), ...userNotes("u2", 3)]);
    vi.mocked(generateWeeklySummaryForUser)
      .mockRejectedValueOnce(new Error("LLM failed for u1"))
      .mockResolvedValueOnce(null);

    await runScheduled();

    expect(generateWeeklySummaryForUser).toHaveBeenCalledTimes(2);
    expect(generateWeeklySummaryForUser).toHaveBeenCalledWith(
      expect.anything(),
      "u2",
      expect.any(String),
      expect.any(String),
    );
  });

  it("generates for all 3 eligible users", async () => {
    setupNotesQuery([...userNotes("u1", 4), ...userNotes("u2", 3), ...userNotes("u3", 5)]);

    await runScheduled();

    expect(generateWeeklySummaryForUser).toHaveBeenCalledTimes(3);
  });
});
