# Move the recognizer into the package

**Status:** not started · deliberately deferred 2026-08-29, with the measurements below
**Owner:** unassigned
**Repo split:** source lands in `aidream/apps/shared/`, consumed by `matrx-frontend`

---

## What this is

`StreamBlockAccumulator` — the class that reads a stream of characters and
decides "this is a `flashcard_set`" — lives ONLY in matrx-frontend. Routing,
parsing, and the render layer are all in packages. Recognition is not.

That asymmetry is the reason the 2026-08-28 outage could exist at all: the
package half and the app half of one decision were on opposite sides of a
version boundary, and only one of them was covered by the package's tests.

## Why it was NOT done on 2026-08-29

Honestly, because the justification I wrote into the plan turned out to be
weaker than I assumed, and the risk did not.

**The justification I claimed:** "matrx-extend consumes the same package and
has the same break; a second implementation is a guaranteed divergence."

**What is actually true (checked):** matrx-extend consumes
`@ai-matrx/content-ir` and `@ai-matrx/content-ir-react` for RENDERING only —
`readEnvelope`, `reconstructRegionValue`, `RenderBlockView`, the host provider.
It has no accumulator and does not parse streams. matrx-local declares neither
package. **There is no second implementation today, so there is nothing
currently diverging.** The value is real but it is future value.

**The risk:** this is the single most load-bearing class in chat, and the move
is ~2,600 lines across five modules plus a new host seam.

Doing that unsupervised, at the end of a long session, with no way to verify in
a browser, to serve a consumer that does not exist yet, is the trade the rest of
this campaign exists to argue against.

## The measured closure

Everything the accumulator needs that is not already in a package:

| Module | Lines | Host coupling |
|---|---:|---|
| `features/agents/redux/execution-system/utils/stream-block-accumulator.ts` | 1,744 | the subject |
| `features/agents/redux/execution-system/utils/content-prefilter.ts` | 427 | one constant: `OUR_FILE_URL_MARKERS` |
| `features/content-ir/surfaces/xml-finalize.ts` | 164 | **none** — pure |
| `features/content-ir/surfaces/embedded-kind-json.ts` | 124 | **none** — pure |
| `features/content-ir/registry/region-envelope-memo.ts` | 165 | `captureError` |
| `features/content-ir/redux/render-block-envelope.ts` | 106 | none of consequence |

**Not moving:** `content-splitter-v2.ts` (2,597 lines). The accumulator uses
exactly nine symbols from it, all pure detectors, so they become a seam rather
than a migration:

```
detectJsonBlockType, parseXmlAttributes, extractAudioLink,
detectImageMarkdown, countInlineImages, detectVideoMarkdown,
detectMatrxFileMarkdown, isCompleteUnrecognizedXmlContainer,
normalizeCodeLanguage, SPECIAL_CODE_LANGUAGES
```

Pulling the splitter itself would drag in rehype HTML sanitization, YouTube and
media-source helpers, and the directives grammar. That is a different project.

## The shape of the work

1. **New package, not the kernel.** `@ai-matrx/content-ir` is a pinned twin
   shared with aidream's Workflow Studio; adding a streaming/markdown module to
   it risks that build. A sibling (`content-ir-stream`) keeps the kernel clean.
2. **Host seam, same pattern as `kind-route`.** One `StreamHostEnv` carrying
   the nine detectors, the two registries, `captureError`, and
   `OUR_FILE_URL_MARKERS`. The route already proves this pattern in this repo.
3. **Keep the current import path.** `features/agents/redux/execution-system/utils/stream-block-accumulator.ts`
   becomes the thin Matrix binding, exactly as `features/content-ir/react/kind-route.ts`
   is today. Zero call sites change.
4. **The gate is already built.** 31 test files / 229 tests exercise the
   accumulator, plus `pnpm test:render-matrix`. If those stay green the move is
   verified; if they do not, revert rather than chase.

## What should trigger doing it

Any of these turns future value into present value:

- matrx-extend, matrx-local, or mobile needs to recognize a kind from a stream.
- A second recognizer gets written anywhere (that is the divergence, and it
  should be caught at review).
- The package/app split causes a second incident of the 2026-08-28 class.

## Context

The campaign this belongs to is recorded in
`features/content-ir/FEATURE.md` § Change Log, entry 2026-08-29. Everything
else in that plan shipped: the kernel split (`unverified` vs `raw`), the route
gate, schema-derived field models for all 502 live kinds, the guard, the honest
preview, the unified tabs, the readiness legs, and the render matrix.
