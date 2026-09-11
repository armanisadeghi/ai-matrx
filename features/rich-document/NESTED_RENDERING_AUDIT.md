# Nested rendering audit — 2026-09-11

Scope: frontend container recognition, static/Redux rendering adapters, and nested prose leaves. This is a bounded census and deterministic adversarial test set, not a claim that every possible document or DB-authored component has been executed.

## Coverage and evidence

- Three Luna workers covered source inventory, seeded parser combinations, and actual DOM leaves; the owner reviewed the findings. A Terra worker traced the confirmed streaming ownership defect.
- Source census scanned 224 `.ts`/`.tsx` files under `components/mardown-display/blocks` and six block registry files, then inspected candidate prose fields and Content IR routing. Counts include helpers/tests; this is not 224 independently verified renderers.
- The existing `pnpm test:render-matrix` passed 42 tests across eight registered paths. It checks routing to components, not the formatting of every nested field.
- The permanent `features/content-ir/__tests__/nested-parser-combinations.test.ts` crosses eight containers with eight child forms and eight deterministic chunkings each (64 cases, 512 stream runs; seed 90211). It compares actual renderer-facing transport adapters and checks independent ownership/content invariants.
- DOM checks use actual `MarkdownCoreImpl`, `ResultMarkdown`, and `BasicMarkdownContent`. Only the Next chunk boundary is replaced. The result-field guard covers inline/full, nested objects/lists/tables, expansion, null/boolean/number retention, and inert artifact-shaped fenced code.
- A temporary localhost page mounted the actual result components. Browser DOM showed bold list text, GFM table cells, revealed list items, long table prose, expanded nested cells, and a literal artifact JSON code block. The page and browser tab were removed after verification. A second temporary page mounted the actual full dispatcher for direct content and real accumulator output; both the owner and an independent reviewer observed formatted XML prose/table with literal fenced kind JSON and no promoted shape. This page and the verification tabs were also removed.

Final focused validation: the expanded CI rendering command passes **166 tests**; the separate existing stream/accumulator regression selection passes **80 tests**. Repository type checking and tracked TypeScript parse checking pass.

## Decisions

| Boundary | Evidence | Decision |
| --- | --- | --- |
| Generic XML prose | Screenshot plus actual XmlBlock DOM and ingress guards | Format contiguous prose through shared GFM; preserve literal fences, code spans, comments, CDATA and XML controls. Implemented in the preceding repair. |
| ResultValue scalar lists | Same `**bold**` input produced `<strong>` as a scalar and raw asterisks in an array; guard failed before the fix | Reuse the shared detector and ResultMarkdown for each prose item. Fixed in shared leaf, not tool-specific callers. |
| ResultTable long strings and short scalar-list chips | Early literal branches bypassed the ordinary ResultValue path | Recognized Markdown bypasses plain-text optimizations; nested lists retain disclosure and format when expanded. Fixed. |
| Result-field syntax detection | Detector documentation promised italic while the regex only recognized bold | Add conservative emphasis, underscore bold, strikethrough, and tilde-fence candidates; actual Markdown parser remains authoritative. Guard plain identifiers and spaced multiplication. |
| Generic XML containing a table, fence, kind, or ordinary JSON | Strict renderer-facing probe failed eight cases: live accumulator split the children before preserving the container; static splitter kept XML grouping | Repair container ownership at the shared scanner/accumulator boundary. Do not concatenate unrelated Redux blocks in the UI. Shared tracker now preserves ownership across static and streamed inputs; strict parity cases pass. |
| Search/Rank/RAG/Scraper nested kind adapters | Full-file inspection found `IR_ENVELOPE_KEY` plus `envelopeFromCompleteValue`, SafeBlockRenderer for DB overrides, and canonical static components otherwise | No change. Initial source-search suspicion about JSON.stringify losing kinds was a false positive. |
| JSON/YAML/TOML source inspectors, explicit Raw tabs, code/JSON-LD, malformed-data backstops | These branches intentionally show source/data; they are not declared prose fields | Keep literal. Do not globally interpret strings in code as new artifacts or rich blocks. |
| ThinkingTraceMarkdown and scraper PageSectionBlock prose | Actual DOM probes formatted emphasis, code, lists and GFM tables; fenced artifact-shaped payload stayed code | No change. |

Additional adversarial guards cover 5,000 adjacent XML tags without recursive stack growth, quoted attributes, comment/CDATA/code boundaries, and tool-interrupted XML fences. Incomplete XML retains XML-code ownership through later adapters, so it cannot promote kind-shaped examples without complete container context. Source bytes and tool chronology remain intact. The existing CI `test:render-matrix` command now includes the nesting matrix, XML guards, ingress DOM checks, and result-field DOM checks.

The real browser dispatcher also exposed a case where both parsers agreed incorrectly: a fenced `__kind` JSON example inside complete XML became a shape. Generic XML now excludes literal contexts from embedded-kind recovery while retaining bare, complete kind-object recovery. This is a separate ownership assertion, not merely a parity comparison.

## Evidence corrections

The first cheap parser probe reported zero failures based on weak assertions. That was not accepted as parity proof. The owner replaced it with strict comparisons through `renderBlockToContentBlock` and `expandTextBlocksInList`: **eight failures, 56 passes before the container fix**. Empty text tombstones, language transport location, and artifact raw XML are normalized explicitly; arbitrary block types are not accepted just to make the test green.

## Limits of this sweep

DB-authored component bodies and package-owned generic renderers were not exhaustively mounted. ScrapedPageBlock's complete envelope/tab UI, non-GFM presets, and all arbitrary combinations of nested registered artifacts remain outside this bounded run. Existing artifact ownership protections remain intact; no generalized recursive artifact creation is introduced by the prose fixes. New declared prose fields should join actual DOM coverage, and new containers should join the seeded matrix. A passing parser route alone never certifies its child component's typography.
