import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { CATALOG, getProduct } from "./catalog";
import { priceCart } from "./paypal";
import { refillStatus } from "./paypal-toolkit";
import { fitFor } from "./shopper";
import { CONCERNS, priorities, type ConcernScore } from "./skin";

const MODEL = "claude-opus-5-5";
const client = new Anthropic();

export interface RoutineLine {
  productId: string;
  quantity: number;
}

export interface Swap {
  fromId: string;
  from: string;
  toId: string;
  to: string;
  reason: string;
  /** The replacement's catalog details, so the client can update the saved routine. */
  toItem: { productId: string; brand: string; name: string; category: string; price: number; image?: string };
}

export interface RecheckResult {
  lines: RoutineLine[];
  swaps: Swap[];
  oldTotal: number;
  newTotal: number;
  summary: string;
}

export type RecheckEvent = { type: "step"; text: string } | { type: "result"; result: RecheckResult } | { type: "error"; message: string };

const SYSTEM = `You are ShelfCheck's routine keeper. A shopper has a skincare routine on automatic refill. They just rescanned their skin, and before the next refill ships you re-check every product against the new scan.

How to work:
- If read_refill_in_paypal is available, call it first: it reads the live refill from PayPal (status, next bill date, price per refill). If the refill isn't ACTIVE, say so in your summary and propose the current routine unchanged.
- Call check_fit on every product in the current routine.
- Keep products that still fit. Only swap a product if it is now "caution", was excluded because the shopper reacted to it, or is clearly worse than an alternative in the same category for the new scan.
- Excluded products must be replaced with another product from the same category.
- For a swap, search that category and check_fit candidates. Never choose a "caution" product.
- Keep the refill price close: the new total may be at most 15% above the current total.
- Call propose_routine once with the full routine (swapped and kept products). If nothing needs to change, propose the same routine with no swaps and say so.
- Each swap reason is one sentence naming the new scan's concern and score and the ingredient that matters.`;

/** The trace line for the refill as PayPal reports it. */
export function paypalSays(s: Awaited<ReturnType<typeof refillStatus>>) {
  const when = s.nextBilling ? new Date(s.nextBilling).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "not scheduled";
  const price = s.pricePerRefill !== null ? `$${s.pricePerRefill.toFixed(2)}` : "unknown price";
  return `PayPal says: refill ${s.status.toLowerCase()}, next bill ${when}, ${price}${s.everyWeeks ? ` every ${s.everyWeeks} weeks` : ""}`;
}

