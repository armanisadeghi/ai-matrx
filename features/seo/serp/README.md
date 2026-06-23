# SERP primitive — the canonical "simulated Google search result"

The ONE place that knows how to render "how this title/description appears in
Google", and the ONE source of truth for SEO meta limits. Purely
presentational — no Redux, no hooks, no data fetching. Give it text, it renders.

Built because the SERP preview was trapped inside the `/seo/metadata` page's
private `_components/` while the agent's SEO tool checks rendered the same data
as abstract metric bars. Now both consume this.

## Consumers

- **Live calculator page** — `app/(public)/seo/metadata/_components/MetaInputWidget.tsx`
  (desktop + mobile previews, in-browser canvas measurement via `metrics.ts`).
- **Agent SEO tool visualizations** — `features/tool-call-visualization/renderers/seo-shared/`
  (`SerpToolInline` / `SerpToolOverlay`), which the `seo_check_meta_tags_batch`,
  `seo_check_meta_titles`, and `seo_check_meta_descriptions` renderers delegate to.
  Those trust the server's precomputed `*_ok` / pixels / chars — they do NOT
  re-measure.

## Files

| File | What |
|---|---|
| `SerpResult.tsx` | One simulated Google result. `device` (`desktop`/`mobile`) × `density` (`full`/`compact`). Partial entries render gracefully — pass `placeholderTitle`/`placeholderDescription={null}` to omit a missing line. |
| `SerpSearchChrome.tsx` | The Google results-page chrome (search box + tab row + "About N results"). Wrap a stack of results to read as a real results page. |
| `SerpValidation.tsx` | `SerpFieldBars` (char + pixel progress bars + desktop/mobile device checks) and `SerpFieldChips` (compact `54c · 312px`). Semantic color tokens only. |
| `metrics.ts` | **Single source of truth** for SEO limits + canvas measurement. Mirrors aidream `seo/utils/meta_calculators.py` (title 600/500px·60ch, desc 920/680px·160ch) so the live page agrees with the server's `*_ok` flags. |
| `types.ts` | `SerpEntry` (the normalized render shape) + each tool's raw server item shape + the normalizers between them. |

## Adding a new SEO surface

Render `<SerpResult … />` for the visual; if you have raw text and need
status, call `evaluateMetaTitle` / `evaluateMetaDescription` from `metrics.ts`.
Never re-declare a pixel/char limit — import it from `metrics.ts`.
