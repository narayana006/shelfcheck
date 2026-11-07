"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useEffect, useState } from "react";
import type { CaptureResult } from "@/lib/paypal";
import type { Cart, ShopEvent } from "@/lib/shopper";
import type { SkinScan } from "@/lib/skin";
import { Button, Card, ErrorNote, Eyebrow, Spinner, VerdictPill } from "./ui";

const IDEAS = ["Build me a full routine under $60", "Something for my focus areas, under $30", "Just the best sunscreen for my skin"];

function CartView({ cart, clientId, onPaid }: { cart: Cart; clientId: string | null; onPaid: (r: CaptureResult) => void }) {
  const [payError, setPayError] = useState<string | null>(null);
  return (
    <div className="grid gap-4">
      <Card>
        <Eyebrow>Your skin-matched cart</Eyebrow>
        <p className="mt-2 text-sm leading-relaxed">{cart.summary}</p>
        <ul className="mt-4 divide-y divide-line">
          {cart.items.map((i) => (
            <li key={i.productId} className="flex gap-3 py-3">
              {i.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.image} alt="" className="h-14 w-14 shrink-0 rounded-xl border border-line bg-white object-contain" />
              ) : (
                <div className="h-14 w-14 shrink-0 rounded-xl bg-line" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wider text-muted">{i.category}</div>
                    <div className="truncate text-sm font-semibold">
                      {i.brand} {i.name}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tabular-nums">${(i.price * i.quantity).toFixed(2)}</div>
                </div>
                <p className="mt-1 text-xs text-muted">{i.why}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <VerdictPill verdict={i.verdict} />
                  {i.allergens.length > 0 && <span className="text-xs text-fair">{i.allergens.length} EU fragrance allergen(s)</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-sm text-muted">Total</span>
          <span className="font-display text-3xl tabular-nums">${cart.total.toFixed(2)}</span>
        </div>
      </Card>

      <Card>
        <Eyebrow>Approve & pay</Eyebrow>
        <p className="mt-2 text-xs text-muted">
          The agent created PayPal order <span className="font-mono">{cart.orderId}</span>. Nothing is charged until you approve it.
        </p>
        <div className="mt-4">
          {clientId ? (
            <PayPalScriptProvider options={{ clientId, currency: "USD", intent: "capture" }}>
              <PayPalButtons
                style={{ layout: "vertical", shape: "pill", label: "pay" }}
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
        <p className="mt-3 text-xs text-muted">PayPal sandbox: demo store, illustrative prices, test money only.</p>
      </Card>
    </div>
  );
}

export function ShopView({ scan, goScan }: { scan: SkinScan | null; goScan: () => void }) {
  const [request, setRequest] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [paid, setPaid] = useState<CaptureResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/paypal/config")
      .then((r) => r.json())
      .then((b) => setClientId(b.clientId))
      .catch(() => {});
  }, []);

  if (!scan) {
    return (
      <Card className="mt-6">
        <Eyebrow>Shop for your skin</Eyebrow>
        <p className="mt-2 text-sm text-muted">The shopper picks products for your measured skin, so start with a quick scan.</p>
        <Button onClick={goScan} className="mt-4 w-full">
          Scan my skin first
        </Button>
      </Card>
    );
  }

  async function run(text: string) {
    setRequest(text);
    setRunning(true);
    setSteps([]);
    setCart(null);
    setPaid(null);
    setError(null);
    try {
      const res = await fetch("/api/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: text, scores: scan!.scores }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "The shopper is unavailable.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as ShopEvent;
          if (e.type === "step") setSteps((s) => [...s, e.text]);
          else if (e.type === "cart") setCart(e.cart);
          else if (e.type === "error") setError(e.message);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setRunning(false);
    }
  }

  if (paid) {
    return (
      <div className="grid gap-5 pt-4">
        <h1 className="font-display text-4xl leading-tight">Paid. Your routine is on its way.</h1>
        <Card>
          <Eyebrow>PayPal receipt</Eyebrow>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted">Status</dt>
            <dd className="font-semibold text-good">{paid.status}</dd>
            <dt className="text-muted">Amount</dt>
            <dd className="tabular-nums">{paid.amount}</dd>
            <dt className="text-muted">Order</dt>
            <dd className="font-mono text-xs">{paid.orderId}</dd>
            {paid.captureId && (
              <>
                <dt className="text-muted">Capture</dt>
                <dd className="font-mono text-xs">{paid.captureId}</dd>
              </>
            )}
          </dl>
        </Card>
        <Button variant="secondary" onClick={() => setPaid(null)}>
          Back to my cart
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="pt-4">
        <h1 className="font-display text-4xl leading-tight">Your skin-aware shopper</h1>
        <p className="mt-2 text-sm text-muted">
          Tell it what you need. It checks every ingredient list against your scan, builds the cart and sets up PayPal checkout. You
          approve the payment.
        </p>
      </div>

      {!running && (
        <Card>
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            rows={2}
            placeholder="e.g. A gentle routine for redness, under $50"
            className="w-full resize-none bg-transparent text-sm outline-none"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {IDEAS.map((i) => (
              <button key={i} onClick={() => run(i)} className="rounded-full border border-line px-3 py-1.5 text-xs hover:border-brand">
                {i}
              </button>
            ))}
          </div>
          <Button onClick={() => run(request)} disabled={request.trim().length < 3} className="mt-4 w-full">
            Shop for me
          </Button>
        </Card>
      )}

      {(running || steps.length > 0) && !cart && (
        <Card>
          <ul className="grid gap-2 text-sm">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className={i === steps.length - 1 && running ? "animate-pulse text-brand" : "text-good"}>●</span>
                {s}
              </li>
            ))}
          </ul>
          {running && <div className="mt-3"><Spinner label="Shopping…" /></div>}
        </Card>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
      {cart && <CartView cart={cart} clientId={clientId} onPaid={setPaid} />}
    </div>
  );
}
