import "server-only";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Recording aid for the demo video, local development only. When SHELFCHECK_REPLAY_DIR is set
 * (never in production), the first real agent run for a given request is saved, and later runs of
 * the same request replay it with its original timing instead of calling the model again. Retakes
 * of the video then cost nothing. PayPal calls are never replayed (see the routes).
 */
const DIR = process.env.NODE_ENV === "production" ? undefined : process.env.SHELFCHECK_REPLAY_DIR;

type Timed<E> = { at: number; e: E };

export function replayStore<E>(kind: string, input: unknown) {
  if (!DIR) return null;
  const key = createHash("sha256").update(kind + JSON.stringify(input)).digest("hex").slice(0, 16);
  const file = path.join(DIR, `${kind}-${key}.json`);
  // Fall back to a run saved by hand (e.g. "shop-default.json") when this exact request was never recorded.
  const req = (input as { request?: unknown } | null)?.request;
  const slug = typeof req === "string" ? req.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "";
  const src = [file, slug && path.join(DIR, `${kind}-${slug}.json`), path.join(DIR, `${kind}-default.json`)].find((f) => f && fs.existsSync(f)) || null;
  const cached: Timed<E>[] | null = src ? JSON.parse(fs.readFileSync(src, "utf8")) : null;
  const log: Timed<E>[] = [];
  const t0 = Date.now();
  return {
    cached,
    /** Pass-through emit that also records each event and when it happened. */
    tap(emit: (e: E) => void) {
      return (e: E) => {
        log.push({ at: Date.now() - t0, e });
        emit(e);
      };
    },
    save() {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(log));
    },
    /** Re-emit a saved run with its original pacing; `fix` can refresh live parts (e.g. a new PayPal order). */
    async replay(emit: (e: E) => void, fix: (e: E) => Promise<E> = async (e) => e, signal?: AbortSignal) {
      const start = Date.now();
      for (const { at, e } of cached ?? []) {
        const wait = at - (Date.now() - start);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (signal?.aborted) return;
        emit(await fix(e));
      }
    },
  };
}
