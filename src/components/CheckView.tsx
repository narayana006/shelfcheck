"use client";

import { useRef, useState } from "react";
import type { CheckResult } from "@/lib/check";
import { blobToDataUrl, decodeBarcode, newId, prepareImage, type SavedCheck } from "@/lib/client";
import { SIMULATABLE } from "@/lib/simulatable";
import { CONCERNS, type SkinScan } from "@/lib/skin";
import { SimulationCard } from "./Looks";
import { Button, Card, ErrorNote, Eyebrow, Spinner, VerdictPill } from "./ui";

function ResultView({ r, scan }: { r: CheckResult; scan: SkinScan }) {
  const { product, fit, explanation, matches, euAllergens } = r;
  const helped = fit.impacts
    .filter((i) => i.helpedBy.length && !i.aggravatedBy.length && i.userScore < 85 && SIMULATABLE.includes(i.concern))
    .slice(0, 3)
    .map((i) => i.concern);

  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex items-start gap-4">
          {product.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image} alt="" className="h-16 w-16 shrink-0 rounded-2xl bg-white object-contain" />
          )}
          <div className="min-w-0 flex-1">
            <Eyebrow>{[product.brand, product.product_type].filter(Boolean).join(" · ") || "Product"}</Eyebrow>
            <h2 className="mt-1 text-lg font-semibold leading-snug">{product.product_name || "Scanned product"}</h2>
          </div>
          <VerdictPill verdict={fit.verdict} />
        </div>
        <p className="mt-4 text-3xl font-semibold leading-tight tracking-tight">{explanation.headline}</p>
        <p className="mt-3 text-sm leading-relaxed">{explanation.summary}</p>
        <p className="mt-3 rounded-2xl bg-brand-soft p-3 text-sm">
          <span className="font-semibold text-brand">How to use · </span>
          {explanation.how_to_use}
        </p>
        <p className="mt-3 text-xs text-muted">
          {r.source === "barcode" ? `Ingredients from Open Beauty Facts · barcode ${product.barcode}` : "Ingredients read from your label photo"}
        </p>
      </Card>

      {fit.impacts.length > 0 && (
        <Card>
          <Eyebrow>For your skin</Eyebrow>
          <ul className="mt-3 divide-y divide-line/50">
            {fit.impacts.map((i) => (
              <li key={i.concern} className="flex items-start justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="font-medium">{CONCERNS[i.concern]}</div>
                  <div className="text-xs text-muted">Your score {i.userScore}</div>
                </div>
                <div className="text-right">
                  {i.helpedBy.length > 0 && <div className="text-good">+ {i.helpedBy.join(", ")}</div>}
                  {i.aggravatedBy.length > 0 && <div className="text-focus">− {i.aggravatedBy.join(", ")}</div>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {euAllergens.length > 0 && (
        <Card>
          <Eyebrow>EU-listed fragrance allergens · {euAllergens.length}</Eyebrow>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {euAllergens.map((a) => (
              <span key={a} className="rounded-full bg-fair-soft px-2.5 py-1 text-xs font-medium text-fair">
                {a}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted">
            From the 26 allergens EU law (Reg. 1223/2009, Annex III) requires on labels. Worth avoiding if your skin reacts easily.
          </p>
        </Card>
      )}

      {helped.length > 0 && fit.verdict !== "caution" && (
        <SimulationCard
          scan={scan}
          concerns={helped}
          title="See it working"
          subtitle="What your skin could look like as this product does its job on these concerns."
        />
      )}

      <Card>
        <Eyebrow>Key ingredients found</Eyebrow>
        {matches.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No standout actives or common irritants in this formula.</p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {matches.map((m) => (
              <li key={m.name} className="text-sm">
                <span className="font-medium">{m.name}</span>
                <span className="text-muted"> — {m.note}</span>
              </li>
            ))}
          </ul>
        )}
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-muted">Full ingredient list ({product.ingredients.length})</summary>
          <p className="mt-2 text-xs leading-relaxed text-muted">{product.ingredients.join(", ")}</p>
        </details>
      </Card>
    </div>
  );
}

type Mode = null | "barcode" | "paste";

export function CheckView({
  scan,
  history,
  onCheck,
  goScan,
}: {
  scan: SkinScan | null;
  history: SavedCheck[];
  onCheck: (c: SavedCheck) => void;
  goScan: () => void;
}) {
  const barcodeInput = useRef<HTMLInputElement>(null);
  const labelInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [text, setText] = useState("");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);

  if (!scan) {
    return (
      <Card className="mt-6">
        <Eyebrow>Step 2 · Check a product</Eyebrow>
        <p className="mt-2 text-sm text-muted">ShelfCheck compares products with your measured skin, so start with a quick scan.</p>
        <Button onClick={goScan} className="mt-4 w-full">
          Scan my skin first
        </Button>
      </Card>
    );
  }

  async function run(payload: { barcode?: string; image?: string; text?: string }, label: string) {
    setBusy(label);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, scores: scan!.scores }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setResult(body);
      onCheck({ id: newId(), checkedAt: new Date().toISOString(), result: body });
      setMode(null);
      setText("");
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The check failed.");
    } finally {
      setBusy(null);
    }
  }

  async function onBarcodePhoto(file: File) {
    setError(null);
    setBusy("Reading the barcode…");
    const value = await decodeBarcode(file);
    if (barcodeInput.current) barcodeInput.current.value = "";
    if (!value) {
      setBusy(null);
      setMode("barcode");
      setError("Couldn't read that barcode. Get closer and keep it sharp, or type the number below.");
      return;
    }
    await run({ barcode: value }, "Looking up the product and matching it to your skin…");
  }

  return (
    <div className="grid gap-5">
      <input
        ref={barcodeInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onBarcodePhoto(e.target.files[0])}
      />
      <input
        ref={labelInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (labelInput.current) labelInput.current.value = "";
          if (f) run({ image: await blobToDataUrl(await prepareImage(f, 2000)) }, "Reading the label and matching it to your skin…");
        }}
      />
      <div className="pt-4">
        <h1 className="text-4xl font-semibold leading-tight tracking-[-0.025em] sm:text-5xl">Will it work for you?</h1>
        <p className="mt-2 text-sm text-muted">Scan the barcode of any skincare product, or snap its ingredient list.</p>
      </div>

      {busy ? (
        <Card>
          <Spinner label={busy} />
        </Card>
      ) : (
        <div className="grid gap-3">
          <Button onClick={() => barcodeInput.current?.click()}>Scan barcode</Button>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => labelInput.current?.click()}>
              Snap ingredients
            </Button>
            <Button variant="secondary" onClick={() => setMode(mode === "paste" ? null : "paste")}>
              Type or paste
            </Button>
          </div>
        </div>
      )}

      {mode === "barcode" && !busy && (
        <Card>
          <label className="text-xs text-muted" htmlFor="code">
            Barcode number
          </label>
          <input
            id="code"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="e.g. 3337875597180"
            className="mt-1 block w-full bg-transparent text-lg tracking-wider outline-none"
          />
          <Button
            onClick={() => run({ barcode: code }, "Looking up the product and matching it to your skin…")}
            disabled={code.length < 8}
            className="mt-3 w-full"
          >
            Look up
          </Button>
        </Card>
      )}

      {mode === "paste" && !busy && (
        <Card>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Aqua, Niacinamide, Glycerin, …"
            className="w-full resize-none bg-transparent text-sm outline-none"
          />
          <Button
            onClick={() => run({ text }, "Matching these ingredients to your skin…")}
            disabled={text.trim().length < 3}
            className="mt-3 w-full"
          >
            Check these ingredients
          </Button>
          <button onClick={() => setMode("barcode")} className="mt-3 w-full text-center text-xs text-muted underline-offset-4 hover:underline">
            Or type a barcode number
          </button>
        </Card>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}
      {result && <ResultView r={result} scan={scan} />}

      {!result && history.length > 0 && (
        <Card>
          <Eyebrow>Recently checked</Eyebrow>
          <ul className="mt-2 divide-y divide-line/50">
            {history.slice(0, 8).map((h) => (
              <li key={h.id}>
                <button onClick={() => setResult(h.result)} className="flex w-full items-center justify-between gap-3 py-3 text-left">
                  <span className="min-w-0 truncate text-sm">
                    {h.result.product.product_name || "Scanned product"}
                    <span className="text-muted"> · {new Date(h.checkedAt).toLocaleDateString()}</span>
                  </span>
                  <VerdictPill verdict={h.result.fit.verdict} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-xs text-muted">
        General guidance based on ingredients and your scan, not medical advice. Patch-test new products. Product data from
        Open Beauty Facts (ODbL).
      </p>
    </div>
  );
}
