// Best-effort per-IP rate limit so a public demo can't drain the YouCam credit balance.
// In-memory, so it resets per server instance; good enough for a demo deployment.

const hits = new Map<string, number[]>();

export function rateLimited(request: Request, bucket: string, max: number, windowMs = 60 * 60 * 1000) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) return true;
  recent.push(now);
  hits.set(key, recent);
  return false;
}

export const tooMany = () =>
  Response.json({ error: "You've hit the demo limit for now. Please try again in an hour." }, { status: 429 });
