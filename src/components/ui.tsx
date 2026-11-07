import type { ReactNode } from "react";
import type { Verdict } from "@/lib/ingredients";
import { scoreBand } from "@/lib/skin";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rise rounded-[28px] bg-surface p-6 sm:p-8 ${className}`}>{children}</section>;
}

/** Small uppercase kicker above a card title. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{children}</p>;
}

/** The real heading of a card: gives every card a visible level in the hierarchy. */
export function CardTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h2 className={`mt-1 text-[22px] font-semibold leading-tight text-balance ${className}`}>{children}</h2>;
}

/** One page title style for every screen. */
export function PageTitle({ children, lede }: { children: ReactNode; lede?: ReactNode }) {
  return (
    <header className="rise pt-6 sm:pt-10">
      <h1 className="text-[clamp(40px,7vw,64px)] font-semibold leading-[1.02] text-balance">{children}</h1>
      {lede && <p className="mt-4 max-w-xl text-lg leading-snug text-muted text-pretty sm:text-xl">{lede}</p>}
    </header>
  );
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
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]" aria-hidden>
        <div className={`h-full rounded-full ${band.bar} transition-[width] duration-700`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}

const VERDICT_STYLE: Record<Verdict, { bg: string; fg: string; label: string }> = {
  great: { bg: "bg-good-soft", fg: "text-good", label: "Great fit" },
  good: { bg: "bg-brand-soft", fg: "text-brand", label: "Good fit" },
  neutral: { bg: "bg-foreground/[0.06]", fg: "text-foreground", label: "Neutral" },
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
  type = "button",
  label,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "link";
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
  label?: string;
}) {
  const style = {
    primary: "min-h-12 bg-brand-fill px-7 text-on-brand enabled:hover:brightness-110 enabled:active:scale-[0.98]",
    secondary: "min-h-12 bg-foreground/[0.06] px-7 text-foreground enabled:hover:bg-foreground/10 enabled:active:scale-[0.98]",
    link: "min-h-11 px-2 text-brand enabled:hover:underline underline-offset-4",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full text-[17px] font-medium transition disabled:opacity-40 ${style} ${className}`}
    >
      {children}
    </button>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-[15px] text-muted" role="status">
      <span className="h-4 w-4 motion-safe:animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden />
      {label}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-2xl bg-focus-soft px-4 py-3 text-[15px] text-focus">
      {children}
    </p>
  );
}
