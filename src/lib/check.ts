import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { findEuAllergens, matchIngredients, scoreFit, type FitResult, type IngredientMatch } from "./ingredients";
import type { ProductRecord } from "./obf";
import { CONCERNS, type ConcernScore } from "./skin";

const MODEL = "claude-opus-5-5";
const client = new Anthropic();

const LabelSchema = z.object({
  readable: z.boolean().describe("False if no ingredient list can be read from the input"),
  product_name: z.string().describe("Product name if visible, else empty"),
  brand: z.string().describe("Brand if visible, else empty"),
  product_type: z.string().describe("e.g. serum, moisturizer, cleanser, sunscreen; empty if unknown"),
  ingredients: z.array(z.string()).describe("Full INCI ingredient list in label order, one entry per ingredient"),
});
type Label = z.infer<typeof LabelSchema>;

const ExplainSchema = z.object({
  headline: z.string().describe("Max 8 words, plain verdict for this person"),
  summary: z.string().describe("2-3 sentences, second person, naming their measured concerns"),
  how_to_use: z.string().describe("One practical sentence on how or when to use it given their skin, or what to pair it with"),
});
export type Explanation = z.infer<typeof ExplainSchema>;

export interface CheckResult {
  product: Omit<Label, "readable"> & { image?: string; barcode?: string };
  source: "barcode" | "label";
  matches: { name: string; label: string; note: string; helps: string[]; caution: string[] }[];
  euAllergens: string[];
  fit: FitResult;
  explanation: Explanation;
}

export class CheckError extends Error {}

async function readLabel(input: { imageBase64?: string; mediaType?: string; text?: string }): Promise<Label> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (input.imageBase64) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: (input.mediaType ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/webp",
        data: input.imageBase64,
      },
    });
  }
  content.push({
    type: "text",
    text: input.text
      ? `Ingredient list as typed by the user:\n${input.text}`
      : "Read the ingredient list from this product label photo. Transcribe ingredients exactly; don't guess at text you can't read.",
  });

  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "low", format: betaZodOutputFormat(LabelSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new CheckError("We couldn't read that label.");
  return res.parsed_output;
}

async function explain(
  label: Label,
  matches: IngredientMatch[],
  euAllergens: string[],
  fit: FitResult,
  scores: ConcernScore[],
) {
  const facts = {
    product: { name: label.product_name, brand: label.brand, type: label.product_type },
    eu_listed_fragrance_allergens: euAllergens,
    verdict: fit.verdict,
    fit_score: fit.fit,
    measured_skin: scores.map((s) => ({ concern: CONCERNS[s.concern], score_out_of_100: s.score })),
    impacts: fit.impacts.map((i) => ({
      concern: CONCERNS[i.concern],
      their_score: i.userScore,
      helped_by: i.helpedBy,
      aggravated_by: i.aggravatedBy,
    })),
    key_ingredients: matches.map((m) => ({ name: m.info.name, note: m.info.note })),
  };

  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: betaZodOutputFormat(ExplainSchema) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system:
      "You explain a skincare product match to a shopper standing in a store. Use only the facts given: the verdict and matches were computed from their measured skin scan (scores out of 100, lower means the concern needs more attention). Be direct and warm, no hype, no medical claims. Never contradict the verdict.",
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });
  if (!res.parsed_output) throw new CheckError("Couldn't explain the result.");
  return res.parsed_output;
}

export async function checkProduct(
  input: { imageBase64?: string; mediaType?: string; text?: string; record?: ProductRecord },
  scores: ConcernScore[],
): Promise<CheckResult> {
  const { record } = input;
  const label: Label = record
    ? { readable: true, product_name: record.name, brand: record.brand, product_type: "", ingredients: record.ingredients }
    : await readLabel(input);
  if (!label.readable || label.ingredients.length === 0) {
    throw new CheckError("We couldn't find an ingredient list. Snap the back of the product, where it says “Ingredients”.");
  }
  const matches = matchIngredients(label.ingredients);
  const euAllergens = findEuAllergens(label.ingredients);
  const fit = scoreFit(matches, scores);
  const explanation = await explain(label, matches, euAllergens, fit, scores);
  return {
    product: {
      product_name: label.product_name,
      brand: label.brand,
      product_type: label.product_type,
      ingredients: label.ingredients,
      image: record?.image,
      barcode: record?.barcode,
    },
    source: record ? "barcode" : "label",
    euAllergens,
    matches: matches.map((m) => ({
      name: m.info.name,
      label: m.label,
      note: m.info.note,
      helps: m.info.helps.map((c) => CONCERNS[c]),
      caution: m.info.caution.map((c) => CONCERNS[c]),
    })),
    fit,
    explanation,
  };
}
