import * as z from "zod/v4";
import { rateLimited, tooMany } from "@/lib/limit";
import { getProduct } from "@/lib/catalog";
import { fitFor } from "@/lib/shopper";
import { CONCERN_KEYS } from "@/lib/skin";
import { getSubscription, PayPalError, planForLines, reviseSubscription } from "@/lib/subscriptions";

export const runtime = "nodejs";

const BodySchema = z.object({
  subscriptionId: z.string().regex(/^I-[A-Z0-9]{8,20}$/),
  intervalWeeks: z.number().int().min(4).max(16),
  lines: z
    .array(z.object({ productId: z.string().regex(/^\d{8,14}$/), quantity: z.number().int().min(1).max(5) }))
    .min(1)
    .max(8),
  scores: z.array(z.object({ concern: z.enum(CONCERN_KEYS), score: z.number().min(0).max(100) })).min(1),
});

/**
 * Apply the agent's swapped routine to the refill subscription. The fit gate runs again here,
 * so a revised refill can never contain a product that fails the shopper's latest scan.
 */
export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid change." }, { status: 400 });
  if (rateLimited(request, "revise", 10)) return tooMany();
  const { subscriptionId, intervalWeeks, lines, scores } = parsed.data;

  for (const l of lines) {
    const p = getProduct(l.productId);
    if (!p || fitFor(p, scores).verdict === "caution") {
      return Response.json({ error: "That routine includes a product that fails your skin check." }, { status: 400 });
    }
  }
  try {
    const sub = await getSubscription(subscriptionId);
    if (sub.status !== "ACTIVE") return Response.json({ error: "Only an active refill can be changed." }, { status: 400 });
    const plan = await planForLines(lines, intervalWeeks);
    const origin = new URL(request.url).origin;
    const { approveUrl } = await reviseSubscription(subscriptionId, plan.planId, `${origin}/?revised=${subscriptionId}`);
    return Response.json({ approveUrl, planId: plan.planId, price: plan.price });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof PayPalError ? "PayPal couldn't update the refill." : "Update failed." }, { status: 502 });
  }
}
