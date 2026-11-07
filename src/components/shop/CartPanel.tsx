"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { ShieldX } from "lucide-react";
import { useState } from "react";
import type { CaptureResult } from "@/lib/paypal";
import type { Cart } from "@/lib/shopper";
import { CardTitle, ErrorNote, Eyebrow, VerdictPill } from "../ui";

function ProductImage({ src, size = 88 }: { src?: string; size?: number }) {
  return (
    <div className="shrink-0 overflow-hidden rounded-3xl bg-raised p-2" style={{ width: size, height: size }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={size - 16} height={size - 16} loading="lazy" decoding="async" className="block h-full w-full object-contain" />
      ) : null}
    </div>
  );
}

export { ProductImage };

export function CartPanel({ cart, clientId, onPaid }: { cart: Cart; clientId: string | null; onPaid: (r: CaptureResult) => void }) {
  const [payError, setPayError] = useState<string | null>(null);
  const pct = cart.budget ? Math.min(100, (cart.total / cart.budget) * 100) : null;

  return (
    <div className="grid gap-4">
      <section className="rise rounded-[28px] bg-surface p-6 sm:p-8">
        <Eyebrow>Your skin-matched cart</Eyebrow>
        <CardTitle>{cart.items.length} products, chosen for your scan</CardTitle>
        <p className="mt-3 text-[17px] leading-snug text-muted text-pretty">{cart.summary}</p>

        <ul className="mt-6 grid gap-3">
          {cart.items.map((i) => (
            <li key={i.productId} className="flex gap-4 rounded-3xl bg-background/60 p-3 sm:p-4">
              <ProductImage src={i.image} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{i.category}</p>
                    <p className="text-[17px] font-semibold leading-snug">
                      {i.brand} {i.name}
                    </p>
                  </div>
                  <p className="text-[17px] font-semibold tabular-nums">${(i.price * i.quantity).toFixed(2)}</p>
                </div>
                <p className="mt-1 text-[15px] leading-snug text-muted">{i.why}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <VerdictPill verdict={i.verdict} />
                  {i.allergens.length > 0 && <span className="text-xs text-fair">{i.allergens.length} EU fragrance allergen(s)</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 border-t border-line pt-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[15px] text-muted">Total</p>
              {cart.budget !== null && (
                <p className="text-[13px] text-muted">
                  ${(cart.budget - cart.total).toFixed(2)} under your ${cart.budget.toFixed(2)} budget
                </p>
              )}
            </div>
            <p className="text-[40px] font-semibold leading-none tabular-nums tracking-tight">${cart.total.toFixed(2)}</p>
          </div>
          {pct !== null && (
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]" role="img" aria-label={`${Math.round(pct)}% of budget`}>
              <div className="h-full rounded-full bg-brand-fill transition-[width] duration-700" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      </section>

      {cart.rejected.length > 0 && (
        <section className="rise rounded-[28px] bg-blush p-6 sm:p-8">
          <Eyebrow>Considered and ruled out</Eyebrow>
          <CardTitle>{cart.rejected.length} products didn&apos;t pass your skin check</CardTitle>
          <ul className="mt-4 grid gap-2.5">
            {cart.rejected.map((r) => (
              <li key={r.name} className="flex items-start gap-3 text-[15px]">
                <ShieldX className="mt-0.5 h-4 w-4 shrink-0 text-focus" strokeWidth={2} aria-hidden />
                <span>
                  {r.name}
                  <span className="text-muted"> · {r.reason}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] text-muted">
            These checks are code, not the AI&apos;s opinion. Checkout refuses any product that aggravates a weak spot, and any cart
            over your budget.
          </p>
        </section>
      )}

      <section className="rise rounded-[28px] bg-surface p-6 sm:p-8">
        <Eyebrow>Approve & pay</Eyebrow>
        <CardTitle>Nothing is charged until you say yes</CardTitle>
        <p className="mt-2 text-[15px] text-muted">
          The shopper created PayPal order <span className="font-mono text-[13px]">{cart.orderId}</span>.
        </p>
        <div className="mt-5">
          {clientId ? (
            <PayPalScriptProvider options={{ clientId, currency: "USD", intent: "capture" }}>
              <PayPalButtons
                style={{ layout: "vertical", shape: "pill", label: "pay", height: 48 }}
                createOrder={async () => cart.orderId}
                onApprove={async (data) => {
                  const res = await fetch("/api/paypal/capture", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ orderId: data.orderID }),
                  });
                  const body = await res.json();
                  if (!res.ok) setPayError(body.error);
                  else onPaid(body);
                }}
                onError={() => setPayError("PayPal hit a problem. Please try again.")}
              />
            </PayPalScriptProvider>
          ) : (
            <ErrorNote>PayPal isn&apos;t configured on this server yet.</ErrorNote>
          )}
        </div>
        {payError && <div className="mt-3"><ErrorNote>{payError}</ErrorNote></div>}
        <p className="mt-3 text-[13px] text-muted">PayPal sandbox: demo store, illustrative prices, test money only.</p>
      </section>
    </div>
  );
}
