import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { CATALOG, getProduct, type CatalogProduct } from "./catalog";
import { findEuAllergens, matchIngredients, scoreFit, type Verdict } from "./ingredients";
import { createOrder, priceCart, PayPalError } from "./paypal";
import { CONCERNS, priorities, type ConcernScore } from "./skin";

const MODEL = "claude-opus-5-5";
const client = new Anthropic();

export interface CartItem {
  productId: string;
  brand: string;
  name: string;
  category: string;
  image?: string;
  price: number;
  quantity: number;
  verdict: Verdict;
  why: string;
  allergens: string[];
}

export interface Cart {
  items: CartItem[];
  total: number;
  summary: string;
  /** PayPal sandbox order id, created by the agent, awaiting the shopper's approval. */
  orderId: string;
  /** The agent's proposed refill cadence for this routine (offered after payment). */
  refill?: { intervalWeeks: number; reason: string };
  /** Budget parsed from the request and enforced in code, if one was given. */
  budget: number | null;
  /** Products the fit gate ruled out for this shopper, with the reason. */
  rejected: { name: string; reason: string }[];
}

/** Pull a dollar budget out of the shopper's request ("under $60", "max 45 dollars"). */
export function parseBudget(request: string): number | null {
  const ok = (n: number) => Number.isFinite(n) && n >= 5 && n <= 1000;
  const phrase = String.raw`(?:under|below|max(?:imum)?|budget(?:\s+of)?|less than|up to|no more than|spend)`;
  const re = new RegExp(phrase + String.raw`\s*(\$)?\s*(\d+(?:\.\d{1,2})?)\s*(dollars|usd|bucks)?`, "gi");
  const hits = [...request.matchAll(re)].map((m) => ({
    n: Number(m[2]),
    money: Boolean(m[1] || m[3]),
    // "under 3 products", "less than 10 minutes": a unit word after the number means it isn't money.
    unit: !m[1] && !m[3] && /^\s*[a-z]/i.test(request.slice((m.index ?? 0) + m[0].length)),
  }));
  // A budget phrase with a currency marker wins ("$30 cleanser, routine under $60" -> 60).
  const money = hits.find((h) => h.money && ok(h.n));
  if (money) return money.n;
  const bare = hits.find((h) => !h.unit && ok(h.n));
  if (bare) return bare.n;
  const dollars = [...request.matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)];
  const words = request.match(/(\d+(?:\.\d{1,2})?)\s*(?:dollars|usd|bucks)/i);
  const n = Number(dollars.length === 1 ? dollars[0][1] : (words?.[1] ?? NaN));
  return ok(n) ? n : null;
}

export type ShopEvent = { type: "step"; text: string } | { type: "cart"; cart: Cart } | { type: "error"; message: string };

const SYSTEM = `You are ShelfCheck's personal skincare shopper.

You know this shopper's skin from a YouCam AI skin scan (scores out of 100; lower means that concern needs more help). Every product in the store has its real ingredient list, and check_fit scores each product against this shopper's measured skin.

How to work:
- Read the request (a budget, a concern, a full routine...). Search the store by category.
- Always run check_fit on candidates before choosing. Never pick a product whose verdict is "caution". Prefer "great", then "good".
- Respect the budget strictly if one is given. One of each category is enough unless asked otherwise.
- If the shopper names a product that check_fit marks "caution", do not buy it, even when asked. Say why in your summary, then check out the best-fitting product from the same category instead, so they always get a safe cart to approve or ignore.
- For a routine, order it cleanser → serum → moisturizer → sunscreen.
- When the cart is right, call create_checkout once. It prices the cart from the store, creates a PayPal order, and the shopper approves payment themselves.
- Then call propose_refill once: pick how many weeks until this routine needs refilling, using typical usage per category (cleanser ~10 weeks, serum ~6, moisturizer ~8, sunscreen ~6 with daily use). Refill when the first key product runs out.
- Keep each "why" to one sentence that names the shopper's measured concern and the ingredient that addresses it.`;

export function fitFor(p: CatalogProduct, scores: ConcernScore[]) {
  const matches = matchIngredients(p.ingredients);
  const fit = scoreFit(matches, scores);
  return {
    verdict: fit.verdict,
    fit: fit.fit,
    helps: fit.impacts.filter((i) => i.helpedBy.length).map((i) => `${CONCERNS[i.concern]} (${i.helpedBy.join(", ")})`),
    aggravates: fit.impacts.filter((i) => i.aggravatedBy.length).map((i) => `${CONCERNS[i.concern]} (${i.aggravatedBy.join(", ")})`),
    allergens: findEuAllergens(p.ingredients),
  };
}

