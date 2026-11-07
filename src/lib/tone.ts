/**
 * Shade matching from the skin color YouCam measures. Pure color math (sRGB → CIELAB),
 * so it works the same on server and client.
 */

export type Depth = "Fair" | "Light" | "Medium" | "Tan" | "Deep";
export type Undertone = "Cool" | "Neutral" | "Warm";

export interface ShadeProfile {
  skin: string;
  depth: Depth;
  undertone: Undertone;
  /** Foundation color to try on: the measured skin color, very lightly evened out. */
  foundation: string;
  lips: { name: string; color: string }[];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function rgbToHex(rgb: number[]) {
  return "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
}

export function hexToLab(hex: string): { L: number; a: number; b: number } {
  const lin = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = lin;
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return { L: 116 * f(y) - 16, a: 500 * (f(x) - f(y)), b: 200 * (f(y) - f(z)) };
}

function depthOf(L: number): Depth {
  if (L >= 72) return "Fair";
  if (L >= 64) return "Light";
  if (L >= 54) return "Medium";
  if (L >= 42) return "Tan";
  return "Deep";
}

/** Hue angle of skin in the a*b* plane: lower = pinker (cool), higher = more golden (warm). */
function undertoneOf(a: number, b: number): Undertone {
  const hue = (Math.atan2(b, a) * 180) / Math.PI;
  if (hue < 52) return "Cool";
  if (hue > 62) return "Warm";
  return "Neutral";
}

const LIPS: Record<Undertone, { name: string; color: string }[]> = {
  Cool: [
    { name: "Rosewood", color: "#A4505F" },
    { name: "Berry", color: "#8E2C4E" },
    { name: "Blue red", color: "#B0213A" },
  ],
  Neutral: [
    { name: "Mauve nude", color: "#A86A6A" },
    { name: "Dusty rose", color: "#B5626B" },
    { name: "True red", color: "#B3262E" },
  ],
  Warm: [
    { name: "Terracotta", color: "#B05A43" },
    { name: "Coral", color: "#D0614F" },
    { name: "Brick red", color: "#9C3426" },
  ],
};

export function shadeProfile(skinHex: string): ShadeProfile {
  const { L, a, b } = hexToLab(skinHex);
  const undertone = undertoneOf(a, b);
  // Foundation evens out redness a touch; keep depth so the try-on looks like the wearer.
  const rgb = hexToRgb(skinHex);
  const foundation = rgbToHex([rgb[0] - 2, rgb[1] + 2, rgb[2] + 1]);
  return { skin: skinHex, depth: depthOf(L), undertone, foundation, lips: LIPS[undertone] };
}
