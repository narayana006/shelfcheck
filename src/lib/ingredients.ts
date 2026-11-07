import type { Concern, ConcernScore } from "./skin";

/**
 * Curated, conservative map of common cosmetic ingredients to the skin concerns
 * they are generally known to help or aggravate. Matching against this table is
 * deterministic; the LLM only reads the label and explains the result.
 */
export interface IngredientInfo {
  key: string;
  name: string;
  aliases: string[];
  helps: Concern[];
  caution: Concern[];
  note: string;
}

export const INGREDIENTS: IngredientInfo[] = [
  { key: "niacinamide", name: "Niacinamide", aliases: ["niacinamide", "nicotinamide"], helps: ["redness", "oiliness", "pore", "age_spot", "texture"], caution: [], note: "Calms redness, regulates oil and evens tone." },
  { key: "salicylic", name: "Salicylic acid (BHA)", aliases: ["salicylic acid", "betaine salicylate", "willow bark"], helps: ["acne", "pore", "oiliness", "texture"], caution: ["moisture"], note: "Clears inside pores; can be drying." },
  { key: "benzoyl", name: "Benzoyl peroxide", aliases: ["benzoyl peroxide"], helps: ["acne"], caution: ["moisture", "redness"], note: "Kills acne bacteria; often drying and irritating." },
  { key: "aha", name: "AHA exfoliant", aliases: ["glycolic acid", "lactic acid", "mandelic acid", "malic acid"], helps: ["texture", "radiance", "age_spot"], caution: ["redness"], note: "Smooths and brightens; can sting reactive skin." },
  { key: "retinoid", name: "Retinoid", aliases: ["retinol", "retinal", "retinaldehyde", "retinyl palmitate", "retinyl retinoate", "hydroxypinacolone retinoate"], helps: ["wrinkle", "texture", "acne", "age_spot", "firmness"], caution: ["redness", "moisture"], note: "Strongest evidence for lines and texture; start slowly." },
  { key: "bakuchiol", name: "Bakuchiol", aliases: ["bakuchiol"], helps: ["wrinkle", "texture", "firmness"], caution: [], note: "Gentler retinol alternative." },
  { key: "vitc", name: "Vitamin C", aliases: ["ascorbic acid", "ascorbyl glucoside", "sodium ascorbyl phosphate", "magnesium ascorbyl phosphate", "ethyl ascorbic acid", "3-o-ethyl ascorbic acid", "tetrahexyldecyl ascorbate"], helps: ["radiance", "age_spot"], caution: [], note: "Brightens and fades spots." },
  { key: "ha", name: "Hyaluronic acid", aliases: ["hyaluronic acid", "sodium hyaluronate", "hydrolyzed hyaluronic acid"], helps: ["moisture"], caution: [], note: "Draws water into skin." },
  { key: "glycerin", name: "Glycerin", aliases: ["glycerin", "glycerol"], helps: ["moisture"], caution: [], note: "Reliable humectant." },
  { key: "ceramide", name: "Ceramides", aliases: ["ceramide"], helps: ["moisture", "redness"], caution: [], note: "Repairs the skin barrier." },
  { key: "panthenol", name: "Panthenol (B5)", aliases: ["panthenol"], helps: ["moisture", "redness"], caution: [], note: "Soothes and hydrates." },
  { key: "centella", name: "Centella asiatica", aliases: ["centella asiatica", "madecassoside", "asiaticoside", "madecassic acid"], helps: ["redness"], caution: [], note: "Soothes irritated skin." },
  { key: "allantoin", name: "Allantoin", aliases: ["allantoin"], helps: ["redness"], caution: [], note: "Soothing." },
  { key: "azelaic", name: "Azelaic acid", aliases: ["azelaic acid", "potassium azeloyl diglycinate"], helps: ["redness", "acne", "age_spot"], caution: [], note: "Targets redness, breakouts and marks." },
  { key: "tranexamic", name: "Tranexamic acid", aliases: ["tranexamic acid"], helps: ["age_spot"], caution: [], note: "Fades dark spots." },
  { key: "arbutin", name: "Arbutin", aliases: ["alpha-arbutin", "alpha arbutin", "arbutin"], helps: ["age_spot"], caution: [], note: "Fades dark spots." },
  { key: "licorice", name: "Licorice root", aliases: ["glycyrrhiza glabra", "dipotassium glycyrrhizate", "licorice"], helps: ["age_spot", "redness"], caution: [], note: "Brightening and calming." },
  { key: "caffeine", name: "Caffeine", aliases: ["caffeine"], helps: ["dark_circle_v2"], caution: [], note: "Temporarily reduces puffiness and darkness." },
  { key: "peptides", name: "Peptides", aliases: ["palmitoyl tripeptide", "palmitoyl tetrapeptide", "palmitoyl pentapeptide", "acetyl hexapeptide", "copper tripeptide", "matrixyl"], helps: ["wrinkle", "firmness"], caution: [], note: "Support firmness." },
  { key: "zinc", name: "Zinc", aliases: ["zinc pca", "zinc gluconate"], helps: ["oiliness", "acne"], caution: [], note: "Helps control oil." },
  { key: "squalane", name: "Squalane", aliases: ["squalane"], helps: ["moisture"], caution: [], note: "Lightweight, non-greasy moisture." },
  { key: "urea", name: "Urea", aliases: ["urea"], helps: ["moisture", "texture"], caution: [], note: "Hydrates and softens rough skin." },
  { key: "clay", name: "Clay", aliases: ["kaolin", "bentonite"], helps: ["oiliness", "pore"], caution: ["moisture"], note: "Absorbs oil." },
  { key: "spf", name: "Sunscreen filters", aliases: ["zinc oxide", "titanium dioxide", "avobenzone", "octinoxate", "homosalate", "octocrylene", "tinosorb", "bis-ethylhexyloxyphenol methoxyphenyl triazine", "uvinul"], helps: ["age_spot", "wrinkle"], caution: [], note: "Prevents new spots and lines." },
  { key: "pore_clog", name: "Pore-clogging oil", aliases: ["cocos nucifera", "coconut oil", "isopropyl myristate", "isopropyl palmitate", "isopropyl isostearate", "myristyl myristate", "algae extract", "laureth-4"], helps: [], caution: ["acne", "pore"], note: "Rated comedogenic; may clog pores." },
  { key: "fragrance", name: "Fragrance", aliases: ["parfum", "fragrance", "linalool", "limonene", "geraniol", "citronellol", "eugenol", "lavandula angustifolia", "essential oil", "citrus aurantium", "peppermint", "mentha piperita"], helps: [], caution: ["redness"], note: "A common trigger for sensitive, red skin." },
  { key: "alcohol", name: "Drying alcohol", aliases: ["alcohol denat", "sd alcohol", "denatured alcohol", "isopropyl alcohol"], helps: [], caution: ["moisture", "redness"], note: "Can dry out and irritate skin." },
];

