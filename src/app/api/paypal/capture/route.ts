import * as z from "zod/v4";
import { rateLimited, tooMany } from "@/lib/limit";
import { captureOrder, PayPalError } from "@/lib/paypal";
import { sign } from "@/lib/sign";

export const runtime = "nodejs";

const BodySchema = z.object({ orderId: z.string().regex(/^[A-Z0-9]{10,25}$/) });

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid order." }, { status: 400 });
  if (rateLimited(request, "capture", 30)) return tooMany();
  try {
    const result = await captureOrder(parsed.data.orderId);
    // Only the browser that paid gets this token; refunds and refills require it.
    return Response.json({ ...result, token: sign("order", result.orderId) });
  } catch (e) {
    console.error(e);
    const message = e instanceof PayPalError ? e.message : "PayPal couldn't complete the payment.";
    return Response.json({ error: message }, { status: 502 });
  }
}
