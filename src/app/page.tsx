"use client";

import { ScanBarcode, ScanFace, ShoppingBag, TrendingUp, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CheckView } from "@/components/CheckView";
import { Hero } from "@/components/Hero";
import { Logo } from "@/components/Logo";
import { ProgressView } from "@/components/ProgressView";
import { ShopView } from "@/components/ShopView";
import { SkinView } from "@/components/SkinView";
import { newId, store, type SavedCheck } from "@/lib/client";
import { sampleScores, type SkinScan } from "@/lib/skin";

type Tab = "shop" | "skin" | "check" | "progress";

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: "shop", label: "Shop", icon: ShoppingBag },
  { id: "skin", label: "My skin", icon: ScanFace },
  { id: "check", label: "Check", icon: ScanBarcode },
  { id: "progress", label: "Progress", icon: TrendingUp },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("shop");
  const [scans, setScans] = useState<SkinScan[]>([]);
  const [checks, setChecks] = useState<SavedCheck[]>([]);
  const [ready, setReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Back from PayPal in the approval popup: tell the main tab, then close this window.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const revised = params.get("revised");
    // PayPal's cross-site redirect can drop window.opener, so the return URL itself says it's the popup.
    if (!revised || params.get("popup") !== "1") return;
    const msg = { type: "shelfcheck:revised", id: revised };
    try { window.opener?.postMessage(msg, window.location.origin); } catch {}
    try { const c = new BroadcastChannel("shelfcheck"); c.postMessage(msg); c.close(); } catch {}
    setTimeout(() => window.close(), 300);
  }, []);

  useEffect(() => {
    setScans(store.scans());
    setChecks(store.checks());
    setReady(true);
  }, []);

  const latest = scans[0] ?? null;

  function go(next: Tab, scan = false) {
    setScanning(scan);
    setTab(next);
    window.scrollTo({ top: 0 });
    // Move focus to the new screen so keyboard and screen-reader users land in it.
    requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }

  function addScan(s: SkinScan) {
    const next = [s, ...scans];
    setScans(next);
    store.saveScans(next);
    try {
      document.documentElement.dataset.app = "1";
    } catch {}
    go("shop");
  }

  /** Sample users: add the same person "six weeks later" so the progress chart has a trend to show. */
  function simulateLater() {
    const now = Date.now();
    const sixWeeksAgo = new Date(now - 42 * 24 * 60 * 60 * 1000).toISOString();
    const earlier = scans.map((s) => (s.sample ? { ...s, takenAt: sixWeeksAgo } : s));
    const later: SkinScan = {
      id: newId(),
      takenAt: new Date(now).toISOString(),
      scores: sampleScores("later"),
      tone: latest?.tone ?? { skin: "#c99a7e" },
      sample: true,
    };
    const next = [later, ...earlier];
    setScans(next);
    store.saveScans(next);
  }

  function startWithSample() {
    addScan({ id: newId(), takenAt: new Date().toISOString(), scores: sampleScores(), tone: { skin: "#c99a7e" }, sample: true });
  }

  // Server render and first paint: the landing page (a pre-paint script swaps to the app shell
  // for returning visitors, so neither group sees a blank page or a flash).
  if (!ready || (!latest && !scanning)) {
    return (
      <>
        <div className="landing">
          <Hero onScan={() => go("skin", true)} onSample={startWithSample} />
        </div>
        {!ready && <div className="app-skeleton min-h-dvh" aria-hidden />}
      </>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-2">
        Skip to content
      </a>
      <nav aria-label="ShelfCheck" className="sticky top-0 z-30 border-b border-line/40 bg-background/72 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-8">
          <Logo className="shrink-0 text-[19px]" />
          <div className="hidden flex-1 justify-end gap-1 sm:flex">
            {TABS.map((t) => {
              const active = tab === t.id && !scanning;
              return (
                <button
                  key={t.id}
                  onClick={() => go(t.id)}
                  aria-current={active ? "page" : undefined}
                  className={`relative min-h-11 shrink-0 px-3 text-[14px] transition ${
                    active ? "font-semibold text-foreground" : "text-muted hover:text-foreground"
                  }`}
                >
                  {t.label}
                  {active && <span aria-hidden className="absolute inset-x-3 bottom-1.5 h-0.5 rounded-full bg-foreground" />}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {latest?.sample && (
        <div className="bg-brand-soft px-4 py-2.5 text-center text-[14px] text-brand">
          You&apos;re using a sample skin profile.{" "}
          {process.env.NEXT_PUBLIC_YOUCAM_DISABLED !== "1" && (
            <button onClick={() => go("skin", true)} className="min-h-6 font-semibold underline-offset-4 hover:underline">
              Scan your own skin ›
            </button>
          )}
        </div>
      )}

      <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-3xl flex-1 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-2 outline-none sm:pb-28">
        {scanning || tab === "skin" ? (
          <SkinView latest={scanning ? null : latest} onScan={addScan} />
        ) : tab === "shop" ? (
          <ShopView scan={latest} goScan={() => go("skin", true)} />
        ) : tab === "check" ? (
          <CheckView
            scan={latest}
            history={checks}
            goScan={() => go("skin", true)}
            onCheck={(c) => {
              const next = [c, ...checks];
              setChecks(next);
              store.saveChecks(next);
            }}
          />
        ) : (
          <ProgressView scans={scans} goScan={() => go("skin", true)} onSimulate={simulateLater} />
        )}
      </main>

      <footer className="border-t border-line/40 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-8 text-center text-xs leading-relaxed text-muted sm:pb-8">
        Demo store in PayPal sandbox · not affiliated with the brands shown · product data from Open Beauty Facts (ODbL) · not medical advice
      </footer>

      <nav
        aria-label="Tabs"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line/40 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 [-webkit-backdrop-filter:blur(24px)_saturate(1.5)] sm:hidden"
      >
        <div className="grid grid-cols-4">
          {TABS.map((t) => {
            const active = tab === t.id && !scanning;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => go(t.id)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 pt-1.5 pb-1 text-[11px] font-medium transition-colors ${
                  active ? "text-brand" : "text-muted active:text-foreground"
                }`}
              >
                <Icon className="h-6 w-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
