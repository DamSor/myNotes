// Shared HTTP helpers for the JSON data API. Import from every API route so the
// response/error shape stays uniform across slices (S-01..S-05).

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
