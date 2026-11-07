import type { ReactNode } from "react";
import type { Verdict } from "@/lib/ingredients";
import { scoreBand } from "@/lib/skin";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-line bg-surface p-5 ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">{children}</p>;
}

const BAND_STYLE = {
  good: { bar: "bg-good", text: "text-good", label: "Good" },
  fair: { bar: "bg-fair", text: "text-fair", label: "Fair" },
  focus: { bar: "bg-focus", text: "text-focus", label: "Focus" },
};

export function ScoreBar({ label, score }: { label: string; score: number }) {
  const band = BAND_STYLE[scoreBand(score)];
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums">
          <span className={`mr-2 text-xs font-medium ${band.text}`}>{band.label}</span>
          {score}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${band.bar}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

const VERDICT_STYLE: Record<Verdict, { bg: string; fg: string; label: string }> = {
  great: { bg: "bg-good-soft", fg: "text-good", label: "Great fit" },
  good: { bg: "bg-brand-soft", fg: "text-brand", label: "Good fit" },
  neutral: { bg: "bg-line", fg: "text-muted", label: "Neutral" },
  caution: { bg: "bg-focus-soft", fg: "text-focus", label: "Think twice" },
};

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  const v = VERDICT_STYLE[verdict];
  return <span className={`rounded-full px-3 py-1 text-sm font-semibold ${v.bg} ${v.fg}`}>{v.label}</span>;
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  className?: string;
}) {
  const style =
    variant === "primary"
      ? "bg-brand text-white dark:text-black"
      : "border border-line bg-surface text-foreground hover:border-brand";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition disabled:opacity-50 ${style} ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" />
      {label}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-focus-soft p-3 text-sm text-focus">{children}</p>;
}
