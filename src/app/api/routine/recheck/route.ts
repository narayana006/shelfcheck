import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { rateLimited, tooMany } from "@/lib/limit";
import { runRecheck, type RecheckEvent } from "@/lib/recheck";
import { ScoresSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({
  lines: z
    .array(z.object({ productId: z.string().regex(/^\d{8,14}$/), quantity: z.number().int().min(1).max(5) }))
    .min(1)
    .max(8),
  scores: ScoresSchema,
  excludeIds: z.array(z.string().regex(/^\d{8,14}$/)).max(8).default([]),
});

/** Before a refill ships: the agent re-checks the routine against the shopper's newest scan. */
export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid routine." }, { status: 400 });
  if (rateLimited(request, "recheck", 15)) return tooMany();

  const encoder = new TextEncoder();
  // Stop the model (and any checkout) as soon as the shopper disconnects.
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());
  const stream = new ReadableStream({
    cancel() {
      abort.abort();
    },
    async start(controller) {
      const emit = (e: RecheckEvent) => {
        if (!abort.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      try {
        emit({ type: "result", result: await runRecheck(parsed.data.lines, parsed.data.scores, emit, parsed.data.excludeIds, abort.signal) });
      } catch (e) {
        console.error(e);
        const message =
          e instanceof Anthropic.APIError ? "The routine check is unavailable right now." : e instanceof Error ? e.message : "Something went wrong.";
        emit({ type: "error", message });
      } finally {
        if (!abort.signal.aborted) controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
