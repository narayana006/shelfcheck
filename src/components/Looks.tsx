"use client";

import { useState } from "react";
import { shadeProfile } from "@/lib/tone";
import { CONCERNS, type Concern, type SkinScan } from "@/lib/skin";
import { Compare } from "./Compare";
import { Button, Card, ErrorNote, Eyebrow, Spinner } from "./ui";

async function post(path: string, body: object): Promise<string> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error);
  return json.url as string;
}

/** YouCam AI Skin Simulation: the user's own face with chosen concerns improved. */
export function SimulationCard({
  scan,
  concerns,
  title,
  subtitle,
}: {
  scan: SkinScan;
  concerns: Concern[];
  title: string;
  subtitle: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!scan.fileId || !scan.thumb || concerns.length === 0) return null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setUrl(await post("/api/simulate", { fileId: scan.fileId, concerns }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The preview failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Eyebrow>{title}</Eyebrow>
      <p className="mt-2 text-sm text-muted">{subtitle}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {concerns.map((c) => (
          <span key={c} className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand">
            {CONCERNS[c]}
          </span>
        ))}
      </div>
      <div className="mt-4">
        {url ? (
          <>
            <Compare before={scan.thumb} after={url} afterLabel="Simulated" />
            <p className="mt-2 text-xs text-muted">AI simulation by YouCam. Illustrative only; results vary.</p>
          </>
        ) : busy ? (
          <Spinner label="Simulating on your photo…" />
        ) : (
          <Button variant="secondary" onClick={run} className="w-full">
            Show me
          </Button>
        )}
      </div>
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </Card>
  );
}

/** Shade match from YouCam's measured skin color, then makeup try-on of that shade. */
export function ShadeCard({ scan }: { scan: SkinScan }) {
  const [lip, setLip] = useState<string | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!scan.tone?.skin) return null;
  const shade = shadeProfile(scan.tone.skin);

  async function tryOn(lipColor?: string) {
    setLip(lipColor);
    setBusy(true);
    setError(null);
    try {
      setUrl(await post("/api/tryon", { fileId: scan.fileId, foundation: shade.foundation, lip: lipColor }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The try-on failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Eyebrow>Your shade</Eyebrow>
      <div className="mt-3 flex items-center gap-4">
        <span className="h-14 w-14 shrink-0 rounded-full border border-line" style={{ background: shade.skin }} />
        <div>
          <div className="font-display text-2xl leading-tight">
            {shade.depth}, {shade.undertone.toLowerCase()} undertone
          </div>
          <div className="text-xs text-muted">Measured skin color {shade.skin.toUpperCase()}</div>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted">
        Shop foundation labeled <strong className="text-foreground">{shade.depth.toLowerCase()}</strong> with a{" "}
        <strong className="text-foreground">{shade.undertone.toLowerCase()}</strong> undertone
        {shade.undertone === "Warm" ? " (often W, Y or G)" : shade.undertone === "Cool" ? " (often C, P or R)" : " (often N)"}. Lip
        colors that suit you:
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {shade.lips.map((l) => (
          <button
            key={l.color}
            onClick={() => scan.fileId && tryOn(l.color)}
            disabled={busy || !scan.fileId}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${lip === l.color ? "border-brand" : "border-line"}`}
          >
            <span className="h-4 w-4 rounded-full" style={{ background: l.color }} />
            {l.name}
          </button>
        ))}
      </div>
      {scan.fileId && scan.thumb && (
        <div className="mt-4">
          {busy ? (
            <Spinner label="Applying your shade with YouCam virtual try-on…" />
          ) : url ? (
            <Compare before={scan.thumb} after={url} afterLabel="Your shade" />
          ) : (
            <Button onClick={() => tryOn(undefined)} className="w-full">
              Try my foundation shade on
            </Button>
          )}
        </div>
      )}
      {error && <div className="mt-3"><ErrorNote>{error}</ErrorNote></div>}
    </Card>
  );
}
