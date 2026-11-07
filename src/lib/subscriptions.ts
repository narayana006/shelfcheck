// PayPal Subscriptions for routine auto-refill, via the REST API (sandbox).
// https://developer.paypal.com/docs/api/subscriptions/v1/ and /docs/api/catalog-products/v1/

import { PayPalError, priceCart, type CartLine } from "./paypal";

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

/** Create a billing plan that refills this exact cart every N weeks. */
export async function createRefillPlan(lines: CartLine[], intervalWeeks: number): Promise<RefillPlan> {
  const weeks = Math.max(4, Math.min(16, Math.round(intervalWeeks)));
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
  return { planId: plan.id, intervalWeeks: weeks, price: total };
}

export interface SubscriptionStatus {
  id: string;
  status: string;
  nextBilling?: string;
}

/** Verify a subscription the shopper approved in PayPal. */
export async function getSubscription(id: string): Promise<SubscriptionStatus> {
  const s = await api<{ id: string; status: string; billing_info?: { next_billing_time?: string } }>(
    "GET",
    `/v1/billing/subscriptions/${encodeURIComponent(id)}`,
  );
  return { id: s.id, status: s.status, nextBilling: s.billing_info?.next_billing_time };
}

/** Typical weeks a full-size product lasts with daily use, by category. */
export const TYPICAL_WEEKS: Record<string, number> = { cleanser: 10, serum: 6, moisturizer: 8, sunscreen: 6 };
