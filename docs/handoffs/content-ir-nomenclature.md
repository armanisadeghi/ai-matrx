---
status: active
updated: 2026-08-17
repos: [matrx-frontend, aidream, common-docs]
vision:
  [
    /Users/armanisadeghi/code/common-docs/systems/content-ir-system/NOMENCLATURE.md,
    /Users/armanisadeghi/code/common-docs/systems/vocabulary/FEATURE.md,
  ]
---

# Content IR / Shape nomenclature — the rename campaign

**The naming is DECIDED and the docs are SHIPPED. No code has moved.** This doc is the work order for the five code chips, plus the four decisions Arman owns.

Read first, in this order:

1. **`common-docs/systems/content-ir-system/NOMENCLATURE.md`** — the state of play: what every name means today, the six defects with evidence, the answer to the media-primitive question, and the campaign. This handoff does not repeat its analysis.
2. **`common-docs/systems/vocabulary/FEATURE.md` § Settled — Content IR / Shapes** — the ruled terms and the four open items. This is the authority; if this handoff ever disagrees with it, the lexicon wins.
3. **`matrx-frontend/features/content-ir/docs/SHAPE_SYSTEM.md`** + **`features/content-ir/FEATURE.md`** — frontend operating detail, both already carrying the ruling.

---

## 🚨 THE CONSTRAINT — read this before touching one line (Arman, 2026-08-17)

> **~95% of everything we render goes through what is currently named `legacyBlockType` and the `scalar_generic` bucket. Those block types are mostly XML, they are a genuinely great way to render things, and they are NOT going away.**

This campaign is a **naming correction, not an architecture change.**

| Changes | NEVER changes |
| --- | --- |
| Code identifiers (`legacyBlockType` → `primitive`) | Every block-type **string value** (`image_output`, `youtube`, `table`, `code`, …) |
| Crosswalk classification bucket names | Dispatch-table contents and routing outcomes |
| Doc prose, code comments, skills, lexicon rows | XML surfaces — permanent, first-class input surfaces |
| What we *call* the envelope's safety axis | Anything a running renderer reads at runtime |

**A change in this campaign that alters a value, a route, or a dispatch outcome is a defect.** Values are frozen; only the words change.

## The decided vocabulary

| Term | Is | Replaces |
| --- | --- | --- |
| **Shape** | The product name of the structured-content system, and one named versioned structure. | — (was unregistered) |
| **kind** | The technical noun — the slug in `content_ir.kind_definition.kind`, the `__kind` key. | — (was unregistered) |
| **family** | The **safety class** of an envelope operation: `output_directive · function · reference · secret · validation`. | envelope `kind`; `kind_definition.metadata.category` |
| **primitive** | A platform component that renders content directly, without a Shape — the ~95% render path. Also the field naming a Shape's binding to one. | `legacyBlockType` |
| **primitive-bound** | A Shape that resolves to an existing primitive instead of owning a bespoke component. | — (new class) |
| **Primitive Binding registry** | The generated enumeration of every primitive a Shape may bind to, with its payload. | — (new) |
| **`io_generic`** | The registered workflow-I/O generics (`text`, `number`, `boolean`, `json`, `items`, `string_list`). | their half of `scalar_generic` |

**`family` was ruled explicitly by Arman. The other four were ruled by his approval of the design** — see Q4 below; if he wants any of them back at proposal status, the lexicon rows come out in the same change.

## Rules binding EVERY chip

- **Freeze values.** No block-type string, route, dispatch outcome, or DB value changes.
- **Go all the way** (lexicon **Law 4**): code, identifiers, comments, docs, tests, generated files' *sources*, skills, and agent-facing text. A rename is not done while any surface still teaches the old word.
- **Leave nothing behind.** No compatibility alias, no re-export shim, no "deprecated but kept" export, no old word in a comment. **Agents dig old names back out of exactly those places** — this is Arman's explicit requirement, not a preference.
- **Verify, never assume.** `pnpm type-check` green · `pnpm check:shapes` and `pnpm check:content-ir:strict` no worse than before · regenerate rather than hand-edit any generated file · `python scripts/sync_content_ir_core.py` from the **aidream** root whenever a twinned file is touched, then prove `python scripts/check_content_ir_twin.py` passes.
- **Report the count.** Before/after grep count for the old word in every repo touched, ending at **zero**.

