import { z } from "zod";

export const createDigestSchema = z.object({
  tagId: z.uuid(),
});

export type CreateDigestInput = z.infer<typeof createDigestSchema>;
