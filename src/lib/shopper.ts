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
}

export type ShopEvent = { type: "step"; text: string } | { type: "cart"; cart: Cart } | { type: "error"; message: string };

const SYSTEM = `You are ShelfCheck's personal skincare shopper.

You know this shopper's skin from a YouCam AI skin scan (scores out of 100; lower means that concern needs more help). Every product in the store has its real ingredient list, and check_fit scores each product against this shopper's measured skin.

How to work:
- Read the request (a budget, a concern, a full routine...). Search the store by category.
- Always run check_fit on candidates before choosing. Never pick a product whose verdict is "caution". Prefer "great", then "good".
- Respect the budget strictly if one is given. One of each category is enough unless asked otherwise.
- For a routine, order it cleanser → serum → moisturizer → sunscreen.
- When the cart is right, call create_checkout once. It prices the cart from the store, creates a PayPal order, and the shopper approves payment themselves.
- Keep each "why" to one sentence that names the shopper's measured concern and the ingredient that addresses it.`;

function fitFor(p: CatalogProduct, scores: ConcernScore[]) {
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

export async function runShopper(request: string, scores: ConcernScore[], emit: (e: ShopEvent) => void): Promise<Cart> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("The server is missing its ANTHROPIC_API_KEY.");
  let cart: Cart | null = null;

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
      emit({ type: "step", text: `Checking ${product_ids.length} ingredient lists against your skin` });
      return JSON.stringify(
        product_ids.map((id) => {
          const p = getProduct(id);
          return p ? { id, name: `${p.brand} ${p.name}`, price: p.price, ...fitFor(p, scores) } : { id, error: "not in store" };
        }),
      );
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
      const items: CartItem[] = [];
      for (const l of lines) {
        const p = getProduct(l.product_id);
        if (!p) return `Product ${l.product_id} is not in the store. Fix the cart and call again.`;
        const f = fitFor(p, scores);
        if (f.verdict === "caution") return `${p.name} is a "caution" match for this shopper. Replace it and call again.`;
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
      emit({ type: "step", text: "Creating your PayPal order" });
      try {
        const cartLines = items.map((i) => ({ productId: i.productId, quantity: i.quantity }));
        const { total } = priceCart(cartLines);
        const orderId = await createOrder(cartLines, "ShelfCheck skin-matched routine");
        cart = { items, total, summary, orderId };
        return `PayPal order ${orderId} created for $${total.toFixed(2)}. The shopper will now approve payment.`;
      } catch (e) {
        return e instanceof PayPalError ? e.message : `PayPal error: ${String(e)}`;
      }
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
    tools: [searchProducts, checkFit, createCheckout],
    messages: [
      {
        role: "user",
        content: `Shopper's request: ${request}\n\nMeasured skin (YouCam): ${JSON.stringify(scores)}\nFocus areas: ${focus.join(", ")}`,
      },
    ],
  });

  for await (const message of runner) {
    if (message.stop_reason === "refusal") throw new Error("The model declined this request.");
    if (cart) break;
  }
  const result = cart as Cart | null;
  if (!result) throw new Error("The shopper couldn't build a cart for that. Try a different request.");
  return result;
}
