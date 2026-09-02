import { vi } from "vitest";

vi.mock("astro:env/server", () => ({
  SUPABASE_URL: "http://localhost:54321",
  SUPABASE_KEY: "test-anon-key",
  OPENROUTER_API_KEY: "test-openrouter-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
}));
