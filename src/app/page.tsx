"use client";

import { useEffect, useState } from "react";
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
  { id: "check", label: "Check a product" },
  { id: "progress", label: "Progress" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("shop");
  const [scans, setScans] = useState<SkinScan[]>([]);
  const [checks, setChecks] = useState<SavedCheck[]>([]);
  const [ready, setReady] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    setScans(store.scans());
    setChecks(store.checks());
    setReady(true);
  }, []);

  const latest = scans[0] ?? null;

  function addScan(s: SkinScan) {
    const next = [s, ...scans];
    setScans(next);
    store.saveScans(next);
    setScanning(false);
    setTab("shop");
  }

  function useSample() {
    addScan({ id: newId(), takenAt: new Date().toISOString(), scores: sampleScores(), tone: { skin: "#c99a7e" }, sample: true });
  }

  if (!ready) return <div className="min-h-dvh" />;

  if (!latest && !scanning) {
    return <Hero onScan={() => setScanning(true)} onSample={useSample} />;
  }

  return (
    <div className="min-h-dvh">
      <nav className="sticky top-0 z-20 border-b border-line/50 bg-background/72 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-12 max-w-3xl items-center gap-6 px-4">
          <span className="shrink-0 text-[17px] font-semibold tracking-tight">ShelfCheck</span>
          <div className="-mx-1 flex flex-1 gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setScanning(false);
                  setTab(t.id);
                }}
                aria-current={tab === t.id && !scanning ? "page" : undefined}
                className={`shrink-0 rounded-full px-3 py-1 text-[13px] transition ${
                  tab === t.id && !scanning ? "bg-foreground text-background" : "text-muted hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {latest?.sample && (
        <div className="bg-brand-soft px-4 py-2 text-center text-[13px] text-brand">
          You&apos;re using a sample skin profile.{" "}
          <button onClick={() => setScanning(true)} className="font-semibold underline-offset-4 hover:underline">
            Scan your own skin ›
          </button>
        </div>
      )}

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:pt-12">
        {scanning || tab === "skin" ? (
          <SkinView latest={scanning ? null : latest} onScan={addScan} />
        ) : tab === "shop" ? (
          <ShopView scan={latest} goScan={() => setScanning(true)} />
        ) : tab === "check" ? (
          <CheckView
            scan={latest}
            history={checks}
            goScan={() => setScanning(true)}
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

      <footer className="border-t border-line/50 py-8 text-center text-xs text-muted">
        Demo store in PayPal sandbox · not affiliated with the brands shown · not medical advice
      </footer>
    </div>
  );
}
