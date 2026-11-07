import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { rateLimited, tooMany } from "@/lib/limit";
import { runRecheck, type RecheckEvent } from "@/lib/recheck";
import { CONCERN_KEYS } from "@/lib/skin";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({
  lines: z
    .array(z.object({ productId: z.string().regex(/^\d{8,14}$/), quantity: z.number().int().min(1).max(5) }))
    .min(1)
    .max(8),
  scores: z.array(z.object({ concern: z.enum(CONCERN_KEYS), score: z.number().min(0).max(100) })).min(1),
});

/** Before a refill ships: the agent re-checks the routine against the shopper's newest scan. */
export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid routine." }, { status: 400 });
  if (rateLimited(request, "recheck", 15)) return tooMany();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: RecheckEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        emit({ type: "result", result: await runRecheck(parsed.data.lines, parsed.data.scores, emit) });
      } catch (e) {
        console.error(e);
        const message =
          e instanceof Anthropic.APIError ? "The routine check is unavailable right now." : e instanceof Error ? e.message : "Something went wrong.";
        emit({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
