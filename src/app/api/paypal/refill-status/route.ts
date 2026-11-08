import { rateLimited, tooMany } from "@/lib/limit";
import { refillStatus } from "@/lib/paypal-toolkit";
import { verify } from "@/lib/sign";

export const runtime = "nodejs";

/**
 * The refill as PayPal sees it (status, next bill date, price), read with the PayPal Agent Toolkit.
 * The app uses it to start the agent's pre-bill re-check on its own. Subscriber only.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("subscription") ?? "";
  if (!/^I-[A-Z0-9]{8,20}$/.test(id)) return Response.json({ error: "Invalid subscription." }, { status: 400 });
  // The token travels in a header, not the URL, so it stays out of access logs.
  if (!verify("subscription", id, request.headers.get("x-subscription-token") ?? undefined)) {
    return Response.json({ error: "Only the subscriber can read this refill." }, { status: 403 });
  }
  if (rateLimited(request, "refill-status", 30)) return tooMany();
  try {
    return Response.json(await refillStatus(id), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return Response.json({ error: "PayPal couldn't read the refill." }, { status: 502 });
  }
}
