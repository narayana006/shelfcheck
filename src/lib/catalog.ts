import data from "@/data/catalog.json";
import { splitIngredients } from "./obf";

export type Category = "cleanser" | "serum" | "moisturizer" | "sunscreen";

export interface CatalogProduct {
  id: string;
  category: Category;
  brand: string;
  name: string;
  /** Illustrative sandbox price in USD. */
  price: number;
  image?: string;
  ingredients: string[];
}

/**
 * Demo store: real products and real ingredient lists (Open Beauty Facts, ODbL),
 * sold through PayPal sandbox at illustrative prices.
 */
export const CATALOG: CatalogProduct[] = (data as (Omit<CatalogProduct, "ingredients"> & { ingredientsText: string })[]).map(
  ({ ingredientsText, ...p }) => ({ ...p, ingredients: splitIngredients(ingredientsText) }),
);

export function getProduct(id: string) {
  return CATALOG.find((p) => p.id === id);
}
