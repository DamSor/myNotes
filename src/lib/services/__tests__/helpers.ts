import { vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

export function createMockSupabase(results: { data: unknown; error: unknown }[]) {
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
