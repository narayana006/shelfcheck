"use client";

import { useRef, useState } from "react";
import { blobToDataUrl, newId, prepareImage } from "@/lib/client";
import { CONCERNS, priorities, scoreBand, type ConcernScore, type SkinScan } from "@/lib/skin";
import { SIMULATABLE } from "@/lib/simulatable";
import { ShadeCard, SimulationCard } from "./Looks";
import { Button, Card, ErrorNote, Eyebrow, ScoreBar, Spinner } from "./ui";

const CHIP = {
  good: "bg-good-soft text-good",
  fair: "bg-fair-soft text-fair",
  focus: "bg-focus-soft text-focus",
};

export function SkinView({ latest, onScan }: { latest: SkinScan | null; onScan: (s: SkinScan) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function scan(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      const [image, thumb] = await Promise.all([prepareImage(file), prepareImage(file, 900).then(blobToDataUrl)]);
      form.append("image", image, "selfie.jpg");
      const res = await fetch("/api/scan", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      onScan({
        id: newId(),
        takenAt: new Date().toISOString(),
        scores: body.scores as ConcernScore[],
        tone: body.tone,
        fileId: body.fileId,
        thumb,
        sample: body.sample,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "The scan failed.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  const picker = (
    <input
      ref={input}
      type="file"
      accept="image/jpeg,image/png"
      capture="user"
      className="hidden"
      onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])}
    />
  );

  if (!latest) {
    return (
      <div className="grid gap-5">
        {picker}
        <div className="pt-4">
          <h1 className="pt-6 text-[clamp(40px,7vw,64px)] font-semibold leading-[1.02] text-balance sm:pt-10">Know what your skin needs before you buy.</h1>
          <p className="mt-4 text-muted">
            One selfie gives you an AI skin analysis across 11 concerns. Then snap any product&apos;s ingredient list in the
            store, and ShelfCheck tells you if it fits <em>your</em> skin.
          </p>
        </div>
        <Card>
          <Eyebrow>Step 1 · Skin scan</Eyebrow>
          <ul className="mt-3 grid gap-2 text-sm text-muted">
            <li>• Face a window or bright, even light</li>
            <li>• Remove glasses, pull hair back</li>
            <li>• Hold the phone close so your face fills the frame</li>
          </ul>
          <div className="mt-5">
            {busy ? (
              <Spinner label="Analyzing your skin… this takes about 20 seconds" />
            ) : (
              <Button onClick={() => input.current?.click()} className="w-full">
                Take a selfie
              </Button>
            )}
          </div>
          {error && <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>}
          <p className="mt-4 text-xs text-muted">Your photo is sent to YouCam for analysis only. Results stay on this device.</p>
        </Card>
      </div>
    );
  }

  const top = priorities(latest);
  const sorted = [...latest.scores].sort((a, b) => a.score - b.score);
  const overall = Math.round(latest.scores.reduce((s, c) => s + c.score, 0) / latest.scores.length);

  return (
    <div className="grid gap-5">
      {picker}
      {latest.sample && (
        <p className="rounded-2xl bg-fair-soft p-3 text-sm text-fair">Sample results shown. Connect a YouCam API key for a real scan.</p>
      )}
      <Card>
        <Eyebrow>Your skin · {new Date(latest.takenAt).toLocaleDateString()}</Eyebrow>
        <h1 className="sr-only">Your skin</h1>
        <div className="mt-3 flex items-end gap-3">
          <span className="text-7xl font-semibold leading-none tracking-[-0.04em]">{overall}</span>
          <span className="pb-1.5 text-sm text-muted">overall skin score</span>
        </div>
        <div className="mt-5">
          <Eyebrow>Your focus areas</Eyebrow>
          <div className="mt-2 flex flex-wrap gap-2">
            {top.map((c) => (
              <span key={c.concern} className={`rounded-full px-3 py-1 text-sm font-medium ${CHIP[scoreBand(c.score)]}`}>
                {CONCERNS[c.concern]} · {c.score}
              </span>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">ShelfCheck weighs every product against these first.</p>
        </div>
      </Card>

      <SimulationCard
        scan={latest}
        concerns={priorities(latest, 11)
          .filter((c) => SIMULATABLE.includes(c.concern))
          .slice(0, 3)
          .map((c) => c.concern)}
        title="See your goal"
        subtitle="Your own photo, with your focus areas improved by YouCam AI Skin Simulation."
      />

      <ShadeCard scan={latest} />

      <Card>
        <Eyebrow>All measurements</Eyebrow>
        <div className="mt-4 grid gap-4">
          {sorted.map((c) => (
            <ScoreBar key={c.concern} label={CONCERNS[c.concern]} score={c.score} />
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">Scores from YouCam AI Skin Analysis, 0–100. Higher is healthier.</p>
      </Card>

      {error && <ErrorNote>{error}</ErrorNote>}
      {busy ? (
        <Spinner label="Analyzing your skin…" />
      ) : (
        <Button variant="secondary" onClick={() => input.current?.click()}>
          Rescan to track progress
        </Button>
      )}
    </div>
  );
}
