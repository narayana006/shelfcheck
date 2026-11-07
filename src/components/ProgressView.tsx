import { CONCERNS, CONCERN_KEYS, type SkinScan } from "@/lib/skin";
import { Card, Eyebrow } from "./ui";

function Sparkline({ values }: { values: number[] }) {
  const w = 96;
  const h = 28;
  const min = Math.min(...values) - 5;
  const max = Math.max(...values) + 5;
  const pts = values
    .map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function ProgressView({ scans }: { scans: SkinScan[] }) {
  if (scans.length < 2) {
    return (
      <div className="grid gap-5 pt-4">
        <h1 className="font-display text-4xl leading-tight">Is it working?</h1>
        <Card>
          <p className="text-sm text-muted">
            Rescan once a week in the same light. ShelfCheck charts every concern so you can see whether your routine is
            actually changing your skin.
          </p>
          <p className="mt-3 text-sm">
            {scans.length === 0 ? "No scans yet." : "1 scan so far. Your next scan unlocks your trend."}
          </p>
        </Card>
      </div>
    );
  }

  const chrono = [...scans].reverse();
  const first = chrono[0];
  const last = chrono[chrono.length - 1];
  const scoreOf = (s: SkinScan, c: string) => s.scores.find((x) => x.concern === c)?.score;

  return (
    <div className="grid gap-5 pt-4">
      <div>
        <h1 className="font-display text-4xl leading-tight">Is it working?</h1>
        <p className="mt-2 text-sm text-muted">
          {chrono.length} scans since {new Date(first.takenAt).toLocaleDateString()}
        </p>
      </div>
      <Card>
        <Eyebrow>Change since your first scan</Eyebrow>
        <ul className="mt-2 divide-y divide-line">
          {CONCERN_KEYS.map((c) => {
            const series = chrono.map((s) => scoreOf(s, c)).filter((v): v is number => v !== undefined);
            if (series.length < 2) return null;
            const delta = (scoreOf(last, c) ?? 0) - (scoreOf(first, c) ?? 0);
            return (
              <li key={c} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="w-24">{CONCERNS[c]}</span>
                <Sparkline values={series} />
                <span
                  className={`w-12 text-right font-semibold tabular-nums ${delta > 0 ? "text-good" : delta < 0 ? "text-focus" : "text-muted"}`}
                >
                  {delta > 0 ? "+" : ""}
                  {delta}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
