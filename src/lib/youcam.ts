// Server-side client for the YouCam (Perfect Corp) AI APIs.
// Docs: https://docs.perfectcorp.com/reference/ai_skin_analysis (and siblings)

import { CONCERN_KEYS, type Concern, type ConcernScore } from "./skin";

const BASE_URL = process.env.YOUCAM_BASE_URL ?? "https://yce-api-01.makeupar.com/s2s/v2.0";

export class YouCamError extends Error {
  constructor(
    message: string,
    public userMessage: string,
  ) {
    super(message);
  }
}

// YouCam error codes that mean "retake the photo", mapped to advice a user can act on.
const PHOTO_ERRORS: Record<string, string> = {
  error_below_min_image_size: "That photo is too small. Use your phone's front camera at full resolution.",
  error_exceed_max_image_size: "That photo is too large. Try a regular camera photo under 10 MB.",
  error_src_face_too_small: "Hold the camera closer, so your face fills most of the frame.",
  error_face_position_too_small: "Hold the camera closer, so your face fills most of the frame.",
  error_src_face_out_of_bound: "Keep your whole face inside the frame.",
  error_face_position_out_of_boundary: "Keep your whole face inside the frame.",
  error_face_position_invalid: "Center your face in the frame and look straight at the camera.",
  error_lighting_dark: "It's too dark. Face a window or a bright light and try again.",
  error_no_face: "We couldn't find a face. Look straight at the camera.",
  error_large_face_angle: "Face the camera straight on, with your head level and eyes open.",
  error_face_not_forward_facing: "Face the camera straight on, with your head level and eyes open.",
  error_pose: "Face the camera straight on, with your head level and eyes open.",
  error_download_image: "We couldn't load that photo. Please scan again.",
};

function apiKey() {
  const key = process.env.YOUCAM_API_KEY;
  if (!key) throw new YouCamError("YOUCAM_API_KEY is not set", "The server is missing its YouCam API key.");
  return key;
}

function friendly(code: string | undefined, fallback: string) {
  if (code?.startsWith("error_face_angle")) return PHOTO_ERRORS.error_large_face_angle;
  return (code && PHOTO_ERRORS[code]) || fallback;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json", ...init.headers },
  });
  const body = await res.text();
  if (!res.ok) {
    const code = body.match(/error_[a-z_]+/)?.[0];
    if (body.includes("CreditInsufficiency")) {
      throw new YouCamError(`YouCam ${path}: out of credits`, "The demo has used up its YouCam credits for now.");
    }
    throw new YouCamError(
      `YouCam ${path} ${res.status}: ${body.slice(0, 300)}`,
      friendly(code, "The YouCam service had a problem. Please try again."),
    );
  }
  return JSON.parse(body) as T;
}

/** Upload an image once; the returned file id can feed several AI tasks. */
export async function uploadImage(image: Blob): Promise<string> {
  const contentType = image.type || "image/jpeg";
  const init = await call<{
    data: { files: { file_id: string; requests: { method: string; url: string; headers: Record<string, string> }[] }[] };
  }>("/file", {
    method: "POST",
    body: JSON.stringify({
      files: [{ content_type: contentType, file_name: `selfie.${contentType.split("/")[1]}`, file_size: image.size }],
    }),
  });
  const file = init.data.files[0];
  for (const req of file.requests) {
    const put = await fetch(req.url, { method: req.method, headers: req.headers, body: image });
    if (!put.ok) throw new YouCamError(`Upload PUT failed: ${put.status}`, "Uploading your photo failed. Please try again.");
  }
  return file.file_id;
}

interface TaskStatus<R> {
  data: { task_status: "running" | "success" | "error"; error?: string; results?: R };
}

