import { Check, RefreshCw, ScanFace, ShieldCheck, Undo2, Wallet, X } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "./ui";

/** A real cart the agent produced for the sample skin profile. */
const DEMO_CART = [
  { category: "Cleanser", name: "Cetaphil Gentle Skin Cleanser", great: true },
  { category: "Serum", name: "Niacinamide 10% Serum", great: true },
  { category: "Moisturizer", name: "Eucerin Aquaphor", great: false },
  { category: "Sunscreen", name: "Photoderm Max SPF 50+", great: false },
];

const BANDS = [
  {
    tone: "light",
    icon: ScanFace,
    stat: "11",
    statLabel: "skin concerns measured",
    title: "It starts with your actual face.",
    body: "One selfie and YouCam AI Skin Analysis scores acne, redness, pores, hydration and seven more. Every pick is made for those numbers, not a skin-type quiz.",
  },
  {
    tone: "surface",
    icon: ShieldCheck,
    stat: "26",
    statLabel: "EU-listed allergens flagged",
    title: "Every ingredient, checked against you.",
    body: "Real ingredient lists, read in full. A fit gate written in code refuses anything that would aggravate a weak spot, and shows you exactly what it ruled out and why.",
  },
  {
    tone: "dark",
    icon: Wallet,
    stat: "$0",
    statLabel: "charged until you approve",
    title: "The agent checks out. You decide.",
    body: "It keeps to your budget, creates the PayPal order and proposes when to refill. PayPal holds every dollar until you say yes.",
  },
  {
    tone: "cream",
    icon: Undo2,
    stat: "30",
    statLabel: "day reaction guarantee",
    title: "Reacted? Refunded, and replaced.",
    body: "If a product disagrees with your skin, refund just that item through PayPal. If it's on auto-refill, the agent swaps it out before the next one ships.",
  },
  {
    tone: "light",
    icon: RefreshCw,
    stat: "6",
    statLabel: "weeks, then it checks again",
    title: "Re-checked before every refill.",
    body: "Skin changes with the seasons. Rescan, and the agent re-scores your routine against your new skin, proposes swaps, and updates your PayPal subscription when you approve.",
  },
] as const;

const TONE = {
  light: "bg-blush text-foreground",
  surface: "bg-sage text-foreground",
  dark: "bg-lavender text-foreground",
  cream: "bg-surface text-foreground",
};

/** Live selfie scans can be paused (YouCam); the sample profiles then become the main path. */
const SCAN_ENABLED = process.env.NEXT_PUBLIC_YOUCAM_DISABLED !== "1";

function CallsToAction({ onScan, onSample }: { onScan: () => void; onSample: () => void }) {
  if (!SCAN_ENABLED) {
    return (
      <Button onClick={onSample} className="min-w-56">
        Try it with a sample skin
      </Button>
    );
  }
  return (
    <>
      <Button onClick={onScan} className="min-w-48">
        Scan my skin
      </Button>
      <Button variant="link" onClick={onSample}>
        Try it with a sample skin ›
      </Button>
    </>
  );
}

