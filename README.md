# ShelfCheck

**Will this product actually work for *my* skin?**

People don't think about their skin in the abstract. They think about it standing in a store aisle, holding a $40 serum. ShelfCheck answers that moment with data about *your* face, not a generic skin type quiz.

1. **Scan your skin once.** One selfie runs **YouCam AI Skin Analysis** (11 measured concerns) and the **YouCam Facial Color Tones Analyzer** (measured skin color) on the same upload.
2. **Scan any product's barcode.** ShelfCheck pulls the real ingredient list from **Open Beauty Facts**, flags the **26 EU-listed fragrance allergens**, and scores the product against *your* measured concerns: Great fit, Good fit, Neutral or Think twice. No barcode match? Snap or paste the ingredient list.
3. **See it working.** For a good match, **YouCam AI Skin Simulation** shows your own face with the concerns that product targets improved, in a before/after slider.
4. **Find your shade and try it on.** Your measured skin color becomes a depth + undertone shade match and lip colors that suit you, applied to your selfie with **YouCam AI Makeup Virtual Try-On**. Skin AI and VTO, working as one.
5. **Let the shopper buy it for you.** Tell ShelfCheck's agent "build me a routine under $60". It searches the store, checks every ingredient list against your scan, refuses anything that would aggravate your weak spots, builds the cart within budget and **creates a PayPal order**. You approve the payment in PayPal Checkout; nothing is charged without you.
6. **Track whether it's working.** Rescan weekly; ShelfCheck charts every concern over time.

## How YouCam powers it

| Step | YouCam API |
|---|---|
| Upload selfie | `POST /s2s/v2.0/file` → pre-signed `PUT` |
| Analyze | `POST /s2s/v2.0/task/skin-analysis` with 11 `dst_actions` |
| Results | `GET /s2s/v2.0/task/skin-analysis/{task_id}` (polled with backoff) → `ui_score` per concern |
| Shade | `POST /s2s/v2.0/task/skin-tone-analysis` → measured `skin_color` → CIELAB depth + undertone |
| Goal preview | `POST /s2s/v2.0/task/skin-simulation` with the user's focus concerns |
| Try-on | `POST /s2s/v2.0/task/makeup-vto` with `foundation` (matched shade) + `lip_color` |

One upload feeds all four models (the `file_id` is reused), so a scan costs the user one photo.

YouCam's per-concern scores drive the whole product. Each concern is weighted by how much *this person* needs help with it (`100 − score`), so a dark-spot serum ranks high for someone whose dark-spot score is low and barely registers for someone else. Photo problems YouCam reports (too dark, face too small, out of frame) are turned into specific retake advice.

## How PayPal powers checkout

| Step | PayPal |
|---|---|
| Agent finalizes the cart | `create_checkout` tool → **Orders v2 `POST /v2/checkout/orders`** via `@paypal/paypal-server-sdk`, with line items, SKUs and an item-total breakdown priced from the server catalog |
| Shopper approves | **PayPal JS SDK Buttons** (`@paypal/react-paypal-js`) open the order the agent created |
| Payment | **Orders v2 capture** on approval; the receipt shows capture id and amount |

The agent can propose and prepare a purchase, but only the shopper can approve it: agentic commerce with a human in the loop. Prices are always recomputed on the server; the client never sends amounts. Runs against the PayPal **sandbox** (demo store, illustrative prices).

## How the match works

- **Product data:** barcode → Open Beauty Facts ingredient list. Otherwise a vision model transcribes the INCI list from a label photo, or the user pastes it.
- **EU allergens:** the 26 fragrance allergens of EU Regulation 1223/2009 Annex III are detected by exact name and shown separately.
- **Matching is deterministic:** `src/lib/ingredients.ts` is a curated table of ~27 ingredient families (niacinamide, retinoids, AHAs/BHAs, vitamin C, ceramides, azelaic and tranexamic acid, SPF filters, comedogenic oils, fragrance, drying alcohols…) with the concerns each helps or aggravates. `scoreFit()` combines these with the user's YouCam scores into a fit score and verdict.
- **Explanation:** the model writes a short, personal summary from those computed facts only, and never overrides the verdict.

## Privacy

Selfies are sent to YouCam for analysis and are not stored on ShelfCheck's server. Scan history, checks and a small copy of the selfie (for before/after views) stay in the browser's local storage on the user's device. Public demo endpoints are rate-limited per visitor so they can't drain API credits.

## Run locally

Requires Node 20+.

```bash
cp .env.example .env.local   # add YOUCAM_API_KEY, ANTHROPIC_API_KEY, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET (sandbox)
npm install
npm run dev
```

Open http://localhost:3000 on your phone (same Wi-Fi) or desktop. Set `YOUCAM_MOCK=1` to use built-in sample skin results without a YouCam key; the UI labels them as sample data.

## Project structure

- `src/lib/youcam.ts`: YouCam client: one upload, then skin analysis, tone, simulation and makeup try-on tasks with polling and error mapping
- `src/lib/tone.ts`: shade matching (sRGB → CIELAB, depth and undertone)
- `src/lib/obf.ts`: Open Beauty Facts barcode lookup
- `src/lib/ingredients.ts`: ingredient knowledge base and fit scoring
- `src/lib/check.ts`: label reading and explanation
- `src/lib/shopper.ts`: the shopping agent (Claude tool use: search, check fit, create PayPal order)
- `src/lib/paypal.ts`: PayPal Orders v2 (create, capture) with server-side pricing
- `src/data/catalog.json`: demo store, 24 real products with Open Beauty Facts ingredient lists
- `src/app/api/{scan,check,simulate,tryon,shop,paypal/*}`: server routes; API keys never reach the browser
- `src/components/`: mobile-first UI (My skin, Check, Shop, Progress)

## License

MIT
