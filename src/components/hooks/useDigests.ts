import { useCallback, useState } from "react";
import { readApiError } from "@/lib/api-client";
import type { AiContentWithTag, UpdateAiContentResponse } from "@/types";

// Owns digest list client state for the /ai island. Seeded from server-fetched
// initial data; mutations await the server then update in place (replace by id,
// delete removes) so the list stays truthful without a refetch.
export function useDigests(initialDigests: AiContentWithTag[]) {
  const [digests, setDigests] = useState<AiContentWithTag[]>(initialDigests);

  const updateDigest = useCallback(async (id: string, body: string): Promise<AiContentWithTag> => {
    const res = await fetch(`/api/ai-content/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });

    if (!res.ok) {
      throw new Error(await readApiError(res, "Failed to update digest"));
    }

    const data = (await res.json()) as UpdateAiContentResponse;
    setDigests((prev) => prev.map((digest) => (digest.id === id ? data.aiContent : digest)));
    return data.aiContent;
  }, []);

  const deleteDigest = useCallback(async (id: string): Promise<void> => {
    const res = await fetch(`/api/ai-content/${id}`, { method: "DELETE" });

    if (!res.ok) {
      throw new Error(await readApiError(res, "Failed to delete digest"));
    }

    setDigests((prev) => prev.filter((digest) => digest.id !== id));
  }, []);

  return { digests, updateDigest, deleteDigest };
}