---

## C1 — Documentation + lexicon ✅ DONE (merged 2026-08-17)

- `common-docs`: `systems/content-ir-system/NOMENCLATURE.md` created; `systems/vocabulary/FEATURE.md` gained the *Settled — Content IR / Shapes* table + 3 Superseded rows + the 4 open items; `operations/unassigned-handoffs.md` row added. (PR AI-Matrix-Engine/matrx-common-docs#34)
- `aidream`: `docs/protocol/MATRX_ENVELOPE.md` + `MATRX_ACTIONS.md` definition lines say **family** and name the three-way collision. (PR AI-Matrix-Engine/aidream#101)
- `matrx-frontend`: `features/content-ir/FEATURE.md` + `docs/SHAPE_SYSTEM.md` carry the ruling and the frozen-values constraint; `docs/protocol/MATRX_ENVELOPE.md` re-synced byte-identical. (PR armanisadeghi/ai-matrx#164)

Verified after merge: mirror in sync across both `main`s (15143 bytes, `cmp`-identical).

## C2 — `legacyBlockType` → `primitive`

**Measured scope (2026-08-17):** 136 occurrences / 71 files in matrx-frontend, 14 in aidream. **Code-only — there is no `legacy_block_type` DB column** (confirmed against `types/database.types.ts`).

Why it matters, not just tidiness: `system-components.ts` derives the `role='output'` `kind_component` row from this facet and its doc comment literally says *"`componentKey` IS the legacy block type string."* It is **the channel by which a Shape binds to a platform component**, carrying the primary render path. Calling it "legacy" is why agents keep authoring bespoke kind components instead of binding — which violates THE CANONICAL COMPONENT LAW one level below where that law currently reaches.

- Rename the `KindDefinition` facet and every reader: `registry/system-components.ts` (its comment *defines* the misnomer — rewrite it), `react/kind-route.ts`, `kinds/legacy-bridge-utils.ts`, every file under `features/content-ir/kinds/`, and all tests.
- **Twinned files — do not skip:** `registry/kind-registry.types.ts` and `registry/kind-dual-gate.ts` are inside the hash-pinned twin (`aidream/apps/shared/content-ir-core/`). Run the sync from the aidream root and prove the twin check passes.
- Docs/skills: `features/content-ir/FEATURE.md`, `docs/SHAPE_SYSTEM.md` (R1 + Stage-1/Stage-3 prose), `block-registry/ADDING_BLOCKS.md`, and the `shape-system` / `create-render-block-skill` / `workflow-io-kinds` skills.
- **The word "legacy" must not survive anywhere it described this facet.**

## C3 — split `scalar_generic` → `primitive` + `io_generic`

**Measured scope:** 35 occurrences / 9 files in matrx-frontend, 6 / 2 files in aidream.

The bucket holds three unrelated groups today: media primitives (`image`, `video`, `audio`, `image_output`, `video_output`, `audio_output`, `youtube`), markup/source primitives (`html`, `svg`, `iframe`, `react`, `jsx`, `tsx`, `code`, `table`, `tree`, dividers), and **real registered kinds** (`text`, `number`, `boolean`, `json`, `items`, `string_list`). Most contents are not scalar; the last group is not generic.

- Authority is the rule tables in `scripts/shape/generate-content-vocab-crosswalk.ts`. Add the classifications and reclassify the 24 rows.
- **aidream `matrx_connect/context/data_render_blocks.py` carries the Python-claimed classification the crosswalk build cross-checks — move both sides in ONE commit** or the build fails by design. That cross-check is working as intended; do not weaken it.
- Regenerate `pnpm check:shapes:crosswalk:refresh` → verify `pnpm check:shapes:crosswalk`. Rename the generated unions/tables to match (`ScalarGenericBlockType`, `SCALAR_GENERIC_BLOCK_DISPATCH`, `ServerScalarGenericRenderBlock`).
- **Dispatch contents and routing must be byte-for-byte equivalent.** `block-dispatch.test.tsx` fails on crosswalk↔registry drift — keep it and let it prove the split.

## C4 — build the Primitive Binding registry (after C2)

**This is the chip that answers Arman's original question.** There is no image/video/audio Shape, and the binding mechanism already exists — `KindDefinition.legacyBlockType` → the `role='output'` `kind_component` row → `applyIrKindRoute` flips the block, with `toLegacyServerData` adapting the payload, and `props_transform` as the adapter seam. **No machine is missing.** What is missing:

1. **The enumeration.** Nothing anywhere lists the legal `component_key` values for `source='bundled'`, so a Shape author — human or the `content_ir.kind_creator` agent — cannot discover that `image_output`, `video_output`, `youtube`, `table`, `code`, `svg`, `html`, `iframe` are bindable. They author a bespoke TSX instead.
2. **The rule.**

- **Generated, never hand-written** — derive from the primitive dispatch tables + `BlockComponents` so it cannot drift. Same truth-vs-code guard pattern as the crosswalk.
- Each row: primitive key · resolved component · expected payload shape · whether a `props_transform` is typically needed.
- Consumers: the shape doctor (`check:shapes`), the admin kind-registry, `/shapes`, and the context handed to the `content_ir.kind_creator` + `content_ir.kind_architect` **Mandates** (the settled word since Arman's 2026-08-16 rename of "agent slot" — `common-docs/systems/mandates/FEATURE.md`).
- **Extend `props_transform` to `source='bundled'` rows** so a structured Shape can bind without a new component.
- **Ship the law with it:** a Shape that maps onto an existing primitive **binds**; it never gets a new component. `{file_id, caption, alt}` is `primitive: image_output` + a transform, not a TSX file. Into both repos' `CLAUDE.md` and `features/content-ir/FEATURE.md`.

## C5 — finish the `document` media primitive

`media_block` with `kind: "document"` **returns `null`** — a document media block renders nothing today, with a dead Phase-1c `DocumentBlock.page1Url` (full-res page-1 JPEG) sitting there unused. Build the inline preview on it, **or** record in the Primitive Binding registry that `document` has no output primitive yet. Silence is not an option. Found by this sweep; exactly the class the registry makes visible.

## C6 — `family` prose sweep

The concept is renamed; the prose is not. Definition lines are done (C1); the rest is not.

- aidream `docs/protocol/MATRX_ACTIONS.md` §§2–7 and per-family prose · `MATRX_ENVELOPE.md` § "The `kind` registry", § "Per-kind contracts", invariants · `MATRX_REFERENCES.md`.
- **`MATRX_ENVELOPE.md` and `MATRX_REFERENCES.md` are byte-mirrored** (`scripts/check-protocol-sync.ts`; aidream canonical, plus the two generated JSON files). Edit aidream, then `pnpm check:protocol-sync:fix` in matrx-frontend and prove `pnpm check:protocol-sync` passes. **`MATRX_ACTIONS.md` is deliberately NOT mirrored.**
- Also `aidream/services/matrx_envelope/FEATURE.md`, `matrx-frontend/features/matrx-envelope/`, the `matrx-envelope` skill, and `kind_definition.metadata.category` prose (the duplicate name for this axis).
- **Envelope code identifiers follow ONLY if Q1 is ruled** — otherwise leave them and mark them unfinished, never settled.

---

## 🔶 Questions for Arman — these gate real work

**Q1 — Does the envelope's WIRE key `kind` become `family`?** (lexicon O-1)
Law 4 says a rename goes all the way, including DB contracts, and that *"internal identifiers can keep the old name is NOT our policy."* My earlier "prose only, wire untouched" recommendation was **wrong under Law 4 and is withdrawn**. Renaming it is planned work with a content migration — the envelope is byte-mirrored across repos **and appears inside stored `cx_message.content`** — and it interacts with the lexicon's **blocked Action cluster**. Until ruled: docs say **family**, the wire key stays `kind` **as unfinished work, not policy**. *Blocks: the identifier half of C6.*

**Q2 — the `item` collision** (lexicon O-2). The lexicon settles **Item** = *a field defined on a Scope type* (Scope type → Scope → Item → Value). MatrxEnvelope uses `items: []` for **operations**; there is also an `item_presentation` kind and an `item-detail` window. Reported per Law 2, unadopted. Inside the blocked Action cluster.

**Q3 — three `type`s** (lexicon O-3). Envelope item `type` (`verb:noun`) · `item_presentation.type` (a noun) · `BlockType` (a render-block token). Inside the blocked Action cluster.

**Q4 — do `primitive` / `primitive-bound` / `io_generic` / "Primitive Binding registry" stand as ruled?** Arman explicitly named only **`family`**; the other four were taken as ruled from *"add our decided vocabulary."* If any should return to proposal status, its lexicon row comes out in the same change. *Blocks: nothing — but C2/C3/C4 all bake these names in, so answer before they run.*

**Q5 — how should test collection stop booting app startup?** (see the defect below) Three different architectural answers; "make the guard pass" is forbidden. *Blocks: `release.sh` for every branch.*

**Q6 — the four parallel "what renders this?" resolvers** (lexicon O-4): `kind_component` · the block-dispatch tables · the `item-presentation` registry (the Actions `view` verb's resolver) · `artifact-type-registry`. Named as a set for the first time; unification is unruled and deliberately out of this campaign's scope.

---

## Defects found while verifying CI — none caused by this work

All four were on `origin/main`, arriving via other sessions' in-flight `wip:` commits. Verified against `origin/main`, not inferred. Evidence in the thread of AI-Matrix-Engine/aidream#101.

| # | Check | Root cause | Note |
| --- | --- | --- | --- |
| 1 | `aidream (api + graph_actions)` | **RELEASE-BLOCKING.** `check_test_collection.py` reports the `aidream` scope DARK: `4612/4701 collected, 5 errors`. Importing 5 test modules runs `package_integration._init_stores()` → `matrx_scraper/domain_config.py:241 start()` → `RuntimeError: domain config initial load failed`. **Collection performs real app startup and opens a DB connection.** | Filed at the top of aidream `FOUND_DEFECTS.md` (36c7898, merged). **The raise is CORRECT** — it refuses to register an inert fail-open store, per the no-silent-fail-open doctrine. Needs Q5. Reproduce: `uv run python -m pytest aidream --collect-only -q` |
| 2 | `apps (typecheck + vitest)` | `apps/workflow-studio/src/features/canvas/store.ts:17` imports `EDGE_NOTE_MAX_LENGTH` / `EDGE_NOTE_MAX_LINES`; neither is exported anywhere in `apps/workflow-studio/src/types` on `main`. A consumer landed without its constants. | `daf6101f` |
| 3 | `router thinness` | 2 unbaselined FAT_TASK violations: `web_url_changes.py:57 receive_url_changes` (43 statements) + `test_web_url_changes.py:34` (34). Baseline on `main` has zero entries for them. | `b8a8a4c7`. Needs a real service extraction — the script's own banner forbids `--update-baseline` to silence a new violation |
| 4 | `package db wiring` | `aidream/_generated/package_db_wiring.py` stale vs manifests. | `bfb83326`, the `agent.mandate*` rename that didn't regenerate. Fix: `python scripts/check_package_wiring.py --write` or `python db/generate.py` — but not mid-rename in someone else's live session |

---

## Why no code moved in C1's session

No `node_modules` and no Python deps were available, so `pnpm type-check`, the crosswalk generator, and `sync_content_ir_core.py` could not run. Pushing an unverified 136-occurrence rename across 71 files next to the primary renderer would have been the wrong trade against the frozen-values constraint. **Every chip needs a session with deps installed.**

## Order

**C1 ✅ → (C2 ∥ C3 ∥ C5 ∥ C6) → C4.** C4 enumerates what C2 names, so it goes last. C2 and C3 are independent of each other. C6's identifier half waits on Q1. Answer Q4 before C2/C3/C4 bake the names in.

## Done means

- Zero grep hits for `legacyBlockType` and for `scalar_generic` as a single bucket, in all three repos, with the before/after counts reported.
- No alias, shim, deprecated export, or old word in any comment.
- `pnpm type-check` green · `check:shapes` / `check:content-ir:strict` / `check:protocol-sync` / `check_content_ir_twin.py` all pass.
- A Shape author can see the bindable primitives without reading source.
- Every block type still renders exactly as it did — the 95% path is byte-identical in behavior.

## Change Log

- 2026-08-17 — Created. C1 shipped and merged in all three repos; C2–C6 specified with measured scope; Q1–Q6 recorded; the four `main` CI defects found during verification documented with evidence.
