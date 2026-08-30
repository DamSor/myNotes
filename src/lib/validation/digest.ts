import { z } from "zod";

export const createDigestSchema = z.object({
  tagId: z.uuid(),
});

export type CreateDigestInput = z.infer<typeof createDigestSchema>;

// Single source of truth for validating ai_content PATCH (reused by PATCH /api/ai-content/:id).
// Body is required (the only editable field), trimmed, and must be non-empty.
export const updateAiContentSchema = z.object({
  body: z.string().trim().min(1, "Body is required"),
});

export type UpdateAiContentInput = z.infer<typeof updateAiContentSchema>;
