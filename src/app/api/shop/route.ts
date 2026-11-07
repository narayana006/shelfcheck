import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";
import { rateLimited, tooMany } from "@/lib/limit";
import { runShopper, type ShopEvent } from "@/lib/shopper";
import { CONCERN_KEYS } from "@/lib/skin";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({
  request: z.string().min(3).max(300),
  scores: z.array(z.object({ concern: z.enum(CONCERN_KEYS), score: z.number().min(0).max(100) })).min(1),
});

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Tell the shopper what you need." }, { status: 400 });
  if (rateLimited(request, "shop", 20)) return tooMany();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ShopEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        emit({ type: "cart", cart: await runShopper(parsed.data.request, parsed.data.scores, emit) });
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
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
