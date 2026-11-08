import "server-only";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";

/**
 * Read-only PayPal Agent Toolkit tools for the routine keeper. The agent reads the shopper's live
 * refill straight from PayPal (status, next bill, price) before deciding anything. Writes (orders,
 * refunds, subscription changes) stay in ShelfCheck's own code, behind its guardrails.
 */
let toolkit: PayPalAgentToolkit | null = null;
function tools() {
  if (!toolkit) {
    const { PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET } = process.env;
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) throw new Error("PayPal isn't configured on this server.");
    toolkit = new PayPalAgentToolkit({
      clientId: PAYPAL_CLIENT_ID,
      clientSecret: PAYPAL_CLIENT_SECRET,
      configuration: {
        actions: { subscriptions: { show: true }, subscriptionPlans: { show: true } },
        context: { sandbox: process.env.PAYPAL_ENV !== "live" },
      },
    });
  }
  return toolkit.getTools();
}

async function call(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const tool = tools()[name];
  if (!tool?.execute) throw new Error(`PayPal tool ${name} is unavailable.`);
  const out = await tool.execute(args, { toolCallId: name, messages: [] });
  const data = typeof out === "string" ? JSON.parse(out) : out;
  if (data?.error) throw new Error(typeof data.error === "object" ? String(data.error.message ?? "PayPal error") : String(data.error));
  return data as Record<string, unknown>;
}

export interface RefillStatus {
  status: string;
  nextBilling: string | null;
  lastPayment: string | null;
  pricePerRefill: number | null;
  everyWeeks: number | null;
}

/** The shopper's refill as PayPal sees it, via the Agent Toolkit's subscription tools. */
export async function refillStatus(subscriptionId: string): Promise<RefillStatus> {
  type Sub = { status?: string; plan_id?: string; billing_info?: { next_billing_time?: string; last_payment?: { amount?: { value?: string }; time?: string } } };
  type Plan = { billing_cycles?: { tenure_type?: string; frequency?: { interval_count?: number }; pricing_scheme?: { fixed_price?: { value?: string } } }[] };
  const sub = (await call("show_subscription_details", { subscription_id: subscriptionId })) as Sub;
  const plan = sub.plan_id ? ((await call("show_subscription_plan_details", { plan_id: sub.plan_id })) as Plan) : null;
  const cycle = plan?.billing_cycles?.find((c) => c.tenure_type === "REGULAR");
  const price = Number(cycle?.pricing_scheme?.fixed_price?.value);
  const last = sub.billing_info?.last_payment;
  return {
    status: sub.status ?? "UNKNOWN",
    nextBilling: sub.billing_info?.next_billing_time ?? null,
    lastPayment: last?.amount?.value ? `$${last.amount.value} on ${last.time?.slice(0, 10)}` : null,
    pricePerRefill: Number.isFinite(price) ? price : null,
    everyWeeks: cycle?.frequency?.interval_count ?? null,
  };
}
