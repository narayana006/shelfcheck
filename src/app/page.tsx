"use client";

import { useEffect, useRef, useState } from "react";
import { CheckView } from "@/components/CheckView";
import { Hero } from "@/components/Hero";
import { ProgressView } from "@/components/ProgressView";
import { ShopView } from "@/components/ShopView";
import { SkinView } from "@/components/SkinView";
import { newId, store, type SavedCheck } from "@/lib/client";
import { sampleScores, type SkinScan } from "@/lib/skin";

type Tab = "shop" | "skin" | "check" | "progress";

const TABS: { id: Tab; label: string }[] = [
  { id: "shop", label: "Shop" },
  { id: "skin", label: "My skin" },
  { id: "check", label: "Check" },
  { id: "progress", label: "Progress" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("shop");
  const [scans, setScans] = useState<SkinScan[]>([]);
  const [checks, setChecks] = useState<SavedCheck[]>([]);
  const [ready, setReady] = useState(false);
  const [scanning, setScanning] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

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
    <div className="min-h-dvh">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-2">
        Skip to content
      </a>
      <nav aria-label="ShelfCheck" className="sticky top-0 z-30 border-b border-line/40 bg-background/72 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-8">
          <span className="shrink-0 text-[19px] font-semibold tracking-tight">ShelfCheck</span>
          <div className="no-scrollbar -mr-4 flex flex-1 gap-1 overflow-x-auto pr-4 [mask-image:linear-gradient(to_right,black_85%,transparent)] sm:mr-0 sm:justify-end sm:pr-0 sm:[mask-image:none]">
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
          <button onClick={() => go("skin", true)} className="min-h-6 font-semibold underline-offset-4 hover:underline">
            Scan your own skin ›
          </button>
        </div>
      )}

      <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-3xl px-4 pb-28 pt-2 outline-none">
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
          <ProgressView scans={scans} />
        )}
      </main>

      <footer className="border-t border-line/40 px-4 py-8 text-center text-xs leading-relaxed text-muted">
        Demo store in PayPal sandbox · not affiliated with the brands shown · not medical advice
      </footer>
    </div>
  );
}
