"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { ArrowRight, CalendarClock, RefreshCw, Undo2 } from "lucide-react";
import { useState } from "react";
import { updateOrder, type SavedOrder } from "@/lib/client";
import type { RecheckEvent, RecheckResult } from "@/lib/recheck";
import type { SkinScan } from "@/lib/skin";
import { postStream } from "@/lib/stream";
import { Button, CardTitle, ErrorNote, Eyebrow, Spinner } from "../ui";
import { ProductImage } from "./CartPanel";
import { Trace } from "./Trace";

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json as T;
}

/** Opt into the agent's proposed refill cadence with PayPal Subscriptions. */
function RefillSetup({
  order,
  proposal,
  clientId,
  onActive,
}: {
  order: SavedOrder;
  proposal: { intervalWeeks: number; reason: string };
  clientId: string;
  onActive: (s: NonNullable<SavedOrder["subscription"]>) => void;
}) {
  const [planId, setPlanId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { intervalWeeks, reason } = proposal;

  async function preparePlan() {
    setBusy(true);
    setError(null);
    try {
      const { planId } = await postJson<{ planId: string }>("/api/paypal/refill", { orderId: order.orderId, intervalWeeks });
      setPlanId(planId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't set up the refill.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl bg-sage p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <CalendarClock className="mt-1 h-6 w-6 shrink-0 text-good" strokeWidth={1.75} aria-hidden />
        <div>
          <h3 className="text-[19px] font-semibold leading-snug">Refill this routine every {intervalWeeks} weeks</h3>
          <p className="mt-1 text-[15px] text-muted">{reason}</p>
          <p className="mt-1 text-[15px]">
            ${order.total.toFixed(2)} every {intervalWeeks} weeks, starting at your first refill. Cancel anytime in PayPal.
          </p>
        </div>
      </div>
      <div className="mt-5">
        {planId ? (
          <PayPalScriptProvider options={{ clientId, vault: true, intent: "subscription", components: "buttons" }}>
            <PayPalButtons
              style={{ layout: "vertical", shape: "pill", label: "subscribe", height: 48 }}
              createSubscription={(_data, actions) =>
                // Today's order already paid for this routine: the first refill bills one interval from now.
                actions.subscription.create({
                  plan_id: planId,
                  start_time: new Date(Date.now() + intervalWeeks * 7 * 24 * 3600 * 1000).toISOString(),
                })
              }
              onApprove={async (data) => {
                const res = await fetch(`/api/paypal/refill?subscription=${encodeURIComponent(data.subscriptionID ?? "")}`);
                const body = await res.json();
                if (!res.ok) setError(body.error);
                else onActive({ id: body.id, status: body.status, nextBilling: body.nextBilling, intervalWeeks });
              }}
              onError={() => setError("PayPal hit a problem setting up the refill.")}
            />
          </PayPalScriptProvider>
        ) : (
          <Button variant="secondary" onClick={preparePlan} disabled={busy} className="w-full">
            {busy ? "Setting up…" : "Set up auto-refill with PayPal"}
          </Button>
        )}
      </div>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </div>
  );
}

/** Before the next refill ships, the agent re-checks the routine against the newest scan. */
function Recheck({ order, scan, onRevised }: { order: SavedOrder; scan: SkinScan; onRevised: () => void }) {
  const [steps, setSteps] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RecheckResult | null>(null);
  const [approveUrl, setApproveUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sub = order.subscription!;

  async function run() {
    setRunning(true);
    setSteps([]);
    setResult(null);
    setApproveUrl(null);
    setError(null);
    try {
      await postStream<RecheckEvent>(
        "/api/routine/recheck",
        { lines: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })), scores: scan.scores },
        (e) => {
          if (e.type === "step") setSteps((s) => [...s, e.text]);
          else if (e.type === "result") setResult(e.result);
          else setError(e.message);
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check failed.");
    } finally {
      setRunning(false);
    }
  }

  async function revise() {
    if (!result) return;
    setError(null);
    try {
      const body = await postJson<{ approveUrl: string }>("/api/routine/revise", {
        subscriptionId: sub.id,
        intervalWeeks: sub.intervalWeeks,
        lines: result.lines,
        scores: scan.scores,
      });
      setApproveUrl(body.approveUrl);
      window.open(body.approveUrl, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the refill.");
    }
  }

  return (
    <div className="grid gap-4">
      {!running && !result && (
        <Button variant="secondary" onClick={run} className="w-full">
          <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden /> Re-check my refill against my latest scan
        </Button>
      )}
      {(running || steps.length > 0) && <Trace steps={steps} running={running} title="Before your next refill" />}
      {result && (
        <div className="rise rounded-3xl bg-lavender p-5 sm:p-6">
          <h3 className="text-[19px] font-semibold">
            {result.swaps.length ? `${result.swaps.length} change${result.swaps.length > 1 ? "s" : ""} for your new skin` : "Your routine still fits"}
          </h3>
          <p className="mt-1 text-[15px] text-muted">{result.summary}</p>
          {result.swaps.length > 0 && (
            <>
              <ul className="mt-4 grid gap-3">
                {result.swaps.map((s) => (
                  <li key={s.fromId} className="rounded-2xl bg-raised p-4 text-[15px]">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="text-muted line-through">{s.from}</span>
                      <ArrowRight className="h-4 w-4 text-brand" aria-hidden />
                      <span>{s.to}</span>
                    </p>
                    <p className="mt-1 text-muted">{s.reason}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[15px]">
                Refill price ${result.oldTotal.toFixed(2)} → <strong>${result.newTotal.toFixed(2)}</strong>
              </p>
              {approveUrl ? (
                <div className="mt-4 grid gap-2">
                  <p className="text-[15px] text-muted">Approve the change in the PayPal window, then come back.</p>
                  <a href={approveUrl} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-4 hover:underline">
                    Reopen PayPal approval ›
                  </a>
                  <Button onClick={onRevised} className="mt-2 w-full">
                    I approved it
                  </Button>
                </div>
              ) : (
                <Button onClick={revise} className="mt-4 w-full">
                  Update my refill in PayPal
                </Button>
              )}
            </>
          )}
        </div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
    </div>
  );
}

/** A paid order: reaction-guarantee refunds, refill subscription, and the agent's pre-refill re-check. */
export function OrderCard({
  order,
  proposal,
  scan,
  clientId,
  onChange,
}: {
  order: SavedOrder;
  proposal?: { intervalWeeks: number; reason: string };
  scan: SkinScan;
  clientId: string | null;
  onChange: (orders: SavedOrder[]) => void;
}) {
  const [refunding, setRefunding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  async function refund(productId: string) {
    setRefunding(productId);
    setError(null);
    try {
      const r = await postJson<{ amount: string }>("/api/paypal/refund", { orderId: order.orderId, productId });
      onChange(updateOrder(order.orderId, (o) => ({ ...o, refunded: { ...o.refunded, [productId]: r.amount } })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refund failed.");
    } finally {
      setRefunding(null);
    }
  }

  async function verifyRevision() {
    if (!order.subscription) return;
    setVerifying(true);
    try {
      const res = await fetch(`/api/paypal/refill?subscription=${encodeURIComponent(order.subscription.id)}`);
      const s = await res.json();
      if (!res.ok) throw new Error(s.error);
      onChange(updateOrder(order.orderId, (o) => ({ ...o, subscription: { ...o.subscription!, status: s.status, nextBilling: s.nextBilling } })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't verify with PayPal.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <section className="rise grid gap-5 rounded-[28px] bg-surface p-6 sm:p-8">
      <div>
        <Eyebrow>Order {order.orderId} · {new Date(order.paidAt).toLocaleDateString()}</Eyebrow>
        <CardTitle>
          Paid ${order.total.toFixed(2)} with PayPal
        </CardTitle>
        {order.captureId && <p className="mt-1 font-mono text-[13px] text-muted">Capture {order.captureId}</p>}
      </div>

      <ul className="grid gap-3">
        {order.items.map((i) => {
          const refunded = order.refunded[i.productId];
          return (
            <li key={i.productId} className="flex items-center gap-4 rounded-3xl bg-background/60 p-3">
              <ProductImage src={i.image} size={64} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-snug">
                  {i.brand} {i.name}
                </p>
                <p className="text-[13px] text-muted">${(i.price * i.quantity).toFixed(2)}</p>
              </div>
              {refunded ? (
                <span className="rounded-full bg-good-soft px-3 py-1 text-xs font-semibold text-good">Refunded {refunded}</span>
              ) : (
                <button
                  onClick={() => refund(i.productId)}
                  disabled={refunding !== null}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-brand hover:bg-brand-soft disabled:opacity-40"
                >
                  <Undo2 className="h-4 w-4" aria-hidden />
                  {refunding === i.productId ? "Refunding…" : "Reacted? Refund"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="-mt-2 text-[13px] text-muted">
        Reaction guarantee: if a product disagrees with your skin, refund it here. Opened skincare usually can&apos;t be returned; this
        refunds that item through PayPal.
      </p>

      {order.subscription ? (
        <div className="rounded-3xl bg-sage p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-1 h-6 w-6 shrink-0 text-good" strokeWidth={1.75} aria-hidden />
            <div>
              <h3 className="text-[19px] font-semibold">
                Auto-refill {order.subscription.status.toLowerCase()} · every {order.subscription.intervalWeeks} weeks
              </h3>
              <p className="mt-1 text-[15px] text-muted">
                {order.subscription.nextBilling ? `Next refill ${new Date(order.subscription.nextBilling).toLocaleDateString()}` : "Scheduled"} ·{" "}
                <span className="font-mono text-[13px]">{order.subscription.id}</span>
              </p>
            </div>
          </div>
          {order.subscription.status === "ACTIVE" && (
            <div className="mt-5">
              <Recheck order={order} scan={scan} onRevised={verifyRevision} />
            </div>
          )}
          {verifying && <div className="mt-3"><Spinner label="Checking with PayPal…" /></div>}
        </div>
      ) : proposal && clientId ? (
        <RefillSetup
          order={order}
          proposal={proposal}
          clientId={clientId}
          onActive={(s) => onChange(updateOrder(order.orderId, (o) => ({ ...o, subscription: s })))}
        />
      ) : null}

      {error && <ErrorNote>{error}</ErrorNote>}
    </section>
  );
}
