import { rateLimited, tooMany } from "@/lib/limit";
import { analyzeSkin, analyzeTone, sampleScores, uploadImage, YouCamError } from "@/lib/youcam";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  // Kill switch for the live YouCam scan (the sample profiles keep the whole app usable).
  if (process.env.YOUCAM_DISABLED === "1") {
    return Response.json(
      { error: "Live skin scans are paused in this demo. Use “Try it with a sample skin” instead." },
      { status: 503 },
    );
  }
  if (process.env.YOUCAM_MOCK === "1") {
    return Response.json({ scores: sampleScores(), tone: { skin: "#c99a7e" }, fileId: null, sample: true });
  }
  if (rateLimited(request, "scan", 8)) return tooMany();

  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof Blob) || image.size === 0) {
    return Response.json({ error: "Please add a selfie." }, { status: 400 });
  }
  if (image.size > MAX_BYTES || !/^image\/(jpeg|png)$/.test(image.type)) {
    return Response.json({ error: "Use a JPG or PNG photo under 10 MB." }, { status: 400 });
  }

  try {
    const fileId = await uploadImage(image);
    // Skin concerns and color tones come from two YouCam models run on the same upload.
    const [scores, tone] = await Promise.all([analyzeSkin(fileId), analyzeTone(fileId).catch(() => null)]);
    return Response.json({ scores, tone, fileId });
  } catch (e) {
    console.error(e);
    const message = e instanceof YouCamError ? e.userMessage : "The skin scan failed. Please try again.";
    return Response.json({ error: message }, { status: 502 });
  }
}
