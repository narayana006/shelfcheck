import * as z from "zod/v4";
import { rateLimited, tooMany } from "@/lib/limit";
import { createOrder, PayPalError, priceCart } from "@/lib/paypal";

export const runtime = "nodejs";

const BodySchema = z.object({
  lines: z
    .array(z.object({ productId: z.string().max(20), quantity: z.number().int().min(1).max(5) }))
    .min(1)
    .max(8),
});

/** Create a PayPal order for a cart the shopper edited after the agent built it. */
export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid cart." }, { status: 400 });
  if (rateLimited(request, "order", 30)) return tooMany();
  try {
    const { total } = priceCart(parsed.data.lines);
    const orderId = await createOrder(parsed.data.lines, "ShelfCheck skin-matched routine");
    return Response.json({ orderId, total });
  } catch (e) {
    console.error(e);
    const message = e instanceof PayPalError ? e.message : "PayPal couldn't create the order.";
    return Response.json({ error: message }, { status: 502 });
  }
}
