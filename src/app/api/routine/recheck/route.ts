import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { rateLimited, tooMany } from "@/lib/limit";
import { refillStatus } from "@/lib/paypal-toolkit";
import { paypalSays, runRecheck, type RecheckEvent } from "@/lib/recheck";
import { replayStore } from "@/lib/replay";
import { ScoresSchema } from "@/lib/schemas";
import { verify } from "@/lib/sign";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({
  lines: z
    .array(z.object({ productId: z.string().regex(/^\d{8,14}$/), quantity: z.number().int().min(1).max(5) }))
    .min(1)
    .max(8),
  scores: ScoresSchema,
  excludeIds: z.array(z.string().regex(/^\d{8,14}$/)).max(8).default([]),
  /** The refill being checked: lets the agent read it live from PayPal. Only its subscriber holds the token. */
  subscriptionId: z.string().regex(/^I-[A-Z0-9]{8,20}$/).optional(),
  subscriptionToken: z.string().max(100).optional(),
});

/** Before a refill ships: the agent re-checks the routine against the shopper's newest scan. */
export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid routine." }, { status: 400 });
  if (rateLimited(request, "recheck", 15)) return tooMany();
  const { subscriptionId, subscriptionToken } = parsed.data;
  if (subscriptionId && !verify("subscription", subscriptionId, subscriptionToken)) {
    return Response.json({ error: "Only the subscriber can check this refill." }, { status: 403 });
  }

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
      // Local recording aid only (off in production): replay a saved agent run.
      const { lines, scores, excludeIds } = parsed.data;
      const rec = replayStore<RecheckEvent>("recheck", { lines, scores, excludeIds });
      try {
        if (rec?.cached) {
          // The PayPal read stays live: only the model's reasoning is replayed.
          await rec.replay(
            emit,
            async (e) =>
              e.type === "step" && e.text.startsWith("PayPal says:") && subscriptionId
                ? { type: "step", text: paypalSays(await refillStatus(subscriptionId)) }
                : e,
            abort.signal,
          );
          return;
        }
        const out = rec ? rec.tap(emit) : emit;
        out({ type: "result", result: await runRecheck(lines, scores, out, excludeIds, abort.signal, subscriptionId) });
        rec?.save();
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
