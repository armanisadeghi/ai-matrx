# Research Media Gallery — FE / Server Handoff

**Date:** 2026-06-16 · **Server fix shipped:** 2026-06-17
**Route:** `/research/topics/[topicId]/media`
**Example topic (real data):** `08870b47-1c29-497a-be0f-2fe1904fde54` (97 `rs_media` rows)

---

## ✅ RESOLVED (server, 2026-06-17)

The ingest gap is fixed on the AI Dream server. **No FE change was needed** —
the server now writes the exact contract `mediaDimensions.ts` already consumes:

- **EXACT dims** (HTML `width`/`height` attrs, or a byte-probe of the real
  image) → `rs_media.width` / `rs_media.height` columns → FE resolves as `"db"`.
- **APPROXIMATE dims** (CDN/query URL parse) → `metadata.width` /
  `metadata.height` → FE resolves as `"url"` (with `~`).
- `metadata.dim_source` = `html_attr | url_parse | probe`. SVGs/`data:` URLs
  intentionally store no dims (FE heuristics size SVGs).
- Both ingest paths now write `rs_media` through one builder, including the
  **extension/multisource path** (P1) which previously wrote zero rows.
- Existing rows backfilled: 365 URL-recovered platform-wide; example topic
  `08870b47-…` taken from **0/97 → 97/97 resolved** (70 probe + 16 URL + 11 SVG).

Server contract + code: `aidream/research/media/FEATURE.md`. The sections below
are the original problem statement, kept for history.

---

## Problem summary

We built a topic-level **Media Gallery** that groups scraped images into size tiers (icons / graphics / photos) and, within photos, by **aspect ratio** (landscape / square / portrait). **It does not work reliably today** because the data the UI needs (`width`, `height`, and useful `metadata`) is almost never populated at ingest time.

On the example topic, a debug export showed:

| Field | Reality |
|---|---|
| `width` / `height` | **null on 97/97 rows** |
| `metadata` | **`{}` on every row** |
| `thumbnail_url` | **null on every row** |
| `alt_text`, `caption`, `url` | Populated (from HTML scrape) |
| `media_type` | Always `"image"` in sample |
| `is_relevant` | Default `true` |

**Result:** FE aspect-ratio sections were empty (100% `unknown` bucket). ~95/97 items defaulted to the “photo” tier because missing dimensions + non-favicon URL ⇒ “large photo.” Icons/logos (Cleveland Clinic category icons, SVG logos, `?w=128` thumbs) landed alongside hero images.

The FE added **URL-based dimension guessing** and **URL/alt heuristics** as a temporary bridge. That helps but is fragile and should not be the long-term contract.

---

## What we're trying to achieve (product)

1. **Icons & favicons** — tiny UI chrome (favicons, nav icons, SVG logos, avatars).
2. **Graphics** — logos, thumbs, small UI images (roughly &lt;200px max dimension).
3. **Photos** — substantive content images, split by aspect:
   - **Landscape** (wider than tall)
   - **Square** (~1:1)
   - **Portrait** (taller than wide)
4. **Unknown** — only when we truly have no dimensions (videos/docs, or un-probeable URLs).

Users can toggle **relevance** (`is_relevant`) per item; filters for type/relevance/search exist in the toolbar.

---

## Frontend — components & files

| File | Role |
|---|---|
| `app/(core)/research/topics/[topicId]/media/page.tsx` | Route shell → `MediaGallery` |
| `app/(core)/research/topics/[topicId]/media/debug/page.tsx` | Full-topic debug export (new tab) |
| `features/research/components/media/MediaGallery.tsx` | Gallery UI, filters, section rendering |
| `features/research/components/media/mediaCategorization.ts` | Size tier + aspect bucketing + slim debug payload |
| `features/research/components/media/mediaDimensions.ts` | Resolves dimensions: DB → metadata → URL parse |
| `features/research/components/media/MediaDebugPanel.tsx` | Debug tab + Copy all + data-quality stats |
| `features/research/service.ts` → `getMedia()` | Reads `rs_media` via Supabase client (no Python hop) |
| `features/research/hooks/useResearchState.ts` → `useResearchMedia` | Data hook for gallery |

### How FE categorizes today

**Resolution order for dimensions** (`mediaDimensions.ts`):

