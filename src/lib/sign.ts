import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proof that the caller is the browser that paid for an order (or approved a subscription).
 * The server issues it at capture/approval time; refunds and refill changes require it.
 */
function secret() {
  const s = process.env.SHELFCHECK_SIGNING_SECRET;
  if (!s) throw new Error("The server is missing SHELFCHECK_SIGNING_SECRET.");
  return s;
}

export function signingReady() {
  return Boolean(process.env.SHELFCHECK_SIGNING_SECRET);
}

export function sign(kind: "order" | "subscription", id: string) {
  return createHmac("sha256", secret()).update(`${kind}:${id}`).digest("base64url");
}

export function verify(kind: "order" | "subscription", id: string, token: string | undefined) {
  if (!token) return false;
  const expected = Buffer.from(sign(kind, id));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
