# Content-IR Unification — Handoff & Status (2026-07-04)

The measuring stick: **one canonical structured-content system** — any content, from any source (live agent stream, DB reload, notes, Python), parsed **once** by **one library** into **one IR** that recognizes its own work; one kind registry users can extend; artifacts from any surface; XML eventually; a Python twin emitting the same envelopes. Content must never take a different parser depending on the path it arrived by.

This doc is the honest scorecard against that vision, the complete remaining-work ledger, and the handoff for whoever continues. Companion docs: [FEATURE.md](../FEATURE.md) (invariants + doctrine), [PYTHON_ENVELOPE_CONTRACT.md](./PYTHON_ENVELOPE_CONTRACT.md) (aidream wire contract), [TWO_WAY_BINDING.md](../../canvas/docs/TWO_WAY_BINDING.md) (edit/unbind/export design).

## Scorecard — vision vs. now

| Vision element | Status | Evidence / gap |
|---|---|---|
| One parser for live streams | **DONE** | Accumulator's JSON regions feed ONE KindStreamParser per region; char-level (minified single-line included); envelopes on `metadata.__ir` every flush |
| One parser for DB reloads | **DONE** | Splitter delegates to the same library; **persisted envelope cache on message parts → reload is reference-identical reuse, zero re-parse** (proven by identity assertion in `envelope-persistence.test.ts`) |
| Stream ≡ static (no path-dependent output) | **DONE (enforced)** | `stream-splitter-parity.test.ts`: byte-identical envelopes incl. fingerprint, randomized chunking; live parity telemetry → Error Inspector (`content-ir` source) |
| Self-recognizing / idempotent IR | **DONE** | `normalize(normalize(x)) === normalize(x)` by reference; `reuseEnvelopeIfCurrent` fingerprint gate; memoized splitter envelopes; Redux read via `selectKindEnvelope` |
| No-rerender streaming | **DONE** | ParseSession outside React, COW tree (sibling identity preserved), flush on the existing 30ms batch, per-path `useIrNode`, one-writer-per-identity enforced (throws) |
| `__kind` at any depth + speculation + recovery | **DONE** | Speculative descent (parent schema / `expectedRootKind` — payloads need no `__kind` at all), pending-schema upgrade-in-place, node-scoped raw fallback (pop up one level), zero-loss residue channels |
| Kind registry (system + user, tiered) | **DONE** | Eager compiled bootstrap / warm flexible_data (DB rows OVERRIDE compiled schemas — user edits win) / cold by-slug fetch. 26 kind slugs live in the DB |
| All 8 legacy JSON patterns on `__kind` | **DONE (new shapes)** | `quiz_set`, `presentation_deck`, `decision_tree`, `comparison_set`, `diagram_spec`, `math_problem`, `item_presentation`, `schema_proposal` (+child kinds) registered with legacy bridges rendering through the SAME components; every root kind carries `additionalDetails` |
| Artifacts from any surface | **DONE (primitive)** | `materializeBlocks({source})` + `(source_system, source_id)` identity migrated/backfilled/live-verified; chat is one thin caller. **No non-chat surface calls it yet** (notes pilot pending) |
| Structured persistence (no string round-trip) | **DONE** | Kind artifacts persist `content.data` as the typed object; rehydrate via the registry, no re-parse; card tags survive to `fc_card.metadata.tags` |
| Artifact → markdown (user's way back) | **DONE (forward leg)** | `toMarkdown` facet on all 9 kind families + `exportArtifactMarkdown` + "Copy as Markdown" on artifact chrome. Backward/unbind designed, not built (TWO_WAY_BINDING.md) |
| Live proof: flashcards | **DONE** | `/education/flashcards/new` streams cards per-card; ONE parser output drives display AND persistence (`generatedSetFromEnvelope`); agent emits strict `__kind` schema |
| Python twin | **CONTRACT READY, NOT BUILT** | FE ingests `engine:"py-block-detector"` envelopes untouched (guarded, tested); aidream must emit them (contract doc has the exact fingerprint algorithm) |
| XML as a discriminator | **CONTRACT ONLY** | `discriminator.ts` abstraction is in place; XML resolver/tokenizer not built (Phase 6) |
| Users register custom RENDERERS | **NOT BUILT** | Registry has the `component` facet + cold loading; there is no pipeline for user-authored components yet — schemas only. This is the endgame feature; the registry shape was designed for it |

## Where multiple parsers still exist (the honest list)

These are the remaining places content can be parsed outside the ONE library — each is either **by-design-until-a-phase** or **legacy-until-migration**:

1. **`JSON_BLOCK_PATTERNS` root-key heuristics** (content-splitter-v2 + accumulator early-type detection) — still the detector for OLD-shape payloads. Dies in **Phase 7** after agent instructions migrate (list below); the parity suite is the deletion safety net. The mirrored fence/brace state machines in accumulator vs splitter also die in Phase 7 (parser `rootDone` becomes the region-end oracle).
2. **Component-level content parsers** (`parseQuizJSON`, `parseDecisionTreeJSON`, `parseComparisonJSON`, `parseDiagramJSON`, `parseFlashcards`, `useFlashcardsSet` content path, item_presentation's tolerant scan) — still parse legacy string payloads; the NEW shapes bypass them via envelope-derived serverData (bridges intentionally reuse these parsers on reconstructed values for exact parity). They shrink to serverData-only as old content ages out; do not delete while any stored message carries old shapes.
3. **XML paths** (`<flashcards>`, `<thinking>`, decision/artifact attr-XML) — untouched by design until **Phase 6** (tag = discriminator, same frame-stack model).
4. **`StreamingJsonTracker` extraction pipeline** (`jsonExtraction`) — still the resolution/timeout mechanism for structured-output launches; flashcards now resolves envelope-FIRST with extraction as fallback. Candidate for retirement once envelope resolution is verified across all extraction consumers (image-studio etc.).
5. **`useLiveJsonRegion` session parse** — fallback only (prod flag-off / kind-unresolvable payloads); Redux `selectKindEnvelope` is primary.
6. **Python (aidream)** — parses everything its own way today; the twin is unbuilt.

## Remaining work ledger (prioritized)

### 1. Instruction/skill migration to the new `__kind` shapes (unblocks Phase 7)
Every site still teaching agents the OLD root-key shapes (full file:line list in commit `d83c2b9d7`'s report; recap):
`components/mardown-display/blocks/quiz/AI_MODEL_INSTRUCTIONS.md` · skl_* bodies in `migrations/item_presentation_render_block.sql` + `migrations/presentation_render_block_pack.sql` (**also live in the DB skl_ tables**) · `features/canvas/ARTIFACT-MODEL-GUIDELINES.md` · `features/math/AI_GENERATION_GUIDE.md` · `features/item-presentation/FEATURE.md` · `block-registry/ADDING_BLOCKS.md` · `MARKDOWN_PARSING.md` · `REACT_RENDER_CONTRACT.md` · `.claude/skills/create-render-block-skill/SKILL.md` · `features/transcript-studio/modules/quiz/QuizModule.ts` + `decisions/DecisionsModule.ts` (module contracts expect old root keys). Use the `create-render-block-skill` recipe for the DB-side skill packs.
### 2. C2 — "Enable render blocks" in OutputSchemaTab
The converter (`convert/openai-schema-converter.ts#buildAgentSchemaWithRenderBlockSupport`) still has no UI caller. Build the OutputSchemaTab action: convert current schema → save missing kind schemas to flexible_data → apply `__kind`-injected schema via `saveAgentField`. The flashcards agent proved the pattern by hand; this makes it one click for every agent.
### 3. Notes pilot + two-way binding build-out
First non-chat `materializeBlocks` caller (+ `reconcileSourceBlocks` on the notes loader). Then TWO_WAY_BINDING.md open items: `unbindArtifact` primitive, unbind inertness guard for fence-backed types, `userEditable` registry flag generalizing `resolve:"latest"`, structured-kind editors (flashcards first), markdown→structured backward parse (deliberately deferred).
### 4. aidream (Python twin)
Emit `CanonicalBlockIR` on render_block metadata per PYTHON_ENVELOPE_CONTRACT.md (fingerprint mirror is spelled out); optionally stamp part-level envelope caches when persisting turns; regenerate ORM models for the new canvas/chat.artifact columns; its stale `iam.apply_rls` copy predates the owner-fallback (live DB function is newer).
### 5. Rollout + retirement
Phase 6 XML → Phase 7 deletions (JSON_BLOCK_PATTERNS to a region-open hint; mirrored state machines; then the transcript-studio module contracts).
### 6. User-registered renderers (the endgame)
Design exists (component facet + cold tier + `KindBlockProps`); needs: user component authoring/storage, sandboxed loading, per-user warm cache (favorites), and promotion of the demo's `GenericBlockRenderer` into the official fallback for kinds without components.

### Known risks / loose ends
- `canvas_items_user_content_full_unique (user_id, content_hash)` — pre-existing: two sources with byte-identical content collide on insert (reconcile retries). Decide: scope the hash-unique to user saves.
- `flexible_data` quiz rows (user-authored) lack `additionalDetails`; compiled defs carry it — post-warm extras still survive via residue. Harmless, but align when touching those rows.
- 6 pre-existing full-suite jest failures (DB-parity drift + `@xyflow` CSS imports) — unrelated to content-ir, proven against the old jest config.
- `features/content-ir` has no `/[feature]/admin` map yet (house rule for Tier 1 features) and the demo page (`/demos/json-block-detector`) predates the session rewrite of its inspector tabs — both worth a pass.
- Preview-browser stuck hydration (SSR fine, tree never hydrates) — pre-existing environment issue; live verification runs on the user's env.

## Test & verification state
113 tests green across content-ir/canvas/flashcards (13 suites): tokenizer fuzz, parser goldens, speculation/pending-schema/recovery, structural sharing + freeze-safety, idempotence law, stream↔splitter parity, accumulator shadow, kind routing (all 9 families), envelope persistence round-trip (reference-identity proof), Python-envelope ingest + malformed-guard, export markdown (15 cases), planMaterialization structured detection. Migrations applied + ledgered + live-verified (`artifacts_any_surface_source_identity.sql`). `pnpm type-check` clean.

## Change Log
- 2026-07-04 — Initial handoff written after Waves A (8 successor kinds), B (Phase 5 persistence + Python contract), C (markdown export + two-way design).