export async function runRecheck(
  current: RoutineLine[],
  scores: ConcernScore[],
  emit: (e: RecheckEvent) => void,
  excludeIds: string[] = [],
  signal?: AbortSignal,
  subscriptionId?: string,
): Promise<RecheckResult> {
  const excluded = new Set(excludeIds);
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("The server is missing its ANTHROPIC_API_KEY.");
  const { total: oldTotal } = priceCart(current);
  const cap = Math.round(oldTotal * 1.15 * 100) / 100;
  let result: RecheckResult | null = null;

  const checkFit = betaZodTool({
    name: "check_fit",
    description: "Score products against the shopper's NEW skin scan: verdict, fit score, concerns helped or aggravated.",
    inputSchema: z.object({ product_ids: z.array(z.string()).min(1).max(12) }),
    run: async ({ product_ids }) => {
      emit({ type: "step", text: `Re-checking ${product_ids.length} products against your new scan` });
      const out = JSON.stringify(
        product_ids.map((id) => {
          const p = getProduct(id);
          if (!p) return { id, error: "not in store" };
          if (excluded.has(id)) return { id, name: `${p.brand} ${p.name}`, category: p.category, excluded: "shopper reacted to it and was refunded" };
          const f = fitFor(p, scores);
          if (f.verdict === "caution" && current.some((l) => l.productId === id)) {
            emit({ type: "step", text: `${p.brand} ${p.name} no longer fits: ${f.aggravates[0] ?? "poor fit"}` });
          }
          return { id, name: `${p.brand} ${p.name}`, category: p.category, price: p.price, ...f };
        }),
      );
      emit({ type: "step", text: "Weighing the options on fit and price" });
      return out;
    },
  });

  // PayPal Agent Toolkit (read-only): the refill as PayPal sees it.
  const readRefill = betaZodTool({
    name: "read_refill_in_paypal",
    description:
      "Read this shopper's refill subscription live from PayPal with the PayPal Agent Toolkit: status, next billing date, last payment, price per refill and interval.",
    inputSchema: z.object({}),
    run: async () => {
      emit({ type: "step", text: "Reading your refill in PayPal" });
      try {
        const s = await refillStatus(subscriptionId!);
        emit({ type: "step", text: paypalSays(s) });
        return JSON.stringify(s);
      } catch (e) {
        emit({ type: "step", text: "Couldn't reach PayPal for the refill details. Checking the routine anyway" });
        return `PayPal lookup failed: ${e instanceof Error ? e.message : String(e)}. Continue with the routine check.`;
      }
    },
  });

  const searchProducts = betaZodTool({
    name: "search_products",
    description: "List store products in a category, with price.",
    inputSchema: z.object({ category: z.enum(["cleanser", "serum", "moisturizer", "sunscreen"]) }),
    run: async ({ category }) => {
      emit({ type: "step", text: `Looking for a better ${category}` });
      return JSON.stringify(
        CATALOG.filter((p) => p.category === category).map((p) => ({ id: p.id, name: `${p.brand} ${p.name}`, price: p.price })),
      );
    },
  });

  const proposeRoutine = betaZodTool({
    name: "propose_routine",
    description: "Propose the updated routine for the next refill. Call once.",
    inputSchema: z.object({
      lines: z.array(z.object({ product_id: z.string(), quantity: z.number().int().min(1).max(3) })).min(1).max(6),
      swaps: z.array(z.object({ from_id: z.string(), to_id: z.string(), reason: z.string() })).max(6),
      summary: z.string().describe("One or two sentences for the shopper"),
    }),
    run: async ({ lines, swaps, summary }) => {
      for (const l of lines) {
        const p = getProduct(l.product_id);
        if (!p) return `${l.product_id} is not in the store. Fix and call again.`;
        if (excluded.has(p.id)) {
          emit({ type: "step", text: `Refused ${p.brand} ${p.name}: you reacted to it` });
          return `${p.name} was refunded because the shopper reacted to it. Replace it and call again.`;
        }
        if (fitFor(p, scores).verdict === "caution") {
          emit({ type: "step", text: `Refused ${p.brand} ${p.name}: fails your new skin check` });
          return `${p.name} is "caution" for the new scan. Replace it and call again.`;
        }
      }
      // Every step of the routine stays covered: the refill can't silently drop a category.
      const categoriesNow = new Set(lines.map((l) => getProduct(l.product_id)!.category));
      const missing = [...new Set(current.map((l) => getProduct(l.productId)?.category).filter(Boolean))].filter((c) => !categoriesNow.has(c!));
      if (missing.length) return `The routine must still include a ${missing.join(" and a ")}. Fix and call again.`;
      // The swap list must describe exactly what changed, so the screen and PayPal never disagree.
      const before = new Set(current.map((l) => l.productId));
      const after = new Set(lines.map((l) => l.product_id));
      const removed = [...before].filter((id) => !after.has(id));
      const added = [...after].filter((id) => !before.has(id));
      const swapsOk =
        swaps.length === removed.length &&
        swaps.every((s) => before.has(s.from_id) && !after.has(s.from_id) && after.has(s.to_id) && !before.has(s.to_id)) &&
        added.every((id) => swaps.some((s) => s.to_id === id));
      if (!swapsOk) return "The swaps list must name exactly each removed product and its replacement. Fix and call again.";
      const newLines = lines.map((l) => ({ productId: l.product_id, quantity: l.quantity }));
      const { total } = priceCart(newLines);
      if (total > cap) {
        emit({ type: "step", text: `Refused a $${total.toFixed(2)} refill: over the $${cap.toFixed(2)} limit` });
        return `New total $${total.toFixed(2)} exceeds the $${cap.toFixed(2)} limit. Choose cheaper swaps and call again.`;
      }
      result = {
        lines: newLines,
        swaps: swaps
          .filter((s) => getProduct(s.from_id) && getProduct(s.to_id))
          .map((s) => {
            const a = getProduct(s.from_id)!;
            const b = getProduct(s.to_id)!;
            return {
              fromId: a.id,
              from: `${a.brand} ${a.name}`,
              toId: b.id,
              to: `${b.brand} ${b.name}`,
              reason: s.reason,
              toItem: { productId: b.id, brand: b.brand, name: b.name, category: b.category, price: b.price, image: b.image },
            };
          }),
        oldTotal,
        newTotal: total,
        summary,
      };
      return "Proposal saved. The shopper will approve any change in PayPal.";
    },
  });

  const focus = priorities({ id: "", takenAt: "", scores }, 4).map((c) => `${CONCERNS[c.concern]} ${c.score}`);
  emit({ type: "step", text: "Reading your new skin scan" });
  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    max_iterations: 12,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    tools: subscriptionId ? [readRefill, checkFit, searchProducts, proposeRoutine] : [checkFit, searchProducts, proposeRoutine],
    messages: [
      {
        role: "user",
        content: `Current routine: ${JSON.stringify(current.map((l) => ({ product_id: l.productId, quantity: l.quantity })))}\n${excluded.size ? `Excluded (shopper reacted, refunded; must be replaced): ${JSON.stringify([...excluded])}\n` : ""}Current refill total: $${oldTotal.toFixed(2)} (limit $${cap.toFixed(2)})\nNew skin scan: ${JSON.stringify(scores)}\nFocus areas now: ${focus.join(", ")}`,
      },
    ],
  }, { signal });
  for await (const message of runner) {
    if (message.stop_reason === "refusal") throw new Error("The model declined this request.");
    if (result) break;
  }
  const r = result as RecheckResult | null;
  if (!r) throw new Error("The routine check didn't finish. Please try again.");
  return r;
}
