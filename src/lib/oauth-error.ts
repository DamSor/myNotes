/** Map OAuth provider error codes/descriptions to copy shown on /auth/signin. */
export function oauthUserMessage(code: string | null, description?: string | null): string | null {
  const err = (code ?? "").trim();
  const desc = (description ?? "").trim();
  if (!err && !desc) {
    return null;
  }
  if (err === "access_denied" || desc === "access_denied") {
    return "Google sign-in was cancelled.";
  }
  return desc || err;
}
