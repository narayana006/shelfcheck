import * as z from "zod/v4";
import { rateLimited, tooMany } from "@/lib/limit";
import { captureOrder, orderStatus, PayPalError } from "@/lib/paypal";
import { sign, signingReady } from "@/lib/sign";

export const runtime = "nodejs";

const BodySchema = z.object({ orderId: z.string().regex(/^[A-Z0-9]{10,25}$/) });

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid order." }, { status: 400 });
  if (rateLimited(request, "capture", 30)) return tooMany();
  // Check the signing secret before taking money, so a paid order always gets its token.
  if (!signingReady()) return Response.json({ error: "Checkout isn't configured on this server." }, { status: 503 });
  try {
    // Only the first capture issues a token: replaying capture for a paid order never grants refund rights.
    if ((await orderStatus(parsed.data.orderId)) === "COMPLETED") {
      return Response.json({ error: "This order has already been paid." }, { status: 409 });
    }
    const result = await captureOrder(parsed.data.orderId);
    // Only the browser that paid gets this token; refunds and refills require it.
    return Response.json({ ...result, token: sign("order", result.orderId) });
  } catch (e) {
    console.error(e);
    const message = e instanceof PayPalError ? e.message : "PayPal couldn't complete the payment.";
    return Response.json({ error: message }, { status: 502 });
  }
}
