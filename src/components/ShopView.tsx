"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { useEffect, useState } from "react";
import type { CaptureResult } from "@/lib/paypal";
import type { Cart, ShopEvent } from "@/lib/shopper";
import { CONCERNS, priorities, type SkinScan } from "@/lib/skin";
import { Button, Card, ErrorNote, Eyebrow, Spinner, VerdictPill } from "./ui";

const IDEAS = ["Build me a full routine under $60", "Something for my focus areas, under $30", "Just the best sunscreen for my skin"];

function CartView({ cart, clientId, onPaid }: { cart: Cart; clientId: string | null; onPaid: (r: CaptureResult) => void }) {
  const [payError, setPayError] = useState<string | null>(null);
  return (
    <div className="grid gap-4">
      <Card>
        <Eyebrow>Your skin-matched cart</Eyebrow>
        <p className="mt-2 text-sm leading-relaxed">{cart.summary}</p>
        <ul className="mt-4 divide-y divide-line/50">
          {cart.items.map((i) => (
            <li key={i.productId} className="flex gap-3 py-3">
              {i.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.image} alt="" className="h-14 w-14 shrink-0 rounded-2xl bg-white object-contain" />
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
          <span className="text-sm text-muted">
            Total
            {cart.budget !== null && <> · ${cart.total.toFixed(2)} of your ${cart.budget.toFixed(2)} budget</>}
          </span>
          <span className="text-3xl font-semibold tabular-nums tracking-tight">${cart.total.toFixed(2)}</span>
        </div>
      </Card>

      {cart.rejected.length > 0 && (
        <Card>
          <Eyebrow>Considered and ruled out · {cart.rejected.length}</Eyebrow>
          <ul className="mt-3 grid gap-2 text-sm">
            {cart.rejected.map((r) => (
              <li key={r.name} className="flex items-start gap-2">
                <span className="text-focus">✕</span>
                <span>
                  {r.name}
                  <span className="text-muted"> — {r.reason}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            These checks are code, not the AI&apos;s opinion: the checkout refuses any product that aggravates a weak spot or
            breaks your budget.
          </p>
        </Card>
      )}

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

/** After payment: opt into the agent's proposed refill cadence with PayPal Subscriptions. */
function RefillCard({ cart, clientId }: { cart: Cart; clientId: string | null }) {
  const [planId, setPlanId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<{ id: string; status: string; nextBilling?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!cart.refill || !clientId) return null;
  const { intervalWeeks, reason } = cart.refill;

  async function preparePlan() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/paypal/refill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: cart.orderId, intervalWeeks }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setPlanId(body.planId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't set up the refill.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Eyebrow>Never run out</Eyebrow>
      <p className="mt-2 text-2xl font-semibold leading-tight tracking-tight">Refill this routine every {intervalWeeks} weeks</p>
      <p className="mt-2 text-sm text-muted">{reason}</p>
      <p className="mt-1 text-sm">
        ${cart.total.toFixed(2)} every {intervalWeeks} weeks · cancel anytime in PayPal
      </p>
      <div className="mt-4">
        {active ? (
          <p className="rounded-2xl bg-good-soft p-3 text-sm text-good">
            Auto-refill is <strong>{active.status.toLowerCase()}</strong>
            {active.nextBilling && <> · next refill {new Date(active.nextBilling).toLocaleDateString()}</>}
            <span className="mt-1 block font-mono text-xs">{active.id}</span>
          </p>
        ) : planId ? (
          <PayPalScriptProvider
            key="subscription"
            options={{ clientId, vault: true, intent: "subscription", components: "buttons" }}
          >
            <PayPalButtons
              style={{ layout: "vertical", shape: "pill", label: "subscribe" }}
              createSubscription={(_data, actions) => actions.subscription.create({ plan_id: planId })}
              onApprove={async (data) => {
                const res = await fetch(`/api/paypal/refill?subscription=${encodeURIComponent(data.subscriptionID ?? "")}`);
                const body = await res.json();
                if (!res.ok) setError(body.error);
                else setActive(body);
              }}
              onError={() => setError("PayPal hit a problem setting up the subscription.")}
            />
          </PayPalScriptProvider>
        ) : (
          <Button variant="secondary" onClick={preparePlan} disabled={busy} className="w-full">
            {busy ? "Setting up…" : "Set up auto-refill with PayPal"}
          </Button>
        )}
      </div>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </Card>
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
        <h1 className="text-4xl font-semibold leading-tight tracking-[-0.025em] sm:text-5xl">Paid. Your routine is on its way.</h1>
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
        {cart && <RefillCard cart={cart} clientId={clientId} />}
        <Button variant="secondary" onClick={() => setPaid(null)}>
          Back to my cart
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <div className="pt-4">
        <h1 className="text-4xl font-semibold leading-tight tracking-[-0.025em] sm:text-5xl">
          What should we get
          <br />
          <span className="text-gradient">for your skin?</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          Tell the shopper what you need. It reads every ingredient list against your scan, keeps to your budget and sets up
          PayPal checkout. You approve the payment.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted">Shopping for</span>
          {priorities(scan, 3).map((c) => (
            <span key={c.concern} className="rounded-full bg-surface px-3 py-1 font-medium">
              {CONCERNS[c.concern]} <span className="text-muted">{c.score}</span>
            </span>
          ))}
        </div>
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
              <button key={i} onClick={() => run(i)} className="rounded-full bg-raised px-4 py-2 text-[13px] shadow-sm ring-1 ring-line/40 transition hover:ring-brand">
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