/** Start a YouCam task and poll until it finishes. */
async function runTask<R>(task: string, body: Record<string, unknown>, timeoutMs = 90_000): Promise<R> {
  const started = await call<{ data: { task_id: string } }>(`/task/${task}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const taskId = started.data.task_id;
  const deadline = Date.now() + timeoutMs;
  let delay = 1500;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.4, 5000);
    const { data } = await call<TaskStatus<R>>(`/task/${task}/${taskId}`);
    if (data.task_status === "success") return data.results as R;
    if (data.task_status === "error") {
      throw new YouCamError(
        `${task} failed: ${data.error}`,
        friendly(data.error, "We couldn't process that photo. Try again in good, even light."),
      );
    }
  }
  throw new YouCamError(`${task} timed out`, "This is taking too long. Please try again.");
}

/** AI Skin Analysis: per-concern scores, 0-100 (higher is healthier). */
export async function analyzeSkin(fileId: string): Promise<ConcernScore[]> {
  const results = await runTask<{ output?: { type: string; ui_score: number }[] }>("skin-analysis", {
    src_file_id: fileId,
    dst_actions: CONCERN_KEYS,
    format: "json",
  });
  return (results.output ?? [])
    .filter((o) => (CONCERN_KEYS as string[]).includes(o.type))
    .map((o) => ({ concern: o.type as Concern, score: Math.round(o.ui_score) }));
}

export interface FaceColors {
  skin: string;
  lip?: string;
  eye?: string;
  eyeName?: string;
  hair?: string;
  hairName?: string;
}

/** AI Facial Color Tones Analyzer: measured skin, lip, eye and hair colors. */
export async function analyzeTone(fileId: string): Promise<FaceColors> {
  const results = await runTask<{
    color?: {
      skin_color: string;
      lip_color?: string;
      eye_color?: string;
      eye_color_name?: string;
      hair_color?: string;
      hair_color_name?: string;
    };
  }>("skin-tone-analysis", { src_file_id: fileId, face_angle_strictness_level: "medium" });
  const c = results.color;
  if (!c?.skin_color) throw new YouCamError("No skin color in tone result", "We couldn't read your skin tone. Try brighter light.");
  return {
    skin: c.skin_color,
    lip: c.lip_color,
    eye: c.eye_color,
    eyeName: c.eye_color_name,
    hair: c.hair_color,
    hairName: c.hair_color_name,
  };
}

/** Our concern keys mapped to the AI Skin Simulation parameters. */
export const SIMULATION_KEYS: Partial<Record<Concern, string>> = {
  acne: "acne",
  redness: "redness",
  oiliness: "oiliness",
  pore: "pores",
  texture: "texture",
  wrinkle: "wrinkle",
  age_spot: "spots",
  dark_circle_v2: "dark_circle",
  radiance: "radiance",
};

/** AI Skin Simulation: a natural-looking preview of the face with the given concerns improved. */
export async function simulateSkin(fileId: string, concerns: Concern[], intensity = 0.6): Promise<string> {
  const params: Record<string, number> = {};
  for (const c of concerns) {
    const key = SIMULATION_KEYS[c];
    if (key) params[key] = intensity;
  }
  if (!Object.keys(params).length) throw new YouCamError("No simulatable concerns", "There's nothing to simulate for these concerns.");
  const results = await runTask<{ url?: string }>("skin-simulation", { src_file_id: fileId, ...params });
  if (!results.url) throw new YouCamError("No simulation url", "The preview didn't come back. Please try again.");
  return results.url;
}

export interface TryOnLook {
  foundation: string;
  lip?: string;
}

/** AI Makeup Virtual Try-On: foundation in the matched shade, optionally a lip color. */
export async function tryOnMakeup(fileId: string, look: TryOnLook): Promise<string> {
  const effects: Record<string, unknown>[] = [
    {
      category: "foundation",
      palettes: [{ color: look.foundation, colorIntensity: 55, glowIntensity: 15, coverageIntensity: 55 }],
    },
  ];
  if (look.lip) {
    effects.push({
      category: "lip_color",
      shape: { name: "original" },
      style: { type: "full" },
      palettes: [{ color: look.lip, texture: "satin", colorIntensity: 70 }],
    });
  }
  const results = await runTask<{ url?: string }>("makeup-vto", { src_file_id: fileId, version: "1.0", effects });
  if (!results.url) throw new YouCamError("No VTO url", "The try-on didn't come back. Please try again.");
  return results.url;
}

/** Realistic sample result for building and demoing before a YouCam key is available. */
export function sampleScores(): ConcernScore[] {
  const sample: Record<Concern, number> = {
    acne: 58,
    redness: 49,
    oiliness: 62,
    moisture: 71,
    pore: 54,
    texture: 66,
    wrinkle: 82,
    age_spot: 74,
    dark_circle_v2: 61,
    radiance: 68,
    firmness: 85,
  };
  return CONCERN_KEYS.map((c) => ({ concern: c, score: sample[c] }));
}