1. `rs_media.width` + `rs_media.height` (intended source of truth — **currently always null**)
2. `metadata.width` / `metadata.height` (also empty today)
3. URL inference: `?w=` / `?h=`, `384x256` in path, CDN `-200-80.jpg`, `width:780` in path
4. SVGs: skip query `w=` (render size, not intrinsic); tier via logo/icon heuristics only

**Size tiers** (`mediaCategorization.ts`):

| Tier | Rule |
|---|---|
| `icon` | max dimension ≤ 64px **or** favicon/icon/logo/svg/avatar URL+alt heuristics |
| `graphic` | max 65–199px **or** thumb/placeholder/small-`?w=` heuristics |
| `photo` | max ≥ 200px; non-`image` media types |

**Aspect buckets** (photos only): need **both** width and height. Square band = ±12% of 1:1.

### Debug tooling (FE)

- **Gallery | Debug** toggle on the media toolbar.
- **Copy all** exports a **slim JSON** payload (not full row dumps):
  - `dataQuality`: counts of DB dims vs URL-inferred vs none
  - `summary`: tier/aspect counts
  - `items[]`: `id`, `alt`, `url`, `dbW/dbH`, `resW/resH`, `dimSource`, `urlHints`, `tier`, `aspect`
- **Open in new tab** → `/media/debug` (all topic media, unfiltered).

Use this to validate server fixes — after ingest populates dims, `dbDimensions` should match row count and aspect summary should split meaningfully.

---

## Database contract — `rs_media`

Schema (Matrx Main, `txzxabzwovsujtloxrus`):

```
id, source_id, topic_id, media_type, url, alt_text, caption,
thumbnail_url, width, height, is_relevant, metadata, created_at
```

**Columns exist for everything we need.** They are not being filled.

---

## Server — what happens today (aidream)

### Where rows are created

**Primary path:** `aidream/research/scraper.py` (server-side HTML scrape)

After a successful/thin scrape, parsed images become `rs_media` rows:

```python
# aidream/research/scraper.py ~312–326
media_rows = [
    {
        "source_id": source_id,
        "topic_id": topic_id,
        "media_type": "image",
        "url": img.get("src", ""),
        "alt_text": img.get("alt", ""),
        "caption": img.get("caption", ""),
    }
    for img in extracted_images[:50]
    if img.get("src")
]
if media_rows:
    _fire_and_forget(rsm.media.create_items(media_rows))
```

**What is dropped on the floor:**

- `width` / `height` — **never written**, even when available upstream
- `thumbnail_url` — never written
- `metadata` — never written (stays default `{}`)
- Cap of **50 images per source**

**What the scraper parser already extracts but research ignores:**

`matrx_scraper` image nodes include `width`, `height`, `title`, `caption`, `srcset` (`packages/matrx-scraper/matrx_scraper/parser/data_types.py` → `Image.to_data()`).

HTML `<img width="…" height="…">` attributes are read in `element_extractor.py` (`_parse_img`). Those values flow into `parsed["images"][]` as string fields — but `research/scraper.py` only copies `src`, `alt`, `caption` when building `extracted_images` and again when building `media_rows`.

### Secondary path: Chrome extension / multisource

`aidream/research/multisource.py` stores images in **`rs_content.extracted_images` JSONB only**. It does **not** insert `rs_media` rows. Extension-captured sources may have **zero gallery rows** even when content JSON has images.

### Existing probe infrastructure (not wired to research)

Phase 1d.1 added **`probe_source_metadata`** (Pillow / OpenCV) for **`cld_files`** uploads (`aidream/api/routers/assets.py`, `packages/matrx-utils/.../thumbnail_source.py`). Research media ingest **does not call this** for remote scrape URLs.

### API surface

- FE reads **`rs_media` directly from Supabase** (`features/research/service.ts`).
- Python `MediaResponse` model already exposes `width`, `height`, `metadata` (`aidream/research/models.py`) — the wire shape is fine; values are null.

---

## What the server is doing wrong (action list)

> **Status (2026-06-17):** P0 (pass-through dims), P0 (probe when attrs
> missing), and P1 (unify extension + server paths) are **DONE** — see the
> RESOLVED banner above and `aidream/research/media/FEATURE.md`. Richer
> `metadata` is partial (title/srcset/dim_source stored). P2 `thumbnail_url`
> is still open. The original analysis is kept below for history.

### P0 — Pass through scraper dimensions

In `research/scraper.py`, when mapping `raw_images` → `extracted_images` and `media_rows`:

