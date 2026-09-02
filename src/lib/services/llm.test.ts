import { describe, it, expect } from "vitest";
import { chatCompletion, LlmRequestError } from "@/lib/services/llm";

describe("chatCompletion", () => {
  it("throws LlmRequestError on empty messages", async () => {
    await expect(chatCompletion([])).rejects.toThrow(LlmRequestError);
    await expect(chatCompletion([])).rejects.toThrow("messages must not be empty");
  });
});
