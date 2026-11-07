import * as z from "zod/v4";
import { captureOrder, PayPalError } from "@/lib/paypal";

export const runtime = "nodejs";

const BodySchema = z.object({ orderId: z.string().regex(/^[A-Z0-9]{10,25}$/) });

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid order." }, { status: 400 });
  try {
    return Response.json(await captureOrder(parsed.data.orderId));
  } catch (e) {
    console.error(e);
    const message = e instanceof PayPalError ? e.message : "PayPal couldn't complete the payment.";
    return Response.json({ error: message }, { status: 502 });
  }
}
