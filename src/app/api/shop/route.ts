import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { rateLimited, tooMany } from "@/lib/limit";
import { runShopper, type ShopEvent } from "@/lib/shopper";
import { ScoresSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({
  request: z.string().min(3).max(300),
  scores: ScoresSchema,
});

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Tell the shopper what you need." }, { status: 400 });
  if (rateLimited(request, "shop", 20)) return tooMany();

  const encoder = new TextEncoder();
  // Stop the model (and any checkout) as soon as the shopper disconnects.
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());
  const stream = new ReadableStream({
    cancel() {
      abort.abort();
    },
    async start(controller) {
      const emit = (e: ShopEvent) => {
        if (!abort.signal.aborted) controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      };
      try {
        emit({ type: "cart", cart: await runShopper(parsed.data.request, parsed.data.scores, emit, abort.signal) });
      } catch (e) {
        console.error(e);
        // Never show raw provider errors (billing, auth) to shoppers.
        const message =
          e instanceof Anthropic.APIError
            ? "The shopping assistant is unavailable right now. Please try again shortly."
            : e instanceof Error
              ? e.message
              : "Something went wrong.";
        emit({ type: "error", message });
      } finally {
        if (!abort.signal.aborted) controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
