import * as z from "zod/v4";
import { rateLimited, tooMany } from "@/lib/limit";
import { sign, verify } from "@/lib/sign";
import { createRefillPlan, getSubscription, PayPalError } from "@/lib/subscriptions";

export const runtime = "nodejs";

const CreateSchema = z.object({
  orderId: z.string().regex(/^[A-Z0-9]{10,25}$/),
  token: z.string().max(100),
  intervalWeeks: z.number().int().min(4).max(16),
});

/** Create a PayPal billing plan that refills a completed order every N weeks (for the shopper who paid). */
export async function POST(request: Request) {
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid refill request." }, { status: 400 });
  if (!verify("order", parsed.data.orderId, parsed.data.token)) {
    return Response.json({ error: "Only the shopper who paid for this order can set up its refill." }, { status: 403 });
  }
  if (rateLimited(request, "refill", 10)) return tooMany();
  try {
    return Response.json(await createRefillPlan(parsed.data.orderId, parsed.data.intervalWeeks));
  } catch (e) {
    console.error(e);
    const message = e instanceof PayPalError && e.message.startsWith("Refills") ? e.message : "PayPal couldn't set up the refill plan.";
    return Response.json({ error: message }, { status: 502 });
  }
}

/**
 * Verify a subscription the shopper approved, and (for the order's owner) issue the token that
 * later authorizes changing it.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("subscription") ?? "";
  const orderId = url.searchParams.get("order") ?? "";
  const token = url.searchParams.get("token") ?? undefined;
  if (!/^I-[A-Z0-9]{8,20}$/.test(id)) return Response.json({ error: "Invalid subscription id." }, { status: 400 });
  if (!verify("order", orderId, token)) return Response.json({ error: "Not your order." }, { status: 403 });
  try {
    const sub = await getSubscription(id);
    return Response.json({ ...sub, token: sign("subscription", id) });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Couldn't verify the subscription with PayPal." }, { status: 502 });
  }
}
