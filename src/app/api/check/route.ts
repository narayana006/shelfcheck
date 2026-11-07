import * as z from "zod/v4";
import { CheckError, checkProduct } from "@/lib/check";
import { rateLimited, tooMany } from "@/lib/limit";
import { lookupBarcode } from "@/lib/obf";
import { CONCERN_KEYS } from "@/lib/skin";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z
  .object({
    barcode: z
      .string()
      .regex(/^\d{8,14}$/)
      .optional(),
    image: z
      .string()
      .regex(/^data:image\/(jpeg|png|webp);base64,/)
      .max(14_000_000)
      .optional(),
    text: z.string().min(3).max(5000).optional(),
    scores: z.array(z.object({ concern: z.enum(CONCERN_KEYS), score: z.number().min(0).max(100) })).min(1),
  })
  .refine((b) => b.barcode || b.image || b.text, "Scan a barcode, snap the label or paste the ingredients.");

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "The server is missing its ANTHROPIC_API_KEY." }, { status: 500 });
  }
  if (rateLimited(request, "check", 30)) return tooMany();

  const { barcode, image, text, scores } = parsed.data;
  try {
    if (barcode) {
      const record = await lookupBarcode(barcode);
      if (!record || record.ingredients.length === 0) {
        return Response.json(
          { error: "This product isn't in Open Beauty Facts with ingredients yet. Snap the ingredient list instead.", notFound: true },
          { status: 404 },
        );
      }
      return Response.json(await checkProduct({ record }, scores));
    }
    const [, mediaType, imageBase64] = image?.match(/^data:(image\/\w+);base64,(.*)$/) ?? [];
    return Response.json(await checkProduct({ imageBase64, mediaType, text }, scores));
  } catch (e) {
    console.error(e);
    const message = e instanceof CheckError ? e.message : "Checking the product failed. Please try again.";
    return Response.json({ error: message }, { status: 502 });
  }
}
