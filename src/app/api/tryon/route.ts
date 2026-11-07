import * as z from "zod/v4";
import { rateLimited, tooMany } from "@/lib/limit";
import { tryOnMakeup, YouCamError } from "@/lib/youcam";

export const runtime = "nodejs";
export const maxDuration = 120;

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const BodySchema = z.object({
  fileId: z.string().min(10).max(400),
  foundation: hex,
  lip: hex.optional(),
});

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Scan your skin first." }, { status: 400 });
  if (rateLimited(request, "tryon", 15)) return tooMany();
  const { fileId, foundation, lip } = parsed.data;
  try {
    return Response.json({ url: await tryOnMakeup(fileId, { foundation, lip }) });
  } catch (e) {
    console.error(e);
    const message = e instanceof YouCamError ? e.userMessage : "The try-on failed. Please try again.";
    return Response.json({ error: message }, { status: 502 });
  }
}
