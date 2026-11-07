import * as z from "zod/v4";
import { CONCERN_KEYS } from "./skin";

/** A skin scan: at most one score per concern (bounds the prompt the agent receives). */
export const ScoresSchema = z
  .array(z.object({ concern: z.enum(CONCERN_KEYS), score: z.number().min(0).max(100) }))
  .min(1)
  .max(CONCERN_KEYS.length)
  .refine((s) => new Set(s.map((x) => x.concern)).size === s.length, "Duplicate concern.");
