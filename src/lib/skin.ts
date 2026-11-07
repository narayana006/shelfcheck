/** Skin concerns ShelfCheck asks YouCam to measure, with display names. */
export const CONCERNS = {
  acne: "Acne",
  redness: "Redness",
  oiliness: "Oiliness",
  moisture: "Hydration",
  pore: "Pores",
  texture: "Texture",
  wrinkle: "Fine lines",
  age_spot: "Dark spots",
  dark_circle_v2: "Dark circles",
  radiance: "Radiance",
  firmness: "Firmness",
} as const;
export type Concern = keyof typeof CONCERNS;
export const CONCERN_KEYS = Object.keys(CONCERNS) as Concern[];

export interface ConcernScore {
  concern: Concern;
  /** YouCam ui_score, 0-100. Higher means healthier skin for that concern. */
  score: number;
}

export interface SkinScan {
  id: string;
  takenAt: string;
  scores: ConcernScore[];
  /** Measured face colors from YouCam's tone analyzer (skin hex etc.). */
  tone?: { skin: string; lip?: string; eyeName?: string; hairName?: string } | null;
  /** YouCam file id of the selfie, reused for try-on and simulation. */
  fileId?: string | null;
  /** Small JPEG data URL of the selfie, kept on-device for before/after views. */
  thumb?: string;
  /** True when the result is built-in sample data rather than a real YouCam scan. */
  sample?: boolean;
}

/** Concerns that need the most attention first (lowest scores). */
export function priorities(scan: SkinScan, n = 3): ConcernScore[] {
  return [...scan.scores].sort((a, b) => a.score - b.score).slice(0, n);
}

export function scoreBand(score: number): "good" | "fair" | "focus" {
  if (score >= 75) return "good";
  if (score >= 55) return "fair";
  return "focus";
}
