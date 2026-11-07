"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { ArrowRight, CalendarClock, RefreshCw, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { updateOrder, type SavedOrder } from "@/lib/client";
import type { RecheckEvent, RecheckResult } from "@/lib/recheck";
import { sampleScores, type ConcernScore, type SkinScan } from "@/lib/skin";
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

async function fetchSubscription(order: SavedOrder, id: string) {
  const qs = new URLSearchParams({ subscription: id, order: order.orderId });
  const res = await fetch(`/api/paypal/refill?${qs}`, { headers: { "x-order-token": order.token ?? "" } });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  return body as { id: string; status: string; planId?: string; nextBilling?: string; token: string };
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
      const { planId } = await postJson<{ planId: string }>("/api/paypal/refill", { orderId: order.orderId, token: order.token, intervalWeeks });
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
                  custom_id: order.orderId,
                  start_time: new Date(Date.now() + intervalWeeks * 7 * 24 * 3600 * 1000).toISOString(),
                })
              }
              onApprove={async (data) => {
                try {
                  const s = await fetchSubscription(order, data.subscriptionID ?? "");
                  onActive({ id: s.id, token: s.token, status: s.status, nextBilling: s.nextBilling, planId: s.planId, intervalWeeks });
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Couldn't verify the subscription.");
                }
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

/**
 * Before the next refill ships, the agent re-checks the routine against a new scan, and replaces
 * anything the shopper was refunded for. Approved changes revise the PayPal subscription.
 */
function Recheck({
  order,
  scan,
  autoStart,
  onChange,
}: {
  order: SavedOrder;
  scan: SkinScan;
  autoStart: boolean;
  onChange: (orders: SavedOrder[]) => void;
}) {
  const [steps, setSteps] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RecheckResult | null>(null);
  const [usedScores, setUsedScores] = useState<ConcernScore[]>(scan.scores);
  const [error, setError] = useState<string | null>(null);
  const sub = order.subscription!;
  const excludeIds = Object.keys(order.refunded);

  async function run(scores: ConcernScore[]) {
    setRunning(true);
    setSteps([]);
    setResult(null);
    setError(null);
    setUsedScores(scores);
    try {
      await postStream<RecheckEvent>(
        "/api/routine/recheck",
        { lines: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })), scores, excludeIds },
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

  // A refund on a refilled routine immediately asks the agent to replace that product.
  useEffect(() => {
    if (autoStart) run(scan.scores);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  async function revise() {
    if (!result) return;
    setError(null);
    try {
      const body = await postJson<{ approveUrl: string; planId: string }>("/api/routine/revise", {
        subscriptionId: sub.id,
        token: sub.token,
        intervalWeeks: sub.intervalWeeks,
        excludeIds,
        lines: result.lines,
        scores: usedScores,
      });
      onChange(
        updateOrder(order.orderId, (o) => ({
          ...o,
          pendingRevision: { planId: body.planId, lines: result.lines, swaps: result.swaps.map((s) => ({ fromId: s.fromId, toItem: s.toItem })) },
        })),
      );
      window.open(body.approveUrl, "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the refill.");
    }
  }

  return (
    <div className="grid gap-4">
      {!running && !result && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" onClick={() => run(scan.scores)}>
            <RefreshCw className="h-4 w-4" strokeWidth={2} aria-hidden /> Re-check my refill
          </Button>
          {scan.sample && (
            <Button variant="secondary" onClick={() => run(sampleScores("later"))}>
              Simulate a re-scan 6 weeks later
            </Button>
          )}
        </div>
      )}
      {(running || steps.length > 0) && (
        <Trace steps={steps} running={running} title="Before your next refill" runningLabel="Re-checking your routine…" />
      )}
      {result && (
        <div className="rise rounded-3xl bg-lavender p-5 sm:p-6">
          <h3 className="text-[19px] font-semibold">
            {result.swaps.length ? `${result.swaps.length} change${result.swaps.length > 1 ? "s" : ""} to your next refill` : "Your routine still fits"}
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
              {order.pendingRevision ? (
                <p className="mt-4 text-[15px] text-muted">Approve the change in the PayPal window, then confirm below.</p>
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
  const [recheckAfterRefund, setRecheckAfterRefund] = useState(0);

  async function refund(productId: string) {
    setRefunding(productId);
    setError(null);
    try {
      const r = await postJson<{ amount: string }>("/api/paypal/refund", {
        orderId: order.orderId,
        token: order.token,
        productId,
        reason: "skin reaction",
      });
      onChange(updateOrder(order.orderId, (o) => ({ ...o, refunded: { ...o.refunded, [productId]: r.amount } })));
      if (order.subscription?.status === "ACTIVE") setRecheckAfterRefund((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refund failed.");
    } finally {
      setRefunding(null);
    }
  }

  /** Confirm PayPal moved the subscription to the new plan, then update the saved routine. */
  async function verifyRevision() {
    if (!order.subscription || !order.pendingRevision) return;
    setVerifying(true);
    setError(null);
    try {
      const s = await fetchSubscription(order, order.subscription.id);
      const pending = order.pendingRevision;
      if (s.planId !== pending.planId) {
        setError("PayPal hasn't switched the refill yet. Approve the change in the PayPal window and try again.");
        return;
      }
      onChange(
        updateOrder(order.orderId, (o) => ({
          ...o,
          items: o.items.map((i) => {
            const swap = pending.swaps?.find((sw) => sw.fromId === i.productId);
            return swap ? { ...swap.toItem, quantity: i.quantity } : i;
          }),
          subscription: { ...o.subscription!, status: s.status, nextBilling: s.nextBilling, planId: s.planId },
          pendingRevision: undefined,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't verify with PayPal.");
    } finally {
      setVerifying(false);
    }
  }

  // Coming back from PayPal's approval page (?revised=<subscription id>) confirms automatically.
  useEffect(() => {
    const revised = new URLSearchParams(window.location.search).get("revised");
    if (revised && revised === order.subscription?.id && order.pendingRevision) {
      verifyRevision();
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section className="rise grid gap-5 rounded-[28px] bg-surface p-6 sm:p-8">
      <div>
        <Eyebrow>
          Order {order.orderId} · {new Date(order.paidAt).toLocaleDateString()}
        </Eyebrow>
        <CardTitle>Paid ${order.total.toFixed(2)} with PayPal</CardTitle>
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
              ) : order.token ? (
                <button
                  onClick={() => refund(i.productId)}
                  disabled={refunding !== null}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-brand hover:bg-brand-soft disabled:opacity-40"
                >
                  <Undo2 className="h-4 w-4" aria-hidden />
                  {refunding === i.productId ? "Refunding…" : "Reacted? Refund"}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="-mt-2 text-[13px] text-muted">
        Reaction guarantee: if a product disagrees with your skin within 30 days, refund that item here through PayPal. If it&apos;s
        on auto-refill, the shopper replaces it before your next refill.
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
              <Recheck key={recheckAfterRefund} order={order} scan={scan} autoStart={recheckAfterRefund > 0} onChange={onChange} />
            </div>
          )}
          {order.pendingRevision && (
            <Button onClick={verifyRevision} disabled={verifying} className="mt-4 w-full">
              {verifying ? "Checking with PayPal…" : "I approved the change in PayPal"}
            </Button>
          )}
          {verifying && <div className="mt-3"><Spinner label="Checking with PayPal…" /></div>}
        </div>
      ) : proposal && clientId && order.token ? (
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
