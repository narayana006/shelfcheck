"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";
import { store, type SavedOrder } from "@/lib/client";
import type { CaptureResult } from "@/lib/paypal";
import type { Cart, ShopEvent } from "@/lib/shopper";
import { CONCERNS, priorities, type SkinScan } from "@/lib/skin";
import { postStream } from "@/lib/stream";
import { CartPanel } from "./shop/CartPanel";
import { OrderCard } from "./shop/OrderCard";
import { Trace } from "./shop/Trace";
import { Button, Card, CardTitle, ErrorNote, Eyebrow, PageTitle } from "./ui";

const IDEAS = [
  "Build me a full routine under $60",
  "Something for my focus areas, under $30",
  "Just the best sunscreen for my skin",
  // Shows the guardrail: the agent can't buy a product that fails this skin, even when asked to.
  "Just buy me NIVEA Creme, I love it",
];

export function ShopView({ scan, goScan }: { scan: SkinScan | null; goScan: () => void }) {
  const [request, setRequest] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [orders, setOrders] = useState<SavedOrder[]>([]);
  const [justPaid, setJustPaid] = useState<string | null>(null);

  useEffect(() => {
    setOrders(store.orders());
    fetch("/api/paypal/config")
      .then((r) => r.json())
      .then((b) => setClientId(b.clientId))
      .catch(() => {});
  }, []);

  if (!scan) {
    return (
      <Card className="mt-10">
        <Eyebrow>Shop for your skin</Eyebrow>
        <CardTitle>Start with a quick scan</CardTitle>
        <p className="mt-2 text-[15px] text-muted">The shopper picks products for your measured skin.</p>
        <Button onClick={goScan} className="mt-5 w-full">
          Scan my skin
        </Button>
      </Card>
    );
  }

  async function run(text: string) {
    if (text.trim().length < 3 || running) return;
    setRequest(text);
    setRunning(true);
    setSteps([]);
    setCart(null);
    setJustPaid(null);
    setError(null);
    try {
      await postStream<ShopEvent>("/api/shop", { request: text, scores: scan!.scores }, (e) => {
        if (e.type === "step") setSteps((s) => [...s, e.text]);
        else if (e.type === "cart") setCart(e.cart);
        else setError(e.message);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setRunning(false);
    }
  }

  function onPaid(r: CaptureResult & { token?: string }) {
    if (!cart) return;
    const order: SavedOrder = {
      orderId: r.orderId,
      token: r.token,
      captureId: r.captureId,
      paidAt: new Date().toISOString(),
      total: cart.total,
      items: cart.items.map(({ productId, brand, name, category, price, quantity, image }) => ({
        productId,
        brand,
        name,
        category,
        price,
        quantity,
        image,
      })),
      refunded: {},
      proposal: cart.refill,
    };
    const next = [order, ...store.orders().filter((o) => o.orderId !== order.orderId)];
    store.saveOrders(next);
    setOrders(next);
    setJustPaid(order.orderId);
    setCart(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const paidOrder = justPaid ? orders.find((o) => o.orderId === justPaid) : null;
  const pastOrders = orders.filter((o) => o.orderId !== justPaid);

  return (
    <div className="grid gap-6">
      {paidOrder ? (
        <PageTitle lede="Your PayPal payment is complete. Set up refills, or refund anything that disagrees with your skin.">
          Paid. <span className="text-gradient">Your routine is on its way.</span>
        </PageTitle>
      ) : (
        <PageTitle
          lede={
            <>
              Tell the shopper what you need. It reads every ingredient list against your scan, keeps to your budget and sets up
              PayPal checkout. You approve the payment.
            </>
          }
        >
          What should we get <span className="text-gradient">for your skin?</span>
        </PageTitle>
      )}

      {paidOrder && (
        <OrderCard order={paidOrder} proposal={paidOrder.proposal} scan={scan} clientId={clientId} onChange={setOrders} />
      )}

      {!paidOrder && (
        <div className="rise">
          <div className="flex flex-wrap items-center gap-2 text-[14px]">
            <span className="text-muted">Shopping for</span>
            {priorities(scan, 3).map((c) => (
              <span key={c.concern} className="rounded-full bg-surface px-3 py-1.5 font-medium">
                {CONCERNS[c.concern]} <span className="text-muted">{c.score}</span>
              </span>
            ))}
          </div>

          <form
            className="mt-5"
            onSubmit={(e) => {
              e.preventDefault();
              run(request);
            }}
          >
            <label htmlFor="ask" className="sr-only">
              What do you need?
            </label>
            <div className="flex items-center gap-2 rounded-full bg-raised py-2 pl-6 pr-2 shadow-[0_10px_40px_-15px_rgba(70,50,20,0.35)] ring-1 ring-line/60 focus-within:ring-2 focus-within:ring-brand">
              <input
                id="ask"
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                disabled={running}
                placeholder="A gentle routine for redness, under $50"
                className="min-w-0 flex-1 bg-transparent text-[17px] outline-none disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={running || request.trim().length < 3}
                aria-label="Shop for me"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-fill text-on-brand transition enabled:hover:brightness-110 disabled:opacity-30"
              >
                <ArrowUp className="h-5 w-5" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {IDEAS.map((i) => (
              <button
                key={i}
                onClick={() => run(i)}
                disabled={running}
                className="min-h-11 rounded-full bg-surface px-4 text-[14px] transition enabled:hover:bg-foreground/10 disabled:opacity-40"
              >
                {i}
              </button>
            ))}
          </div>
        </div>
      )}

      {!paidOrder && (running || steps.length > 0) && <Trace steps={steps} running={running} title="The shopper at work" />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {!paidOrder && cart && <CartPanel cart={cart} clientId={clientId} onPaid={onPaid} />}

      {paidOrder && (
        <Button variant="secondary" onClick={() => { setJustPaid(null); setSteps([]); setRequest(""); }}>
          Shop for something else
        </Button>
      )}

      {pastOrders.length > 0 && (
        <div className="mt-6 grid gap-4">
          <h2 className="text-[clamp(28px,4vw,36px)] font-semibold">Your routine & orders</h2>
          {pastOrders.map((o) => (
            <OrderCard key={o.orderId} order={o} proposal={o.proposal} scan={scan} clientId={clientId} onChange={setOrders} />
          ))}
        </div>
      )}
    </div>
  );
}
