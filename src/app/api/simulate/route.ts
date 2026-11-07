import * as z from "zod/v4";
import { rateLimited, tooMany } from "@/lib/limit";
import { CONCERN_KEYS } from "@/lib/skin";
import { simulateSkin, YouCamError } from "@/lib/youcam";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  fileId: z.string().min(10).max(400),
  concerns: z.array(z.enum(CONCERN_KEYS)).min(1).max(4),
});

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Scan your skin first." }, { status: 400 });
  if (rateLimited(request, "simulate", 10)) return tooMany();
  try {
    return Response.json({ url: await simulateSkin(parsed.data.fileId, parsed.data.concerns) });
  } catch (e) {
    console.error(e);
    const message = e instanceof YouCamError ? e.userMessage : "The preview failed. Please try again.";
    return Response.json({ error: message }, { status: 502 });
  }
}
