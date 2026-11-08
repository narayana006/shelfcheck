import * as z from "zod/v4";
import { rateLimited, tooMany } from "@/lib/limit";
import { getProduct } from "@/lib/catalog";
import { priceCart } from "@/lib/paypal";
import { fitFor } from "@/lib/shopper";
import { verify } from "@/lib/sign";
import { ScoresSchema } from "@/lib/schemas";
import { getSubscription, PayPalError, planForLines, planPrice, reviseSubscription } from "@/lib/subscriptions";

export const runtime = "nodejs";

const BodySchema = z.object({
  subscriptionId: z.string().regex(/^I-[A-Z0-9]{8,20}$/),
  token: z.string().max(100),
  intervalWeeks: z.number().int().min(4).max(16),
  /** Products the shopper reacted to and was refunded for; never allowed back into a refill. */
  excludeIds: z.array(z.string().regex(/^\d{8,14}$/)).max(8).default([]),
  lines: z
    .array(z.object({ productId: z.string().regex(/^\d{8,14}$/), quantity: z.number().int().min(1).max(5) }))
    .min(1)
    .max(8),
  scores: ScoresSchema,
  /** Approval opens in a popup: PayPal's return page then reports back and closes itself. */
  popup: z.boolean().default(false),
});

/**
 * Apply the agent's swapped routine to the refill subscription. The fit gate runs again here,
 * so a revised refill can never contain a product that fails the shopper's latest scan.
 */
export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid change." }, { status: 400 });
  const { subscriptionId, token, intervalWeeks, excludeIds, lines, scores, popup } = parsed.data;
  if (!verify("subscription", subscriptionId, token)) {
    return Response.json({ error: "Only the subscriber can change this refill." }, { status: 403 });
  }
  if (rateLimited(request, "revise", 10)) return tooMany();

  for (const l of lines) {
    const p = getProduct(l.productId);
    if (!p || excludeIds.includes(l.productId) || fitFor(p, scores).verdict === "caution") {
      return Response.json({ error: "That routine includes a product that fails your skin check." }, { status: 400 });
    }
  }
  try {
    const sub = await getSubscription(subscriptionId);
    if (sub.status !== "ACTIVE") return Response.json({ error: "Only an active refill can be changed." }, { status: 400 });
    // Same cap the agent works under: a swapped routine can cost at most 15% more than today's refill.
    const current = sub.planId ? await planPrice(sub.planId) : null;
    const { total } = priceCart(lines);
    if (current === null || total > current * 1.15 + 0.005) {
      return Response.json({ error: "That change costs more than 15% over your current refill." }, { status: 400 });
    }
    const plan = await planForLines(lines, intervalWeeks);
    const origin = new URL(request.url).origin;
    const { approveUrl } = await reviseSubscription(subscriptionId, plan.planId, `${origin}/?revised=${subscriptionId}${popup ? "&popup=1" : ""}`);
    return Response.json({ approveUrl, planId: plan.planId, price: plan.price });
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof PayPalError ? "PayPal couldn't update the refill." : "Update failed." }, { status: 502 });
  }
}
