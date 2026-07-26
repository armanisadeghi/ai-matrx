# Canonical Keyword Primitive — KeywordInput + Keyword Intelligence window

Status: **live (2026-07-26).** Home: `features/marketing/seo/keyword/`.

**THE RULE:** a keyword is never a bare string. Wherever one is entered,
displayed, or handed to an agent, it travels with everything the platform
knows about it (`seo.keyword` + `keyword_market` + edges + site performance +
rank evidence), condensed for the consumer. **Never render a plain
`<Input>` for a keyword field — wrap `KeywordInput`. Never hand-build a
keyword payload for AI — call `buildKeywordBrief`.**

## Parts

| Part | File | What it is |
|---|---|---|
| `KeywordInput` | `KeywordInput.tsx` | THE canonical keyword input: live library resolution, data chips underneath, contextual + library suggestion dropdown (source-tagged: GSC / Analyzer / Library), Keyword Intelligence launcher. Controlled; callers own save. |
| `KeywordIntelPanel` | `KeywordIntelPanel.tsx` | The full dossier: Overview (market + 13-column classification), Relationships (edge navigation re-targets the panel), Site (v_site_keyword_performance), Rankings (rank targets + live check + track), SERP (stored landscape as a Google-style results page, own site highlighted), Research (full pipeline, live kind components). |
| `keywordWindow` overlay | `features/window-panels/windows/seo/KeywordWindow.tsx` + `features/overlays/openers/keywordWindow.tsx` | The panel as a floating window. Open from anywhere: `useOpenKeywordWindow({ phrase, siteId, pageId, brandId, tab })`. Site-scoped tabs light up only with a site binding. `?panels=keyword`. |
| `buildKeywordBrief` | `keyword-brief.ts` | The condensed keyword+data payload (`{ data, lines }`) for Copy-for-AI envelopes and agent payloads. |
| `KeywordDataChips` | `KeywordDataChips.tsx` | Inline condensed data row (volume, trend, competition, CPC, site position). |
| `KeywordUsageChips` | `KeywordUsageChips.tsx` + `keywordUsedIn` | Presence checks of a phrase across observed fields (title/description/H1/URL). |
| Reads | `data.ts`, `hooks.ts` | Direct-Supabase `seo` reads + `useKeywordVolumeRefresh` (the ONE sanctioned way the UI adds an unknown phrase to the library — the aidream volume-refresh command upserts it server-side). Query keys: `seoKeywordKeys`. |

## Invariants

- **Reads direct to Supabase, compute to aidream** (two-lane rule). Research
  streaming REUSES `useKeywordResearch` + `LiveResearchFeed`; rank data REUSES
  `features/marketing/components/ranks/useRanks.ts`; display atoms REUSE
  `keyword-research/components/KeywordMetrics.tsx`. No forked fetchers or
  visuals.
- **Every stream lands on a terminal state** — in-band `error` events captured,
  post-stream forced done/error (the rank-check 429 class).
- `normalizeKeywordPhrase` is a LOOKUP mirror of `seo.fn_normalize_phrase`;
  persisted normalization stays server-owned.
- Consumers today: page-workspace intent form (`PageWorkspace.tsx` IntentForm —
  scope-bound input, GSC/analyzer suggestions, usage chips, brief in the
  `web-page-intent` copy payload). `content-plan/components/KeywordPicker.tsx`
  is prior art pending migration onto this primitive.

## Change Log

- 2026-07-26 — Claude: initial build — canonical KeywordInput, Keyword
  Intelligence window (6 tabs), keyword brief, usage chips; adopted by the
  page-workspace intent form.
