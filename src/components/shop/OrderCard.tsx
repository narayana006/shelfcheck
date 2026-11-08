"use client";

import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import { ArrowRight, BadgeCheck, CalendarClock, ChevronDown, RefreshCw, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { updateOrder, type SavedOrder } from "@/lib/client";
import type { RecheckEvent, RecheckResult } from "@/lib/recheck";
import { sampleScores, type ConcernScore, type SkinScan } from "@/lib/skin";
import { postStream } from "@/lib/stream";
import { Button, CardTitle, ErrorNote, Eyebrow, Spinner, shortDate } from "../ui";
import { ProductImage } from "./CartPanel";
import { Trace } from "./Trace";

/** PayPal subscription statuses, in words people use. */
const SUBSCRIPTION_STATUS: Record<string, string> = {
  ACTIVE: "Active",
  APPROVAL_PENDING: "Waiting for approval",
  APPROVED: "Approved",
  SUSPENDED: "Paused",
  CANCELLED: "Cancelled",
  EXPIRED: "Ended",
};

function statusLabel(status: string): string {
  return SUBSCRIPTION_STATUS[status] ?? status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
}

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
          <PayPalScriptProvider options={{ clientId, vault: true, intent: "subscription", components: "buttons", dataNamespace: "paypal_refill" }}>
            <PayPalButtons
              style={{ layout: "vertical", shape: "pill", label: "subscribe", height: 48 }}
              createSubscription={(_data, actions) =>
                // Today's order already paid for this routine: the first refill bills one interval from now.
                actions.subscription.create({
                  plan_id: planId,
                  custom_id: order.orderId,
                  start_time: new Date(Date.now() + intervalWeeks * 7 * 24 * 3600 * 1000).toISOString(),
                  // The SDK handles the return; the URLs are required by the type only.
                  application_context: { brand_name: "ShelfCheck", user_action: "SUBSCRIBE_NOW", return_url: window.location.href, cancel_url: window.location.href },
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

  async function run(scores: ConcernScore[], scanId?: string, preface: string[] = []) {
    setRunning(true);
    setSteps(preface);
    setResult(null);
    setError(null);
    setUsedScores(scores);
    try {
      await postStream<RecheckEvent>(
        "/api/routine/recheck",
        {
          lines: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          scores,
          excludeIds,
          subscriptionId: sub.id,
          subscriptionToken: sub.token,
        },
        (e) => {
          if (e.type === "step") setSteps((s) => [...s, e.text]);
          else if (e.type === "result") setResult(e.result);
          else setError(e.message);
        },
      );
      if (scanId) onChange(updateOrder(order.orderId, (o) => ({ ...o, checkedScanId: scanId })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check failed.");
    } finally {
      setRunning(false);
    }
  }

  // Pre-bill check, started by the app, not the shopper: when PayPal says the refill bills within
  // a week and there's a skin scan the agent hasn't checked yet, the agent re-checks on its own.
  const [laterScan, setLaterScan] = useState<{ id: string; scores: ConcernScore[] } | null>(null);
  const [nextBill, setNextBill] = useState<{ days: number; date: string; price: number | null } | null>(null);
  const newest = laterScan ?? (new Date(scan.takenAt) > new Date(order.paidAt) ? { id: scan.id, scores: scan.scores } : null);
  useEffect(() => {
    if (!sub.token || running || result) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/paypal/refill-status?subscription=${encodeURIComponent(sub.id)}`, {
        headers: { "x-subscription-token": sub.token! },
      }).catch(() => null);
      const s = res?.ok ? ((await res.json()) as { status: string; nextBilling: string | null; pricePerRefill: number | null }) : null;
      if (cancelled || !s?.nextBilling || s.status !== "ACTIVE") return;
      // The 6-week demo jump moves "today" forward to two days before PayPal's next bill.
      const now = laterScan ? new Date(s.nextBilling).getTime() - 2 * 86400000 : Date.now();
      const days = Math.max(0, Math.ceil((new Date(s.nextBilling).getTime() - now) / 86400000));
      const date = new Date(s.nextBilling).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      setNextBill({ days, date, price: s.pricePerRefill });
      if (days <= 7 && newest && newest.id !== order.checkedScanId) {
        run(newest.scores, newest.id, [
          `PayPal says your refill bills in ${days} day${days === 1 ? "" : "s"} (${date}). Re-checking it against your newest scan, automatically`,
        ]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub.id, sub.token, laterScan?.id, scan.id]);

  // A refund on a refilled routine immediately asks the agent to replace that product.
  useEffect(() => {
    if (autoStart) run(scan.scores);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  async function revise() {
    if (!result) return;
    setError(null);
    // Open the PayPal window inside the click, before any await, so Safari and other popup blockers allow it.
    const win = window.open("", "shelfcheck_paypal", "popup,width=520,height=760");
    try {
      const body = await postJson<{ approveUrl: string; planId: string }>("/api/routine/revise", {
        subscriptionId: sub.id,
        token: sub.token,
        intervalWeeks: sub.intervalWeeks,
        excludeIds,
        lines: result.lines,
        scores: usedScores,
        popup: Boolean(win && !win.closed),
      });
      onChange(
        updateOrder(order.orderId, (o) => ({
          ...o,
          pendingRevision: { planId: body.planId, lines: result.lines, swaps: result.swaps.map((s) => ({ fromId: s.fromId, toItem: s.toItem })) },
        })),
      );
      if (win && !win.closed) win.location.href = body.approveUrl;
      else window.location.href = body.approveUrl;
    } catch (e) {
      win?.close();
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
            <Button variant="secondary" onClick={() => setLaterScan({ id: `later-${Date.now()}`, scores: sampleScores("later") })}>
              Simulate a re-scan 6 weeks later
            </Button>
          )}
        </div>
      )}
      {!running && !result && nextBill && (
        <p className="text-[14px] text-muted">
          {laterScan ? "6 weeks later: new skin scan saved. " : ""}Next refill {nextBill.date}
          {nextBill.price !== null ? ` · $${nextBill.price.toFixed(2)}` : ""}, read from PayPal. In the week before it bills, ShelfCheck
          re-checks your routine against your newest scan on its own.
        </p>
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
  const [revised, setRevised] = useState<{ total: number; nextBilling?: string } | null>(null);
  const [revisions, setRevisions] = useState(0);
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
      const items = order.items.map((i) => {
        const swap = pending.swaps?.find((sw) => sw.fromId === i.productId);
        return swap ? { ...swap.toItem, quantity: i.quantity } : i;
      });
      setRevised({ total: items.reduce((n, i) => n + i.price * i.quantity, 0), nextBilling: s.nextBilling });
      // Close the finished re-check so the change can't be submitted twice.
      setRevisions((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't verify with PayPal.");
    } finally {
      setVerifying(false);
    }
  }

  // The PayPal window reports back when the shopper approves the change, so this tab confirms on its own.
  const [approvedSignal, setApprovedSignal] = useState(0);
  useEffect(() => {
    const id = order.subscription?.id;
    if (!id) return;
    const onSignal = (data: unknown) => {
      const d = data as { type?: string; id?: string } | null;
      if (d?.type === "shelfcheck:revised" && d.id === id) setApprovedSignal((n) => n + 1);
    };
    const onMessage = (e: MessageEvent) => { if (e.origin === window.location.origin) onSignal(e.data); };
    window.addEventListener("message", onMessage);
    let channel: BroadcastChannel | null = null;
    try { channel = new BroadcastChannel("shelfcheck"); channel.onmessage = (e) => onSignal(e.data); } catch {}
    return () => { window.removeEventListener("message", onMessage); channel?.close(); };
  }, [order.subscription?.id]);
  useEffect(() => {
    if (approvedSignal && order.pendingRevision) verifyRevision();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedSignal]);

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
        <Eyebrow>Order · {shortDate(order.paidAt)}</Eyebrow>
        <CardTitle>Paid ${order.total.toFixed(2)} with PayPal</CardTitle>
        {order.captureId && (
          <p className="mt-2 inline-flex items-center gap-1.5 text-[14px] text-good">
            <BadgeCheck className="h-4 w-4" strokeWidth={2} aria-hidden />
            Server verified the PayPal capture: COMPLETED
          </p>
        )}
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
                Auto-refill every {order.subscription.intervalWeeks} weeks
              </h3>
              <p className="mt-1 text-[15px] text-muted">
                {statusLabel(order.subscription.status)} ·{" "}
                {order.subscription.nextBilling ? `Next refill ${shortDate(order.subscription.nextBilling)}` : "Scheduled"}
              </p>
            </div>
          </div>
          {order.subscription.status === "ACTIVE" && (
            <div className="mt-5">
              {revised && (
                <p className="rise mb-4 flex items-start gap-2 rounded-2xl bg-sage p-4 text-[15px]">
                  <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-good" strokeWidth={2} aria-hidden />
                  <span>
                    <strong>Refill updated in PayPal.</strong> PayPal confirmed the new plan: ${revised.total.toFixed(2)} per refill
                    {revised.nextBilling ? `, next on ${shortDate(revised.nextBilling)}` : ""}.
                  </span>
                </p>
              )}
              <Recheck key={`${recheckAfterRefund}-${revisions}`} order={order} scan={scan} autoStart={recheckAfterRefund > 0 && revisions === 0} onChange={onChange} />
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

      <details className="group -mt-2 text-[13px] text-muted">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center hover:text-foreground [&::-webkit-details-marker]:hidden">
            Payment details
            <ChevronDown className="ml-1 h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt>PayPal order</dt>
          <dd className="min-w-0 break-all select-all font-mono">{order.orderId}</dd>
          {order.captureId && (
            <>
              <dt>Capture</dt>
              <dd className="min-w-0 break-all select-all font-mono">{order.captureId}</dd>
            </>
          )}
          {order.subscription && (
            <>
              <dt>Subscription</dt>
              <dd className="min-w-0 break-all select-all font-mono">{order.subscription.id}</dd>
            </>
          )}
        </dl>
      </details>
    </section>
  );
}
