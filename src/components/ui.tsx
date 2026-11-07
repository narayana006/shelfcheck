import type { ReactNode } from "react";
import type { Verdict } from "@/lib/ingredients";
import { scoreBand } from "@/lib/skin";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rise rounded-[28px] bg-surface p-6 sm:p-7 ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">{children}</p>;
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
      <div className="flex items-baseline justify-between text-[15px]">
        <span>{label}</span>
        <span className="tabular-nums">
          <span className={`mr-2 text-xs font-medium ${band.text}`}>{band.label}</span>
          <span className="font-semibold">{score}</span>
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-line/60">
        <div className={`h-full rounded-full ${band.bar} transition-[width] duration-700`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

const VERDICT_STYLE: Record<Verdict, { bg: string; fg: string; label: string }> = {
  great: { bg: "bg-good-soft", fg: "text-good", label: "Great fit" },
  good: { bg: "bg-brand-soft", fg: "text-brand", label: "Good fit" },
  neutral: { bg: "bg-line/40", fg: "text-muted", label: "Neutral" },
  caution: { bg: "bg-focus-soft", fg: "text-focus", label: "Think twice" },
};

export function VerdictPill({ verdict }: { verdict: Verdict }) {
  const v = VERDICT_STYLE[verdict];
  return <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${v.bg} ${v.fg}`}>{v.label}</span>;
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
  variant?: "primary" | "secondary" | "link";
  disabled?: boolean;
  className?: string;
}) {
  const style = {
    primary: "bg-brand px-6 py-3.5 text-white hover:brightness-110 active:scale-[0.98]",
    secondary: "bg-foreground/[0.06] px-6 py-3.5 text-foreground hover:bg-foreground/10 active:scale-[0.98]",
    link: "px-1 py-2 text-brand hover:underline underline-offset-4",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full text-[15px] font-medium transition disabled:opacity-40 ${style} ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-[15px] text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-brand" />
      {label}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-focus-soft px-4 py-3 text-sm text-focus">{children}</p>;
}
