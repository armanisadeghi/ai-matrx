# Prompt for the aidream agent — persist the per-image inventory into `web.snapshot.images`

Copy-paste the following to an agent working in `/Users/armanisadeghi/code/aidream`:

---

The marketing crawler currently persists only aggregate image counts into the `web.snapshot.images` jsonb column: `{"count": <int>, "missing_alt": <int>}`. The frontend (matrx-frontend) has already shipped a per-image inventory renderer and per-image desired-alt editing, but it has nothing to render because the crawler throws the actual `<img>` records away. Your job: make the scraper persist the real per-image inventory.

**Target shape for `web.snapshot.images` (jsonb):**

```json
{
  "count": 14,
  "missing_alt": 5,
  "items": [
    {
      "src": "https://example.com/assets/hero.webp",
      "alt": "Team photo",
      "width": 1200,
      "height": 630,
      "loading": "lazy",
      "title": "Our team"
    }
  ]
}
```

Rules:

- Keep `count` and `missing_alt` exactly as they are today (they must keep counting ALL images on the page, not just the persisted items).
- Add `items`: an array of one record per `<img>` element, in document order, **capped at ~100 items** (drop the tail beyond the cap; `count` still reflects the true total).
- Per-item fields — all optional, include only what the element actually has:
  - `src` (string) — the resolved image URL (absolute preferred; the raw attribute value is acceptable). Include `srcset`-only images by their first candidate URL if convenient, otherwise skip.
  - `alt` (string) — the alt attribute value. **Distinguish absent from empty**: omit the key (or emit `null`) when the attribute is missing; emit `""` when it is explicitly empty (decorative image).
  - `width` / `height` (numbers) — from the width/height attributes when numeric.
  - `loading` (string) — the `loading` attribute (`"lazy"` / `"eager"`) when present.
  - `title` (string) — the `title` attribute when present.
- No other structural changes to the snapshot row; this is purely additive inside the existing `images` jsonb.

**The FE is already inventory-ready** — `features/marketing/lib/snapshot-content.ts#parseSnapshotImages` in matrx-frontend parses `images.items` (it also tolerates an `images.images` key) with every field optional, and `ContentStats` on the page workspace renders the expandable per-image list with desired-alt editing the moment `items` appears in fresh snapshots. No FE work is needed; just start persisting the data and re-crawl a page to verify the list renders at `/marketing` → site → page workspace → Content stats card.

Find the code that computes the existing `count` / `missing_alt` pair (it already walks the `<img>` elements) and extend it to emit the capped `items` array in the same pass — do not add a second DOM walk or a separate pipeline stage.