export async function runShopper(
  request: string,
  scores: ConcernScore[],
  emit: (e: ShopEvent) => void,
  signal?: AbortSignal,
): Promise<Cart> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("The server is missing its ANTHROPIC_API_KEY.");
  let cart: Cart | null = null;
  let refillDone = false;
  const budget = parseBudget(request);
  const runId = crypto.randomUUID();
  const rejected = new Map<string, { name: string; reason: string }>();

  const searchProducts = betaZodTool({
    name: "search_products",
    description: "List products in the store, optionally by category, with price.",
    inputSchema: z.object({ category: z.enum(["cleanser", "serum", "moisturizer", "sunscreen"]).optional() }),
    run: async ({ category }) => {
      emit({ type: "step", text: category ? `Browsing ${category}s` : "Browsing the store" });
      return JSON.stringify(
        CATALOG.filter((p) => !category || p.category === category).map((p) => ({
          id: p.id,
          brand: p.brand,
          name: p.name,
          category: p.category,
          price: p.price,
        })),
      );
    },
  });

  const checkFit = betaZodTool({
    name: "check_fit",
    description:
      "Score products against this shopper's measured skin: verdict (great/good/neutral/caution), fit score, which concerns each helps or aggravates, and EU-listed fragrance allergens.",
    inputSchema: z.object({ product_ids: z.array(z.string()).min(1).max(12) }),
    run: async ({ product_ids }) => {
      emit({ type: "step", text: `Checking ${product_ids.length} ingredient ${product_ids.length === 1 ? "list" : "lists"} against your skin` });
      const rows = product_ids.map((id) => {
        const p = getProduct(id);
        if (!p) return { id, error: "not in store" };
        const f = fitFor(p, scores);
        if (f.verdict === "caution" && !rejected.has(id)) {
          const reason = f.aggravates[0] ? `aggravates your ${f.aggravates[0]}` : "poor fit for your skin";
          rejected.set(id, { name: `${p.brand} ${p.name}`, reason });
          emit({ type: "step", text: `Ruled out ${p.brand} ${p.name}: ${reason}` });
        }
        return { id, name: `${p.brand} ${p.name}`, price: p.price, ...f };
      });
      const passing = rows.filter((r) => "verdict" in r && r.verdict !== "caution").length;
      // The model thinks for a while after the last check; say what it's doing so the trace never looks frozen.
      emit({
        type: "step",
        text: passing
          ? `Weighing ${passing} ${passing === 1 ? "product" : "products"} that passed on fit and price`
          : "None of these pass your skin check. Looking for safer alternatives",
      });
      return JSON.stringify(rows);
    },
  });

  const createCheckout = betaZodTool({
    name: "create_checkout",
    description: "Create the PayPal order for the final cart. Call once, when the cart is final.",
    inputSchema: z.object({
      lines: z
        .array(z.object({ product_id: z.string(), quantity: z.number().int().min(1).max(3), why: z.string() }))
        .min(1)
        .max(6),
      summary: z.string().describe("One or two sentences on what this routine does for the shopper's measured skin"),
    }),
    run: async ({ lines, summary }) => {
      // The shopper left: never create an order nobody will see.
      if (signal?.aborted) return "Cancelled: the shopper closed the page.";
      if (cart) return `A PayPal order (${cart.orderId}) already exists for this cart. Don't create another.`;
      const items: CartItem[] = [];
      for (const l of lines) {
        const p = getProduct(l.product_id);
        if (!p) return `Product ${l.product_id} is not in the store. Fix the cart and call again.`;
        const f = fitFor(p, scores);
        if (f.verdict === "caution") {
          emit({ type: "step", text: `Checkout refused ${p.brand} ${p.name}: fails your skin check` });
          return `${p.name} is a "caution" match for this shopper. Replace it and call again.`;
        }
        items.push({
          productId: p.id,
          brand: p.brand,
          name: p.name,
          category: p.category,
          image: p.image,
          price: p.price,
          quantity: l.quantity,
          verdict: f.verdict,
          why: l.why,
          allergens: f.allergens,
        });
      }
      try {
        const cartLines = items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
        const { total } = priceCart(cartLines);
        if (budget !== null && total > budget) {
          emit({ type: "step", text: `Checkout refused a $${total.toFixed(2)} cart: over your $${budget.toFixed(2)} budget` });
          return `Cart total $${total.toFixed(2)} is over the shopper's $${budget.toFixed(2)} budget by $${(total - budget).toFixed(2)}. Swap or drop items and call again.`;
        }
        emit({ type: "step", text: "Creating your PayPal order" });
        const orderId = await createOrder(cartLines, "ShelfCheck skin-matched routine", runId);
        cart = { items, total, summary, orderId, budget, rejected: [...rejected.values()] };
        return `PayPal order ${orderId} created for $${total.toFixed(2)}. The shopper will now approve payment.`;
      } catch (e) {
        return e instanceof PayPalError ? e.message : `PayPal error: ${String(e)}`;
      }
    },
  });

  const proposeRefill = betaZodTool({
    name: "propose_refill",
    description: "Propose an automatic refill cadence for the cart you just checked out. Call once, after create_checkout.",
    inputSchema: z.object({
      interval_weeks: z.number().int().min(4).max(16),
      reason: z.string().describe("One sentence: which product runs out first and why this cadence"),
    }),
    run: async ({ interval_weeks, reason }) => {
      if (!cart) return "Call create_checkout first.";
      cart.refill = { intervalWeeks: interval_weeks, reason };
      refillDone = true;
      return "Refill proposal saved. The shopper can opt in with PayPal Subscriptions after paying.";
    },
  });

  const focus = priorities({ id: "", takenAt: "", scores }, 4).map((c) => `${CONCERNS[c.concern]} ${c.score}`);
  emit({ type: "step", text: "Reading your skin scan" });
  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    max_iterations: 14,
    output_config: { effort: "medium" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    tools: [searchProducts, checkFit, createCheckout, proposeRefill],
    messages: [
      {
        role: "user",
        content: `Shopper's request: ${request}\n${budget !== null ? `Budget (enforced at checkout): $${budget.toFixed(2)}\n` : ""}\nMeasured skin (YouCam): ${JSON.stringify(scores)}\nFocus areas: ${focus.join(", ")}`,
      },
    ],
  }, { signal });

  for await (const message of runner) {
    if (message.stop_reason === "refusal") throw new Error("The model declined this request.");
    if (cart && refillDone) break;
  }
  const result = cart as Cart | null;
  if (!result) throw new Error("The shopper couldn't build a cart for that. Try a different request.");
  return result;
}
