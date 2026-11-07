import { Check, CreditCard, ScanLine, Search, ShieldX, Sparkles } from "lucide-react";

type Kind = "read" | "browse" | "check" | "reject" | "pay" | "other";

function kindOf(step: string): Kind {
  if (/^(Ruled out|Checkout refused|Refused)|no longer fits/.test(step)) return "reject";
  if (/^(Browsing|Looking for|Weighing)/.test(step)) return "browse";
  if (/^(Checking|Re-checking)/.test(step)) return "check";
  if (/PayPal/.test(step)) return "pay";
  if (/^Reading/.test(step)) return "read";
  return "other";
}

const ICON = { read: Sparkles, browse: Search, check: ScanLine, reject: ShieldX, pay: CreditCard, other: Check };

/**
 * The agent's reasoning as a live timeline: every catalog search, ingredient check and
 * code-enforced refusal, as it happens. This is the product's proof that it can be trusted.
 */
export function Trace({
  steps,
  running,
  title,
  runningLabel = "Shopping for your skin…",
}: {
  steps: string[];
  running: boolean;
  title: string;
  runningLabel?: string;
}) {
  const checked = steps
    .filter((s) => /^(Checking|Re-checking) \d+/.test(s))
    .reduce((n, s) => n + Number(s.match(/\d+/)?.[0] ?? 0), 0);
  const ruledOut = steps.filter((s) => kindOf(s) === "reject").length;

  return (
    <section className="rise rounded-[28px] bg-raised p-6 shadow-[0_1px_0_rgba(0,0,0,0.03),0_20px_50px_-30px_rgba(70,50,20,0.35)] sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{title}</p>
          <h2 className="mt-1 text-[22px] font-semibold leading-tight">{running ? runningLabel : "How it decided"}</h2>
        </div>
        <dl className="flex gap-6 text-right">
          <div>
            <dt className="text-xs text-muted">Ingredient lists read</dt>
            <dd className="text-3xl font-semibold tabular-nums tracking-tight">{checked}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Ruled out</dt>
            <dd className="text-3xl font-semibold tabular-nums tracking-tight text-focus">{ruledOut}</dd>
          </div>
        </dl>
      </div>

      <ol className="relative mt-6 grid gap-4" aria-live="polite" aria-relevant="additions">
        <span aria-hidden className="absolute bottom-3 left-[15px] top-3 w-0.5 rounded-full bg-gradient-to-b from-brand-fill via-[#8a3ffc] to-[#e8457d] opacity-30" />
        {steps.map((s, i) => {
          const kind = kindOf(s);
          const Icon = ICON[kind];
          const last = i === steps.length - 1 && running;
          return (
            <li key={i} className="rise relative flex items-start gap-4">
              <span
                aria-hidden
                className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full ${
                  kind === "reject"
                    ? "bg-focus-soft text-focus"
                    : kind === "pay"
                      ? "bg-[#ffc439] text-[#003087]"
                      : last
                        ? "bg-brand-fill text-on-brand"
                        : "bg-surface text-foreground"
                } ${last ? "motion-safe:animate-pulse" : ""}`}
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>
              <span className={`pt-1 text-[16px] leading-snug ${kind === "reject" ? "text-foreground" : "text-muted"}`}>
                <span className="sr-only">{kind === "reject" ? "Ruled out: " : ""}</span>
                {s}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
