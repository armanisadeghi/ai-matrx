# content-ir — the canonical structured-content system

**Status:** Phases 0–4 (flashcards leg) live behind `NEXT_PUBLIC_CONTENT_IR_STREAM` (dev on / prod off). One library parses every JSON region — live agent streams, DB reloads, any source — into one IR that all layers pass through without reprocessing.

**Read this BEFORE touching:** stream/DB block parsing (`stream-block-accumulator.ts`, `content-splitter-v2.ts`), anything reading or writing `__kind`, kind schemas in `flexible_data`, or `metadata.__ir` on render blocks.

## The model (compiler frame)

| Stage | Module | Role |
|---|---|---|
| Lexer | `core/json-tokenizer.ts` | chars → tokens, chunk-boundary safe |
| Parser | `core/kind-parser.ts` | frame-stack pushdown; path-addressed events; `__kind` discriminator at ANY depth |
| IR | `core/ir-types.ts` | `CanonicalBlockIR` envelope: v1, engine provenance, fingerprint, schema-shaped `root`, per-node residue in `nodeIndex` |
| Tree | `core/ir-tree.ts` | COW structural sharing — a child update rebuilds only its ancestor spine; ONE envelope assembler for stream + one-shot |
| Normalizer | `core/normalize.ts` | **the idempotence law**: input already carrying a current envelope returns BY REFERENCE — zero reprocessing, zero rerenders |
| Registry | `registry/kind-registry.ts` | ONE key (kind slug), facets: schema / component / `legacyBlockType` bridge / artifact pointer. Tiers: eager (system-kinds = pre-warm bootstrap fallback ONLY) / warm (one flexible_data list — DB rows OVERRIDE compiled schemas once warm, compiled facets preserved) / cold (by-slug fetch → `notifySchemaArrived` upgrades nodes in place) |
| Session | `session/` | parser + tree OUTSIDE React; **one writer per identity** (`{requestId}:{blockId}`, second `openParseSession` THROWS); N readers via `useIrNode` per-path subscriptions; host-cadence `flushNotify` — never per token |
| Render flip | `react/kind-route.ts` | block with a resolved registered kind in `metadata.__ir` → its component via `legacyBlockType` + `toLegacyServerData`; everything else passes through BY REFERENCE |

## Load-bearing invariants

- **Hosts find regions; the parser owns the inside.** The accumulator (stream) and splitter (DB) detect where a JSON region starts/ends; a fresh parser per region makes single-root true by construction. The host is the region-end oracle until Phase 7.
- **Pushdown discipline:** commit → descend → never re-ask → backtrack. Speculative descent commits a child's kind the instant `{` opens when the parent schema predicts it (`{type:"object",kind}`, single-member `itemKinds`, `expectedRootKind`); `__kind` confirms, re-tags (allowed sibling), or drops THAT node to raw. Objects under a predicting parent need no `__kind` at all.
- **Node-scoped errors never kill a stream.** Duplicate keys, schema violations, disallowed itemKinds → that node goes `raw_object`, the parent keeps parsing. Only grammar errors are region-fatal → the region degrades to a code block.
- **Zero data loss:** unknown keys NEVER merge into snapshot values — they ride `residue.extra` (root residue + per-node residue in `nodeIndex`). Wire round-trip = `reconstructRegionValue`.
- **Stream ≡ static:** the accumulator's streamed envelope and the splitter's one-shot envelope are byte-identical (fingerprint included) — enforced by `__tests__/stream-splitter-parity.test.ts`. Pending-schema nodes resolve to raw at region end so envelopes are deterministic; upgrade-in-place is a live-region feature.
- **The envelope rides `metadata.__ir`** on render blocks and splitter blocks. `data` stays reserved for the routed component's serverData. Live-stream consumers read it from Redux via `selectKindEnvelope(requestId, kind?)` (`active-requests.selectors.ts`) — never a second parallel parse of answer text (a `useLiveJsonRegion` session is the fallback for prod flag-off only). GOTCHA: a `displayMode:"direct"` launch's thunk resolves only AFTER the stream ends — derive the live requestId from `selectConversationRequestIds`, never from `.unwrap()` (the starvation bug behind the 2026-07-03 flashcards fix).
- **`core/` is a pure kernel** — no React/Redux/Supabase (lint-fenced). The Python twin mirrors `core/` only.
- **Parity telemetry is loud:** accumulator region close deep-compares envelope vs `JSON.parse(content)`; mismatch → `captureError` source `content-ir` (Error Inspector).

## Doctrine (lint-enforced, `eslint.config.mjs`)

- `matrx/no-parallel-kind-parser` — parser/tokenizer imports only in content-ir + the two hosts + normalize-content-blocks + markdown-tester. Everyone else: `session-manager` (streaming) or `normalizeJsonRegion` (one-shot).
- `"__kind"` string literal banned outside this feature — use `KIND_KEY` or consume the envelope (`readEnvelope`).
- Block-Schemas / Sample-Block-Data category-id literals live ONLY in `registry/schema-source-flexible-data.ts`.
- Nothing imports from `app/(dev)/demos/json-block-detector/` — the demo is a consumer.
- Adding a kind = a `KindDefinition` (system: `registry/system-kinds.ts`; user: flexible_data Block Schemas). Never a new detector, never a parallel registry.

## Roadmap (strangler-fig — see plan `~/.claude/plans/your-task-is-to-rippling-wind.md`)

Done: 0 extract+tests · 1 registry/session/parser upgrades · 2 accumulator shadow · 3 splitter parity · 4 flashcards render flip · **Track 2 A/B artifacts generalization** (any-surface `(source_system, source_id)` identity + structured kind persistence — see `features/artifacts/FEATURE.md` Materialization). Next: register the 8 `JSON_BLOCK_PATTERNS` kinds → persist envelopes on message parts + accept Python `engine:"py-block-detector"` envelopes (Phase 5) → XML fold-in via `discriminator.ts` (Phase 6) → delete the mirrored brace/fence state machines, parser becomes end oracle (Phase 7). Agent `__kind` injection (C2) tracked in the same plan.

## Change Log

- 2026-07-04 — Track 2 A/B: artifacts materialize from ANY surface (`materializeBlocks` primitive; chat wrapper unchanged) and resolved-kind JSON persists STRUCTURED (`content.data` = zero-loss value object; rehydration via new `kindServerDataFromStoredValue` + `envelopeFromCompleteValue` — no re-parse). `ArtifactTypeDef.kinds` is the kind→artifact facade from the registry side.
- 2026-07-03 — `selectKindEnvelope` added (active-requests.selectors): canonical Redux read of the accumulator's live `metadata.__ir` envelope; flashcards CreateFromTopic flipped to it (session parse demoted to prod-flag-off fallback). Fixed the direct-launch live-preview starvation — requestId now Redux-derived at connection time (`useGenerateCards`), never from the launch thunk's resolution (which awaits the whole stream in direct mode).
- 2026-07-03 — Registry precedence flipped: flexible_data rows now override compiled schemas on warm (compiled = bootstrap fallback, facets preserved); flashcard family aligned to the DB Block Schemas (`title` canonical, `set_title` transition alias, multi-kind cards + enhanced/tiered/basic_card compiled defs); flashcards typed save path added (`generatedSetFromEnvelope` — one parse drives display AND persistence).
- 2026-07-03 — Phases 0–4 built: library extracted from the json-block-detector demo; parser upgraded (speculation, pending-schema, pop-up-one-level recovery); COW tree + sessions + registry; accumulator + splitter delegation with parity suite; flashcards kind routing (bare/fenced JSON flashcard_set renders live as real flashcards); lint doctrine landed.
