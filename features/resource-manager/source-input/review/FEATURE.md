# FEATURE.md — Review what goes in (`source-input/review`)

**Status:** `active` · **Tier:** `2` · **Last updated:** `2026-09-27`

## Purpose

The one follow-up screen for any set of Sources: before a request runs, the person sees each
Source's size and state, tunes it (version, parts, size limit, how the AI gets it) and reads a
plain verdict — Fine / Getting heavy / Too much — sized against the reading model's real context
window. The friendly, general version of the research context builder
(`features/research/components/resources/ContextBuilder.tsx`, the champion). Campaign:
common-docs `projects/unified-source-input/` (DESIGN.md § "The follow-up page"; item USI-4).

## Entry points

- **`openSourceReview(sourceSet, options) → Promise<SourceReviewOutcome>`** —
  `openSourceReview.ts`. Plain function, callable from any client host. Outcomes:
  `{status:"applied", sourceSet}` · `{status:"add_more", sourceSet}` (only when
  `options.addMoreLabel` is set) · `{status:"cancelled"}`. Options: `targetModelId`, `purpose`,
  `reason: "requested" | "large"`, `addMoreLabel` (`types.ts`).
- **`shouldOpenSourceReview(totalChars)`** — `knobs.ts`; true above the knob
  `sources.review_threshold_chars` (100,000). Hosts call it with `totalChars(manifest)` from
  `@ai-matrx/agents/sources` and open the review with `reason: "large"`.
- **`<SourceReview>`** — the canonical body; a page may render it inline.
- Overlay `sourceReviewWindow` (`features/overlays/catalogue.ts`, controller block in
  `OverlayController.tsx`, opener `features/overlays/openers/sourceReviewWindow.tsx`) renders
  `SourceReviewWindow` → the package Dialog (non-blocking window on desktop, bottom sheet on a
  phone) wrapping `<SourceReview>`.
- Server: `POST /sources/manifest` (sizes, states, forms, parts — never bodies) and
  `POST /sources/resolve` (`api.ts`), aidream `api/routers/source_sets.py`.
- Dev harness: `app/(dev)/demos/source-review/page.dev.tsx` — inline + window, and "Check with
  the server" compares planned characters with what `/sources/resolve` returns.

## Invariants

1. **One planner** (`plan.ts::planSourceReview`) feeds the screen AND the returned `SourceSet`.
   It mirrors the server resolver rule for rule (chosen form, picked parts, `_cap`, grounding
   headers `### Chunk <id> (page N)`, `delivery:"context"` sends nothing), so the characters
   shown equal `/sources/resolve`'s text length whenever the manifest lists parts. Where a Source
   has no listed parts (notes, generic records) the count is the body only and is labelled
   "(about)". Tests: `plan.test.ts`.
2. **Budget = the target model's window** (`model_context_tokens` from the manifest). Unknown
   model → the knob `sources.review_default_context_tokens` (128,000), labelled on screen.
   Tokens use the ONE client estimator `lib/tokens/estimate.ts` (conservative), so a set the
   planner says fits also fits the server's laxer check.
3. **Nothing is dropped silently.** A Source that would overflow is named ("Won't go in: …")
   with a one-click "Let the AI look it up instead", and is REMOVED from the returned set — so
   the server never drops what the screen showed as going in. Unusable Sources (no access,
   missing, failed) stay in the set with their reason shown; they contribute nothing.
4. The manifest is re-read only when a version changes (parts depend on the version); parts,
   limits and delivery are planned locally.
5. Plain words: "parts" (Segments), "version" (form), "size limit", "Include the text" / "Let
   the AI look it up"; tokens are explained once in the budget line.

## Known gaps

- **Saved presets** — the champion's bundles (`research.rs_context_bundle`) are rules over
  research kinds and do not generalize to arbitrary Sources; presets are not built here yet.
- **Adding Sources in place** — the review returns `add_more` so the host reopens its own
  `SourceInput` (USI-3); an embedded SourceInput inside the review is not wired.
- The server's window check uses 4.0 chars/token (`matrx_ai` `CHARS_PER_TOKEN_ESTIMATE`) while
  the client estimator uses 2.9 — two estimators; the planner's removal rule keeps them from
  disagreeing on outcomes, but the numbers differ.

## Change log

- 2026-09-27 — Created (USI-4): opener, overlay registration, planner + tests, `SourceReview`
  body, parts search, size limit, delivery, verdict, knob `sources.review_default_context_tokens`,
  dev harness.
