// Product lookup by barcode from Open Beauty Facts (open database, ODbL).
// https://world.openbeautyfacts.org/data

export interface ProductRecord {
  barcode: string;
  name: string;
  brand: string;
  image?: string;
  ingredients: string[];
}

/** Split an INCI string on top-level commas (ignoring commas inside parentheses). */
export function splitIngredients(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text.replace(/\s+/g, " ")) {
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if ((ch === "," || ch === ";") && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/\.$/, "")).filter((s) => s.length > 1);
}

export async function lookupBarcode(barcode: string): Promise<ProductRecord | null> {
  const fields = "product_name,product_name_en,brands,ingredients_text,ingredients_text_en,image_front_small_url";
  const res = await fetch(`https://world.openbeautyfacts.org/api/v2/product/${barcode}.json?fields=${fields}`, {
    headers: { "User-Agent": "ShelfCheck/1.0 (hackathon demo)" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { status?: number; product?: Record<string, string> };
  const p = json.product;
  if (!json.status || !p) return null;
  const text = p.ingredients_text_en || p.ingredients_text || "";
  return {
    barcode,
    name: p.product_name_en || p.product_name || "",
    brand: (p.brands || "").split(",")[0].trim(),
    image: p.image_front_small_url,
    ingredients: text ? splitIngredients(text) : [],
  };
}
