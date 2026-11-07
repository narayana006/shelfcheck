import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { CATALOG, getProduct } from "./catalog";
import { priceCart } from "./paypal";
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
- Call check_fit on every product in the current routine first.
- Keep products that still fit. Only swap a product if it is now "caution", or clearly worse than an alternative in the same category for the new scan.
- For a swap, search that category and check_fit candidates. Never choose a "caution" product.
- Keep the refill price close: the new total may be at most 15% above the current total.
- Call propose_routine once with the full routine (swapped and kept products). If nothing needs to change, propose the same routine with no swaps and say so.
- Each swap reason is one sentence naming the new scan's concern and score and the ingredient that matters.`;

export async function runRecheck(current: RoutineLine[], scores: ConcernScore[], emit: (e: RecheckEvent) => void): Promise<RecheckResult> {
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
      return JSON.stringify(
        product_ids.map((id) => {
          const p = getProduct(id);
          if (!p) return { id, error: "not in store" };
          const f = fitFor(p, scores);
          if (f.verdict === "caution" && current.some((l) => l.productId === id)) {
            emit({ type: "step", text: `${p.brand} ${p.name} no longer fits: ${f.aggravates[0] ?? "poor fit"}` });
          }
          return { id, name: `${p.brand} ${p.name}`, category: p.category, price: p.price, ...f };
        }),
      );
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
        if (fitFor(p, scores).verdict === "caution") {
          emit({ type: "step", text: `Refused ${p.brand} ${p.name}: fails your new skin check` });
          return `${p.name} is "caution" for the new scan. Replace it and call again.`;
        }
      }
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
            return { fromId: a.id, from: `${a.brand} ${a.name}`, toId: b.id, to: `${b.brand} ${b.name}`, reason: s.reason };
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
    tools: [checkFit, searchProducts, proposeRoutine],
    messages: [
      {
        role: "user",
        content: `Current routine: ${JSON.stringify(current.map((l) => ({ product_id: l.productId, quantity: l.quantity })))}\nCurrent refill total: $${oldTotal.toFixed(2)} (limit $${cap.toFixed(2)})\nNew skin scan: ${JSON.stringify(scores)}\nFocus areas now: ${focus.join(", ")}`,
      },
    ],
  });
  for await (const message of runner) {
    if (message.stop_reason === "refusal") throw new Error("The model declined this request.");
    if (result) break;
  }
  const r = result as RecheckResult | null;
  if (!r) throw new Error("The routine check didn't finish. Please try again.");
  return r;
}
