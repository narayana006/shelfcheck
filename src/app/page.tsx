"use client";

import { useEffect, useState } from "react";
import { CheckView } from "@/components/CheckView";
import { ProgressView } from "@/components/ProgressView";
import { ShopView } from "@/components/ShopView";
import { SkinView } from "@/components/SkinView";
import { store, type SavedCheck } from "@/lib/client";
import type { SkinScan } from "@/lib/skin";

type Tab = "skin" | "check" | "shop" | "progress";

const TABS: { id: Tab; label: string }[] = [
  { id: "skin", label: "My skin" },
  { id: "check", label: "Check" },
  { id: "shop", label: "Shop" },
  { id: "progress", label: "Progress" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("skin");
  const [scans, setScans] = useState<SkinScan[]>([]);
  const [checks, setChecks] = useState<SavedCheck[]>([]);

  useEffect(() => {
    const s = store.scans();
    setScans(s);
    setChecks(store.checks());
    if (s.length) setTab("check");
  }, []);

  const latest = scans[0] ?? null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col px-4">
      <header className="flex items-center justify-between py-4">
        <span className="text-base font-semibold tracking-tight">
          Shelf<span className="text-brand">Check</span>
        </span>
        <span className="text-xs text-muted">Skin AI by YouCam</span>
      </header>

      <main className="flex-1 pb-28">
        {tab === "skin" && (
          <SkinView
            latest={latest}
            onScan={(s) => {
              const next = [s, ...scans];
              setScans(next);
              store.saveScans(next);
            }}
          />
        )}
        {tab === "check" && (
          <CheckView
            scan={latest}
            history={checks}
            goScan={() => setTab("skin")}
            onCheck={(c) => {
              const next = [c, ...checks];
              setChecks(next);
              store.saveChecks(next);
            }}
          />
        )}
        {tab === "shop" && <ShopView scan={latest} goScan={() => setTab("skin")} />}
        {tab === "progress" && <ProgressView scans={scans} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-xl px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 rounded-full py-2.5 text-sm font-medium transition ${
                tab === t.id ? "bg-brand-soft text-brand" : "text-muted hover:text-foreground"
              }`}
              aria-current={tab === t.id ? "page" : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