export function Hero({ onScan, onSample }: { onScan: () => void; onSample: () => void }) {
  return (
    <div>
      <nav aria-label="ShelfCheck" className="sticky top-0 z-30 border-b border-line/40 bg-background/72 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-4">
          <Logo className="text-[19px]" />
          <button
            onClick={SCAN_ENABLED ? onScan : onSample}
            className="min-h-9 rounded-full bg-brand-fill px-4 text-[13px] font-medium text-on-brand hover:brightness-110"
          >
            Get started
          </button>
        </div>
      </nav>

      <main>
        <section className="relative flex min-h-[88svh] flex-col items-center justify-center overflow-hidden px-4 pb-16 pt-14 text-center">
          <p className="rise text-[17px] font-semibold text-fair">New · AI shopping agent with PayPal</p>
          <h1 className="rise mt-4 text-[clamp(52px,10vw,120px)] font-semibold leading-[0.95] tracking-[-0.04em] text-balance">
            Skincare that
            <br />
            <span className="text-gradient">knows <span className="whitespace-nowrap">your skin.</span></span>
          </h1>
          <p className="rise mx-auto mt-7 max-w-2xl text-xl leading-snug text-muted text-pretty sm:text-2xl">
            Scan your face once. An AI shopper buys only what your skin can use, stays on budget, and checks out with PayPal.
            You approve every dollar.
          </p>
          <div className="rise mt-10 flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
            <CallsToAction onScan={onScan} onSample={onSample} />
          </div>
        </section>

        <section aria-label="What the shopper does" className="relative overflow-hidden bg-[linear-gradient(180deg,var(--lavender),var(--blush))] px-4 py-24 sm:py-32">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_40%_at_50%_55%,color-mix(in_srgb,var(--raised)_70%,transparent),transparent_70%)]"
          />
          <div className="relative mx-auto max-w-5xl text-center">
            <h2 className="text-[clamp(36px,6vw,64px)] font-semibold leading-[1.02] text-balance">
              Ask once. <span className="text-muted">It does the rest.</span>
            </h2>
          </div>
          <div className="relative mx-auto mt-14 max-w-[400px] [perspective:1200px]">
            <div className="rise rounded-[48px] bg-[#1f1b16] p-3 shadow-[0_50px_100px_-30px_rgba(60,40,20,0.45)] [transform:rotateX(6deg)]">
              <div className="rounded-[38px] bg-[#fffdf8] p-5 text-left text-[#1d1d1f]">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-semibold">Your cart</span>
                  <span className="text-[13px] text-[#6e6e73]">$57.87 of $60</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/[0.07]">
                  <div className="h-full w-[95%] rounded-full bg-[#0071e3]" />
                </div>
                <p className="mt-3 rounded-2xl bg-[#f3ece1] px-3 py-2 text-[13px] text-[#6e6e73]">“Build me a full routine under $60”</p>
                <ul className="mt-2 divide-y divide-black/[0.06]">
                  {DEMO_CART.map((i) => (
                    <li key={i.name} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-[#6e6e73]">{i.category}</div>
                        <div className="truncate text-[15px] font-medium">{i.name}</div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          i.great ? "bg-[#e3f4e8] text-[#157030]" : "bg-[#e8f1fc] text-[#0066cc]"
                        }`}
                      >
                        {i.great ? "Great fit" : "Good fit"}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#6e6e73]">
                  <X className="h-3.5 w-3.5 text-[#c4000f]" strokeWidth={2.5} aria-hidden /> Ruled out 8 products that aggravate
                  redness
                </p>
                <div className="mt-4 rounded-full bg-[#ffc439] py-3 text-center text-[15px] font-semibold text-[#003087]">
                  Pay with PayPal
                </div>
              </div>
            </div>
          </div>
        </section>

        {BANDS.map(({ tone, icon: Icon, stat, statLabel, title, body }) => (
          <section key={title} className={`${TONE[tone]} px-4 py-24 sm:py-32`}>
            <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-[1fr_1.2fr]">
              <div>
                <div className={`text-[clamp(88px,14vw,160px)] font-semibold leading-none tracking-[-0.05em] text-gradient inline-block`}>
                  {stat}
                </div>
                <p className={`mt-2 text-lg font-medium text-muted`}>{statLabel}</p>
              </div>
              <div>
                <Icon className={`h-9 w-9 text-brand`} strokeWidth={1.75} aria-hidden />
                <h2 className="mt-5 text-[clamp(32px,4.5vw,48px)] font-semibold leading-[1.05] text-balance">{title}</h2>
                <p className={`mt-5 text-lg leading-snug text-pretty sm:text-xl text-muted`}>{body}</p>
              </div>
            </div>
          </section>
        ))}

        <section className="px-4 py-24 text-center sm:py-32">
          <ShieldCheck className="mx-auto h-10 w-10 text-good" strokeWidth={1.75} aria-hidden />
          <h2 className="mx-auto mt-5 max-w-3xl text-[clamp(36px,6vw,64px)] font-semibold leading-[1.02] text-balance">
            An agent you can trust with your card.
          </h2>
          <ul className="mx-auto mt-8 grid max-w-xl gap-3 text-left text-lg">
            {[
              "Refuses products that aggravate your weak spots",
              "Refuses any cart over your budget",
              "Never charges without your PayPal approval",
            ].map((t) => (
              <li key={t} className="flex items-start gap-3">
                <Check className="mt-1 h-5 w-5 shrink-0 text-good" strokeWidth={2.5} aria-hidden />
                {t}
              </li>
            ))}
          </ul>
          <div className="mt-10 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-4">
            <CallsToAction onScan={onScan} onSample={onSample} />
          </div>
        </section>
      </main>

      <footer className="border-t border-line/40 px-4 py-8 text-center text-xs leading-relaxed text-muted">
        Demo store in PayPal sandbox · not affiliated with the brands shown · product data from Open Beauty Facts (ODbL / CC BY-SA)
        · not medical advice
      </footer>
    </div>
  );
}
