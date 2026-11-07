import { CONCERNS, CONCERN_KEYS, type SkinScan } from "@/lib/skin";
import { Button, Card, Eyebrow, PageTitle, shortDate } from "./ui";

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

export function ProgressView({
  scans,
  goScan,
  onSimulate,
}: {
  scans: SkinScan[];
  goScan: () => void;
  onSimulate: () => void;
}) {
  const sampleOnly = scans.length > 0 && scans.every((s) => s.sample);
  const scanningEnabled = process.env.NEXT_PUBLIC_YOUCAM_DISABLED !== "1";

  if (scans.length < 2) {
    return (
      <div className="grid gap-5">
        <PageTitle lede="Rescan once a week in the same light. ShelfCheck charts every concern so you can see whether your routine is actually changing your skin.">
          Is it working?
        </PageTitle>
        <Card>
          <Eyebrow>Your trend</Eyebrow>
          <p className="mt-2 text-[17px]">
            {scans.length === 0 ? "No scans yet." : "1 scan so far. Your next scan unlocks your trend."}
          </p>
          <div className="mt-5 grid gap-3 sm:flex sm:flex-wrap">
            {scanningEnabled && <Button onClick={goScan}>Rescan</Button>}
            {sampleOnly && (
              <Button variant={scanningEnabled ? "secondary" : "primary"} onClick={onSimulate}>
                Simulate a scan 6 weeks later
              </Button>
            )}
          </div>
        </Card>
      </div>
    );
  }

  const chrono = [...scans].reverse();
  const first = chrono[0];
  const last = chrono[chrono.length - 1];
  const scoreOf = (s: SkinScan, c: string) => s.scores.find((x) => x.concern === c)?.score;

  return (
    <div className="grid gap-5">
      <PageTitle lede={`${chrono.length} scans since ${shortDate(first.takenAt)}${sampleOnly ? " (sample data)" : ""}.`}>
        Is it working?
      </PageTitle>
      <Card>
        <Eyebrow>Change since your first scan</Eyebrow>
        <ul className="mt-2 divide-y divide-line/50">
          {CONCERN_KEYS.map((c) => {
            const series = chrono.map((s) => scoreOf(s, c)).filter((v): v is number => v !== undefined);
            if (series.length < 2) return null;
            const delta = (scoreOf(last, c) ?? 0) - (scoreOf(first, c) ?? 0);
            return (
              <li key={c} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="w-28 shrink-0">{CONCERNS[c]}</span>
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
      {scanningEnabled && (
        <Button onClick={goScan} className="sm:w-auto sm:justify-self-center">
          Rescan
        </Button>
      )}
    </div>
  );
}
