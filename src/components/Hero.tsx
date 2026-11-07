import { Button } from "./ui";

/** Illustrative cart shown in the hero (a real result the agent produced for the sample skin). */
const DEMO_CART = [
  { category: "Cleanser", name: "Cetaphil Gentle Skin Cleanser", great: true },
  { category: "Serum", name: "Niacinamide 10% Serum", great: true },
  { category: "Moisturizer", name: "Eucerin Aquaphor", great: false },
  { category: "Sunscreen", name: "Photoderm Max SPF 50+", great: false },
];

const FEATURES = [
  {
    kicker: "Measure",
    title: "11 skin concerns from one selfie.",
    body: "YouCam AI Skin Analysis scores acne, redness, pores, hydration and more, so every pick starts from your actual face.",
  },
  {
    kicker: "Decide",
    title: "Every ingredient, checked against you.",
    body: "Real ingredient lists, the 26 EU-listed fragrance allergens, and a fit gate written in code. Products that would make your skin worse never reach the cart.",
  },
  {
    kicker: "Buy",
    title: "The agent checks out. You approve.",
    body: "It stays on your budget, creates the PayPal order, and proposes when to refill. Nothing is charged until you say yes in PayPal.",
  },
];

export function Hero({ onScan, onSample }: { onScan: () => void; onSample: () => void }) {
  return (
    <div className="min-h-dvh">
      <nav className="sticky top-0 z-20 border-b border-line/50 bg-background/72 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-4">
          <span className="text-[17px] font-semibold tracking-tight">ShelfCheck</span>
          <button onClick={onScan} className="rounded-full bg-brand px-3.5 py-1 text-xs font-medium text-white">
            Get started
          </button>
        </div>
      </nav>

      <section className="mx-auto max-w-5xl px-4 pb-10 pt-16 text-center sm:pt-24">
        <p className="rise text-[17px] font-semibold text-fair">New · AI shopping agent with PayPal</p>
        <h1 className="rise mt-3 text-5xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-7xl">
          Skincare that
          <br />
          <span className="text-gradient">knows your skin.</span>
        </h1>
        <p className="rise mx-auto mt-6 max-w-2xl text-xl leading-relaxed text-muted sm:text-2xl">
          Scan your face once. ShelfCheck&apos;s AI shopper buys only what your skin can use, stays on budget, and checks
          out with PayPal. You approve every dollar.
        </p>
        <div className="rise mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button onClick={onScan} className="min-w-44">
            Scan my skin
          </Button>
          <Button variant="link" onClick={onSample}>
            Try it with a sample skin ›
          </Button>
        </div>
      </section>

      <section aria-label="What the shopper does" className="px-4 py-10">
        <div className="rise relative mx-auto max-w-[380px] rounded-[44px] bg-foreground p-3 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.45)]">
          <div className="rounded-[34px] bg-background p-5 text-left">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold">Your cart</span>
              <span className="text-[11px] text-muted">$57.37 of $60</span>
            </div>
            <p className="mt-3 rounded-2xl bg-surface px-3 py-2 text-[12px] text-muted">
              “Build me a full routine under $60”
            </p>
            <ul className="mt-3 divide-y divide-line/50/50">
              {DEMO_CART.map((i) => (
                <li key={i.name} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-muted">{i.category}</div>
                    <div className="truncate text-[13px] font-medium">{i.name}</div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      i.great ? "bg-good-soft text-good" : "bg-brand-soft text-brand"
                    }`}
                  >
                    {i.great ? "Great fit" : "Good fit"}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
              <span className="text-focus">✕</span> Ruled out 3 products that aggravate your redness
            </p>
            <div className="mt-4 rounded-full bg-[#ffc439] py-2.5 text-center text-[13px] font-semibold text-[#003087]">
              Pay with PayPal
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 py-16 md:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.kicker} className="rise rounded-[28px] bg-surface p-8">
            <p className="text-sm font-semibold text-brand">{f.kicker}</p>
            <h2 className="mt-2 text-2xl font-semibold leading-tight tracking-tight">{f.title}</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">An agent you can trust with your card.</h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
          The AI explains and chooses. Code enforces the rules: it refuses any product that aggravates a weak spot, and any cart
          over your budget. PayPal holds the money until you approve.
        </p>
        <Button onClick={onScan} className="mt-8 min-w-44">
          Get started
        </Button>
      </section>

      <footer className="border-t border-line/50 py-8 text-center text-xs text-muted">
        Demo store in PayPal sandbox · not affiliated with the brands shown · product data and images from Open Beauty Facts
        (ODbL / CC BY-SA) · not medical advice
      </footer>
    </div>
  );
}
