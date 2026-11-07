import * as z from "zod/v4";
import { rateLimited, tooMany } from "@/lib/limit";
import { PayPalError, refundItem } from "@/lib/paypal";
import { verify } from "@/lib/sign";

export const runtime = "nodejs";

const BodySchema = z.object({
  orderId: z.string().regex(/^[A-Z0-9]{10,25}$/),
  productId: z.string().regex(/^\d{8,14}$/),
  token: z.string().max(100),
  reason: z.string().max(200).optional(),
});

/** Reaction guarantee: refund one product from a completed order, for the shopper who paid. */
export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid refund request." }, { status: 400 });
  if (!verify("order", parsed.data.orderId, parsed.data.token)) {
    return Response.json({ error: "Only the shopper who paid for this order can refund it." }, { status: 403 });
  }
  if (rateLimited(request, "refund", 10)) return tooMany();
  try {
    return Response.json(await refundItem(parsed.data.orderId, parsed.data.productId, parsed.data.reason));
  } catch (e) {
    console.error(e);
    const message = e instanceof PayPalError ? e.message : "PayPal couldn't process the refund.";
    return Response.json({ error: message }, { status: 502 });
  }
}
