import * as z from "zod/v4";
import { rateLimited, tooMany } from "@/lib/limit";
import { PayPalError } from "@/lib/paypal";
import { createRefillPlan, getSubscription } from "@/lib/subscriptions";

export const runtime = "nodejs";

const CreateSchema = z.object({
  lines: z
    .array(z.object({ productId: z.string().max(20), quantity: z.number().int().min(1).max(5) }))
    .min(1)
    .max(8),
  intervalWeeks: z.number().int().min(4).max(16),
});

/** Create a PayPal billing plan that refills this cart every N weeks. */
export async function POST(request: Request) {
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid refill request." }, { status: 400 });
  if (rateLimited(request, "refill", 10)) return tooMany();
  try {
    return Response.json(await createRefillPlan(parsed.data.lines, parsed.data.intervalWeeks));
  } catch (e) {
    console.error(e);
    return Response.json({ error: e instanceof PayPalError ? "PayPal couldn't set up the refill plan." : "Refill setup failed." }, { status: 502 });
  }
}

/** Verify a subscription the shopper approved. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("subscription") ?? "";
  if (!/^I-[A-Z0-9]{8,20}$/.test(id)) return Response.json({ error: "Invalid subscription id." }, { status: 400 });
  try {
    return Response.json(await getSubscription(id));
  } catch (e) {
    console.error(e);
    return Response.json({ error: "Couldn't verify the subscription with PayPal." }, { status: 502 });
  }
}