/**
 * The 26 fragrance allergens the EU Cosmetics Regulation (EC) No 1223/2009, Annex III
 * requires on the label above 0.001% (leave-on) / 0.01% (rinse-off).
 */
export const EU_FRAGRANCE_ALLERGENS: { name: string; aliases: string[] }[] = [
  { name: "Amyl cinnamal", aliases: ["amyl cinnamal"] },
  { name: "Amylcinnamyl alcohol", aliases: ["amylcinnamyl alcohol", "amylcin namyl alcohol"] },
  { name: "Anise alcohol", aliases: ["anise alcohol", "anisyl alcohol"] },
  { name: "Benzyl alcohol", aliases: ["benzyl alcohol"] },
  { name: "Benzyl benzoate", aliases: ["benzyl benzoate"] },
  { name: "Benzyl cinnamate", aliases: ["benzyl cinnamate"] },
  { name: "Benzyl salicylate", aliases: ["benzyl salicylate"] },
  { name: "Butylphenyl methylpropional", aliases: ["butylphenyl methylpropional", "lilial"] },
  { name: "Cinnamal", aliases: ["cinnamal"] },
  { name: "Cinnamyl alcohol", aliases: ["cinnamyl alcohol"] },
  { name: "Citral", aliases: ["citral"] },
  { name: "Citronellol", aliases: ["citronellol"] },
  { name: "Coumarin", aliases: ["coumarin"] },
  { name: "Eugenol", aliases: ["eugenol"] },
  { name: "Farnesol", aliases: ["farnesol"] },
  { name: "Geraniol", aliases: ["geraniol"] },
  { name: "Hexyl cinnamal", aliases: ["hexyl cinnamal"] },
  { name: "Hydroxycitronellal", aliases: ["hydroxycitronellal"] },
  { name: "Hydroxyisohexyl 3-cyclohexene carboxaldehyde", aliases: ["hydroxyisohexyl 3-cyclohexene", "lyral"] },
  { name: "Isoeugenol", aliases: ["isoeugenol"] },
  { name: "Alpha-isomethyl ionone", aliases: ["isomethyl ionone"] },
  { name: "Limonene", aliases: ["limonene"] },
  { name: "Linalool", aliases: ["linalool"] },
  { name: "Methyl 2-octynoate", aliases: ["methyl 2-octynoate", "methyl heptine carbonate"] },
  { name: "Oakmoss extract", aliases: ["evernia prunastri", "oakmoss"] },
  { name: "Treemoss extract", aliases: ["evernia furfuracea", "treemoss"] },
];

