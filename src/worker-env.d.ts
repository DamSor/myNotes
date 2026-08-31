// Minimal Cloudflare Worker types for the custom entry point (src/worker.ts).
// Scoped here to avoid polluting the global type space — the full
// @cloudflare/workers-types package overrides Response.json() and other
// web APIs in ways that conflict with the rest of the Astro codebase.

interface ScheduledController {
  readonly scheduledTime: number;
  readonly cron: string;
  noRetry(): void;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ExportedHandler<Env = Record<string, unknown>> {
  fetch?(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response>;
  scheduled?(controller: ScheduledController, env: Env, ctx: ExecutionContext): void | Promise<void>;
}
