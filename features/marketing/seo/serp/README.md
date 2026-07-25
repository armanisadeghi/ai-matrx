# SERP primitive — canonical metadata + search-appearance system

The ONE place that knows how to render "how this title/description appears in
Google", and the ONE source of truth for SEO meta limits and measurement.
Presentational core — no Redux, no data fetching. Give it text, it renders.

## Measurement is DETERMINISTIC and cross-language

`char-widths.ts` + `metrics.ts` are an **exact mirror** of the Python
implementation in aidream `packages/matrx-scraper/matrx_scraper/meta_metrics.py`
— same character-width table, same limits (title 600/500px · 60/15ch, desc
920/680px · 160/70ch), same issue strings. The same string yields the same
number in the browser, in SSR, in a test, and in the scraper at crawl time.
**Parity is enforced by `metrics.parity.test.ts`** against Python-generated
fixtures (`__fixtures__/meta-metrics-parity.json`). Change a limit, a width, or
an issue string → change BOTH implementations in the same unit of work and
regenerate the fixture. Never re-declare a limit — import from `metrics.ts`.

## Persisted metrics — contract v1

`buildStoredSeoMetrics()` produces the canonical persisted payload (snake_case;
Python co-writes the identical shape via its `build_stored_seo_metrics`):

- `web.snapshot.seo_metrics` — OBSERVED metadata, stamped by the scraper on every capture.
- `web.page.seo_metrics_desired` — DESIRED metadata, stamped by the client on every intent save.

Read a stored payload with `parseStoredSeoMetrics()`; convert back to the UI
shape with `storedFieldToEvaluation()`. Contract doc:
`migrations/web_seo_metrics.sql`.

## Consumers

- **Public calculator page** — `app/(public)/seo/metadata/page.tsx` renders `<MetadataAnalyzer />` directly.
- **Search Appearance window panel** — `features/window-panels/windows/seo/SerpAnalyzerWindow.tsx`; open from anywhere with `useOpenSerpAnalyzerWindow({ url, title, description })` (`features/overlays/openers/serpAnalyzerWindow.tsx`).
- **Marketing page workspace** — `features/marketing/components/pages/PageWorkspace.tsx` (SERP section: `SerpResult` + chips + `MetaRecommendations`; intent form live-validates drafts).
- **Agent SEO tool visualizations** — the `seo` tool renderer (`features/tool-call-visualization/renderers/seo/`) resolves a meta-check payload and hands it to `renderers/seo-shared/` (`SerpToolInline` / `SerpToolOverlay`), which are built on `SerpResult` + `SerpFieldChips`/`SerpFieldBars` from here. Those trust the server's precomputed `*_ok` / pixels / chars — they do NOT re-measure (identical by construction).
- **Server twin** — the `seo` agent tool + scraper crawl pipeline consume `matrx_scraper.meta_metrics`.

## Files

| File | What |
|---|---|
| `MetadataAnalyzer.tsx` | **The composite**: inputs (+ optional scrape-from-URL fetch), analysis bars, Google chrome + desktop + mobile previews, recommendations. Container-query responsive (`@container/serp`) — two-column when wide, stacked when narrow, works full-page or inside a window. Props: `initialUrl/Title/Description`, `enableFetch`, `onValuesChange`. |
| `SerpResult.tsx` | One simulated Google result. `device` (`desktop`/`mobile`) × `density` (`full`/`compact`). Partial entries render gracefully — pass `placeholderTitle`/`placeholderDescription={null}` to omit a missing line. |
| `SerpSearchChrome.tsx` | The Google results-page chrome (search box + tab row + "About N results"). |
| `SerpValidation.tsx` | `SerpFieldBars` (char + pixel progress bars + device checks) and `SerpFieldChips` (compact `54c · 312px`). Semantic color tokens only. |
| `MetaRecommendations.tsx` | The issues/success list for a title+description evaluation. `issuesOnly` + `compact` for inline embeds. |
| `metrics.ts` | Limits, `evaluateMetaTitle`/`evaluateMetaDescription`, `measureSerpWidth`, stored-payload build/parse. |
| `char-widths.ts` | The shared character-width table (mirror of Python). |
| `extract-seo-from-scrape.ts` | Scrape-response → `{url, title, description}` extraction for the fetch button. |
| `types.ts` | `SerpEntry` (normalized render shape) + tool server item shapes + normalizers. |

## Adding a new SEO surface

Embed `<MetadataAnalyzer />` for the full experience, or compose the pieces:
`<SerpResult />` for the visual, `evaluateMetaTitle`/`evaluateMetaDescription`
for status, `SerpFieldChips`/`MetaRecommendations` for condensed feedback.
Push any page's data into the floating analyzer via
`useOpenSerpAnalyzerWindow`. This feature is the worked reference for the
**`section-canonicalization` skill** — read it before building a sibling
system (component → window panel → in-page section → DB persistence → Python
parity → agent tool → surface).