```python
"w": int(img["width"]) if str(img.get("width", "")).isdigit() else None,
"h": int(img["height"]) if str(img.get("height", "")).isdigit() else None,
```

Persist as `width` / `height` on `rs_media`. Many sites omit HTML attributes, but some provide them and we currently discard them.

### P0 — Probe when HTML attrs missing

For each image URL at ingest (best-effort, async/batched, don’t block scrape success):

1. Parse CDN/query dimensions from URL (same rules as FE `parseDimensionsFromUrl` — consider sharing or duplicating in Python).
2. If still missing, **HEAD + partial GET or Pillow probe** (reuse `probe_source_metadata` pattern from assets).
3. Store results in `width`, `height`; put probe source in `metadata` e.g. `{ "dim_source": "html_attr" | "url_parse" | "probe", "probed_at": "…" }`.

**Do not** store CDN resize params like `?w=3840` on SVGs as intrinsic dimensions.

### P1 — Unify extension + server paths

`multisource.py` should insert `rs_media` rows (same shape as scraper) when `extracted_images` is non-empty, or scraper path should be the single writer. Today gallery data is incomplete for extension-only sources.

### P1 — Richer `metadata`

Consider storing at ingest:

- `role` or `kind`: `content | logo | icon | avatar | ad | thumb | decorative` (from scraper class hints, alt text, URL patterns, `_select_best_image` scoring in element_extractor)
- `srcset` / largest candidate URL
- `natural_bytes` / mime if probed
- Original HTML `width`/`height` attrs even when probe overrides

### P2 — Backfill

Existing topics (including `08870b47-…`) have null dims. One-off backfill job: re-probe distinct URLs per topic, update `rs_media.width/height/metadata`. Until backfill, FE URL heuristics remain fallback.

### P2 — `thumbnail_url`

If we generate or discover a stable thumb URL (CDN resize, srcset smallest), populate `thumbnail_url` so gallery doesn’t hotlink full 3840px assets.

---

## Interim FE behavior (until server fix)

The FE **must not** be the source of truth for dimensions long-term, but currently:

- Infers dims from URL when DB null (see `mediaDimensions.ts`).
- Uses URL/alt/svg heuristics for icon vs graphic when dims missing.
- Shows `~` suffix on size labels when dimensions are URL-inferred.

**When server populates DB columns, FE should prefer DB values automatically** (resolution order already does this).

---

## Test plan for server developer

1. Scrape a source rich in mixed media (e.g. Cleveland Clinic health article — many icons + hero images).
2. Query:
   ```sql
   select
     count(*) as total,
     count(width) filter (where width is not null and height is not null) as with_dims,
     count(*) filter (where metadata = '{}'::jsonb) as empty_meta
   from rs_media
   where topic_id = '<topic_id>';
   ```
3. Open `/research/topics/<topic_id>/media/debug` — expect `dataQuality.dbDimensions` ≈ `total` after fix.
4. Gallery should show populated Landscape / Square / Portrait sections, Icons separated from Photos.

---

## Related code pointers

| Area | Path |
|---|---|
| **FE gallery** | `matrx-frontend/features/research/components/media/` |
| **FE read** | `matrx-frontend/features/research/service.ts` → `getMedia()` |
| **Server insert (bug)** | `aidream/research/scraper.py` lines ~240–326 |
| **Extension scrape (no rs_media)** | `aidream/research/multisource.py` |
| **Scraper image model** | `aidream/packages/matrx-scraper/matrx_scraper/parser/data_types.py` |
| **HTML img parse** | `aidream/packages/matrx-scraper/matrx_scraper/parser/element_extractor.py` |
| **Probe reference** | `aidream/packages/matrx-utils/.../thumbnail_source.py`, `aidream/api/routers/assets.py` |
| **ORM model** | `aidream/db/models.py` → `RsMedia` |
| **API model** | `aidream/research/models.py` → `MediaResponse` |

---

## Bottom line

**The gallery UI and categorization logic are blocked by ingest, not by missing FE work.**  
`rs_media.width`, `rs_media.height`, and `metadata` are first-class columns that the server simply never fills. The scraper already extracts HTML `width`/`height` in matrx-scraper but research drops them before `create_items`. Until the server probes/persists dimensions (and extension scrape writes `rs_media`), the FE will keep guessing from URLs — workable for debugging, not acceptable for production grouping.
