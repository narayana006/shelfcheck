// PayPal Subscriptions for routine auto-refill, via the REST API (sandbox).
// https://developer.paypal.com/docs/api/subscriptions/v1/ and /docs/api/catalog-products/v1/

import { PayPalError, priceCart, type CartLine } from "./paypal";

export { PayPalError };

const BASE = process.env.PAYPAL_ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

let token: { value: string; expires: number } | null = null;
let productId: string | null = null;

async function accessToken() {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new PayPalError("The server is missing its PayPal sandbox credentials.");
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new PayPalError("PayPal authentication failed.");
  const json = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: json.access_token, expires: Date.now() + json.expires_in * 1000 };
  return token.value;
}

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new PayPalError(`PayPal ${path} ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

/** One catalog product ("ShelfCheck routine refill") that every refill plan hangs off. */
async function refillProduct() {
  // Pinned in production so every server instance hangs plans off the same product (PayPal
  // only revises a subscription to a plan of the same product).
  productId ??= process.env.PAYPAL_REFILL_PRODUCT_ID ?? null;
  if (productId) return productId;
  const p = await api<{ id: string }>("POST", "/v1/catalogs/products", {
    name: "ShelfCheck routine refill",
    description: "Skin-matched skincare routine, refilled on a schedule",
    type: "PHYSICAL",
  });
  productId = p.id;
  return productId;
}

export interface RefillPlan {
  planId: string;
  intervalWeeks: number;
  price: number;
}

// One plan per (paid order, cadence): repeat clicks reuse it instead of piling up plans.
const plans = new Map<string, RefillPlan>();

/** The paid order's lines, read back from PayPal so the refill always matches what was bought. */
async function paidOrderLines(orderId: string): Promise<CartLine[]> {
  const order = await api<{
    status: string;
    purchase_units?: { items?: { sku?: string; quantity: string }[] }[];
  }>("GET", `/v2/checkout/orders/${encodeURIComponent(orderId)}`);
  if (order.status !== "COMPLETED") throw new PayPalError("Refills can only be set up for a completed order.");
  const items = order.purchase_units?.[0]?.items ?? [];
  if (!items.length) throw new PayPalError("That order has no items.");
  return items.map((i) => ({ productId: String(i.sku), quantity: Number(i.quantity) }));
}

/** Create (or reuse) a billing plan that refills a completed order every N weeks. */
export async function createRefillPlan(orderId: string, intervalWeeks: number): Promise<RefillPlan> {
  const weeks = Math.max(4, Math.min(16, Math.round(intervalWeeks)));
  const key = `${orderId}:${weeks}`;
  const cached = plans.get(key);
  if (cached) return cached;
  const created = await planForLines(await paidOrderLines(orderId), weeks);
  plans.set(key, created);
  return created;
}

/** A billing plan for an exact set of catalog lines (used for the original refill and for swaps). */
export async function planForLines(lines: CartLine[], weeks: number): Promise<RefillPlan> {
  const key = `lines:${lines.map((l) => `${l.productId}x${l.quantity}`).join(",")}:${weeks}`;
  const cached = plans.get(key);
  if (cached) return cached;
  const { items, total } = priceCart(lines);
  const plan = await api<{ id: string }>("POST", "/v1/billing/plans", {
    product_id: await refillProduct(),
    name: `ShelfCheck refill every ${weeks} weeks`,
    description: items
      .map((i) => `${i.product.brand} ${i.product.name}`)
      .join(", ")
      .slice(0, 127),
    status: "ACTIVE",
    billing_cycles: [
      {
        frequency: { interval_unit: "WEEK", interval_count: weeks },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: total.toFixed(2), currency_code: "USD" } },
      },
    ],
    payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 },
  });
  const created = { planId: plan.id, intervalWeeks: weeks, price: total };
  plans.set(key, created);
  return created;
}

export interface SubscriptionStatus {
  id: string;
  status: string;
  planId?: string;
  nextBilling?: string;
}

/** Verify a subscription the shopper approved in PayPal. */
export async function getSubscription(id: string): Promise<SubscriptionStatus> {
  const s = await api<{ id: string; status: string; plan_id?: string; billing_info?: { next_billing_time?: string } }>(
    "GET",
    `/v1/billing/subscriptions/${encodeURIComponent(id)}`,
  );
  return { id: s.id, status: s.status, planId: s.plan_id, nextBilling: s.billing_info?.next_billing_time };
}

/**
 * Move an active subscription to a new plan (the agent's swapped routine). Because the price
 * changes, PayPal requires the subscriber to approve the revision: we return that approval link.
 */
export async function reviseSubscription(id: string, planId: string, returnUrl: string): Promise<{ approveUrl: string }> {
  const res = await api<{ links?: { href: string; rel: string }[] }>(
    "POST",
    `/v1/billing/subscriptions/${encodeURIComponent(id)}/revise`,
    {
      plan_id: planId,
      application_context: {
        brand_name: "ShelfCheck",
        user_action: "CONTINUE",
        return_url: returnUrl,
        cancel_url: returnUrl,
      },
    },
  );
  const approveUrl = res.links?.find((l) => l.rel === "approve")?.href;
  if (!approveUrl) throw new PayPalError("PayPal didn't return an approval link for the change.");
  return { approveUrl };
}