export function findEuAllergens(labelIngredients: string[]): string[] {
  const found = new Set<string>();
  for (const raw of labelIngredients) {
    const l = raw.toLowerCase();
    // Longest alias wins, so "hexyl cinnamal" isn't also reported as "cinnamal".
    let best: { name: string; len: number } | null = null;
    for (const a of EU_FRAGRANCE_ALLERGENS) {
      for (const alias of a.aliases) {
        const re = new RegExp(`(^|[^a-z])${alias.replace(/[-]/g, "\\-")}($|[^a-z])`);
        if (re.test(l) && (!best || alias.length > best.len)) best = { name: a.name, len: alias.length };
      }
    }
    if (best) found.add(best.name);
  }
  return [...found];
}

export interface IngredientMatch {
  info: IngredientInfo;
  /** The label text that matched. */
  label: string;
}

export function matchIngredients(labelIngredients: string[]): IngredientMatch[] {
  const matches: IngredientMatch[] = [];
  // Any EU-listed fragrance allergen counts as fragrance, even when "parfum" itself isn't listed.
  const allergens = findEuAllergens(labelIngredients);
  if (allergens.length && !labelIngredients.some((l) => /parfum|fragrance/i.test(l))) {
    const fragrance = INGREDIENTS.find((i) => i.key === "fragrance")!;
    matches.push({ info: fragrance, label: allergens.join(", ") });
  }
  for (const info of INGREDIENTS) {
    if (matches.some((m) => m.info.key === info.key)) continue;
    const label = labelIngredients.find((l) => {
      const n = l.toLowerCase();
      return info.aliases.some((a) => n.includes(a));
    });
    if (label) matches.push({ info, label });
  }
  return matches;
}

export type Verdict = "great" | "good" | "neutral" | "caution";

export interface ConcernImpact {
  concern: Concern;
  userScore: number;
  helpedBy: string[];
  aggravatedBy: string[];
}

export interface FitResult {
  verdict: Verdict;
  /** -100..100, how well the product fits this person's measured needs. */
  fit: number;
  impacts: ConcernImpact[];
}

/**
 * Score a product against a scan. Each concern is weighted by how much the
 * person needs help with it (100 - YouCam score), so a spot-fading serum
 * matters a lot to someone with low dark-spot scores and little to others.
 */
export function scoreFit(matches: IngredientMatch[], scores: ConcernScore[]): FitResult {
  let total = 0;
  let maxPossible = 0;
  const impacts: ConcernImpact[] = [];

  for (const { concern, score } of scores) {
    const need = Math.max(0, 100 - score) / 100;
    const helpedBy = matches.filter((m) => m.info.helps.includes(concern)).map((m) => m.info.name);
    const aggravatedBy = matches.filter((m) => m.info.caution.includes(concern)).map((m) => m.info.name);
    maxPossible += need;
    total += need * (Math.min(helpedBy.length, 2) / 2) - need * Math.min(aggravatedBy.length, 2) * 0.75;
    if (helpedBy.length || aggravatedBy.length) impacts.push({ concern, userScore: score, helpedBy, aggravatedBy });
  }

  const fit = maxPossible ? Math.round(Math.max(-1, Math.min(1, total / (maxPossible * 0.5))) * 100) : 0;
  // Anything that aggravates a concern the person is weak on (< 55) can't be a top pick,
  // however much else it does well.
  const weakAggravated = impacts.filter((i) => i.aggravatedBy.length && i.userScore < 55);
  const strongly = weakAggravated.some((i) => i.aggravatedBy.length >= 2);
  let verdict: Verdict = fit >= 45 ? "great" : fit >= 15 ? "good" : fit <= -15 ? "caution" : "neutral";
  if (weakAggravated.length && (strongly || fit < 40)) verdict = "caution";
  else if (weakAggravated.length && verdict === "great") verdict = "good";

  impacts.sort((a, b) => a.userScore - b.userScore);
  return { verdict, fit, impacts };
}
