---
status: active
updated: 2026-08-17
repos: [matrx-frontend, aidream, common-docs]
vision:
  [
    /Users/armanisadeghi/code/common-docs/systems/content-ir-system/UNIFICATION.md,
    /Users/armanisadeghi/code/common-docs/systems/content-ir-system/NOMENCLATURE.md,
    /Users/armanisadeghi/code/common-docs/systems/vocabulary/FEATURE.md,
  ]
---

# Content IR — the one-system campaign (nomenclature + unification)

An orchestrating session owns this (2026-08-17) and has chips in flight — read "Remaining work"
before starting anything, so you don't collide with a running chip.

## Vision — Arman's words (2026-08-17)

> **"It's one system, and it needs to be one system."** Actions and Content IR were created the
> same day as one system; the `__kind` underscores and the `matrx_version` wrapper were two
> encodings of one idea. *"They're just a family of content IRs. That's all it is."* Actions =
> the automated family (*"some actions can actually do things"*); block types = *"content IR
> without a schema — if they're not JSON, it's XML, it's markdown"*; artifacts: merging them in
> is overdue. And explicitly: *"we will never have everything be a JSON object"* — arrival forms
> are permanent; unification is registry + vocabulary, never wire coercion.

> 🚨 **THE CONSTRAINT:** ~95% of everything we render goes through the primitives (mostly XML);
> they are great and NOT going away. **Every block-type string value, route, dispatch outcome,
> and stored content byte is FROZEN.** A change that alters behavior is a defect.

Full ruling + phases U1–U4: `common-docs/systems/content-ir-system/UNIFICATION.md` (U1 docs are
DONE; U4 is gated on Arman's blocked Action/Function naming cluster — do not start it).

## Rules binding every piece of work

- Freeze values (above). Go all the way (lexicon Law 4). Leave nothing behind — no alias, shim,
  deprecated export, or old word in a comment.
- Twinned files (`registry/kind-registry.types.ts`, `kind-dual-gate.ts`, `core/`) → run
  `python scripts/sync_content_ir_core.py` from the aidream root; prove
  `python scripts/check_content_ir_twin.py` passes.
- Verify: `pnpm type-check` · `pnpm check:shapes` · `pnpm check:content-ir:strict` no worse than
  before; regenerate generated files, never hand-edit. Report before/after grep counts → zero.
- Protocol mirror: `MATRX_ENVELOPE.md` / `MATRX_REFERENCES.md` are byte-mirrored (edit aidream,
  then `pnpm check:protocol-sync:fix` here). `MATRX_ACTIONS.md` is deliberately NOT mirrored.

## Remaining work

| # | What | Owner / state |
|---|---|---|
| C2 | `legacyBlockType` → `primitive` (136 occ / 71 files FE + 14 aidream; code-only; twin sync mandatory; the word "legacy" must not survive) | **Chip dispatched 2026-08-17** |
| C3 | Split `scalar_generic` → `primitive` + `io_generic` (crosswalk rule tables are the authority; aidream `data_render_blocks.py` moves in the SAME commit; `block-dispatch.test.tsx` proves byte-equivalence) | **Chip dispatched 2026-08-17** |
| C5 | `media_block` `kind:"document"` renders null — build the inline preview on `DocumentBlock.page1Url` via the canonical file handler | **Chip dispatched 2026-08-17** |
| C4 | **Primitive Binding registry** — generated (from the primitive dispatch tables + `BlockComponents`, truth-vs-code guarded), each row: primitive key · component · expected payload · props_transform-needed. Consumers: shape doctor, admin kind-registry, `/shapes`, the `content_ir.kind_creator`/`kind_architect` Mandate contexts. Extend `props_transform` to `source='bundled'`. Ship THE LAW (a Shape that maps onto a primitive BINDS, never a new component) into both repos' `CLAUDE.md` + `features/content-ir/FEATURE.md` | **Orchestrating session, after C2 ∥ C3 land** |
| C6 | `family` prose sweep (aidream `MATRX_ACTIONS.md` §§2–7 done at definition level only, `MATRX_ENVELOPE.md` §registry/§contracts/invariants, `MATRX_REFERENCES.md`, both envelope FEATURE.mds, the `matrx-envelope` skill, `kind_definition.metadata.category` prose). Envelope-side CODE identifiers stay `kind` until U4 — prose only | **Chip dispatched 2026-08-17** |
| U2 | One-registry identity: register artifact types + the `item-presentation` noun set as kinds (registration-without-detection precedent 2026-07-17; zero behavior change; `artifact-type-registry` keeps rendering until provably redundant) | After C2–C4 |
| U3 | Additive wire convergence: register the `matrx_action` kind (`__kind:"matrx_action"` wrapping a standard envelope → the ONE detector → protocol handler) + the ` ```matrx ` fence `kind_surface` row. Old encodings valid forever. Careful protocol work — the 12 envelope invariants bind | After U2 |
| U4 | The ONE envelope revision: wire `kind`→`family` + the `items` and `type` collisions, dual-read decoder, one stored-content migration | **BLOCKED on Arman** (Action/Function naming cluster) |

Independent defect chips also dispatched 2026-08-17 (all four `main` CI defects from the
verification sweep): workflow-studio missing edge-note constants · stale
`package_db_wiring.py` · `web_url_changes` router-thinness extraction · test-collection
side-effect-free imports (architecture approved by Arman: no import-time I/O, explicit startup
call, fixtures for the 5 test modules; the loud raise stays).

## Resources

- Frontend operating detail: `features/content-ir/FEATURE.md` + `docs/SHAPE_SYSTEM.md` (both
  carry the ruling). Crosswalk authority: `scripts/shape/generate-content-vocab-crosswalk.ts`.
  Binding mechanics: `registry/system-components.ts` → `react/kind-route.ts` →
  `kinds/legacy-bridge-utils.ts` (renamed by C2).
- Actions protocol: `aidream/docs/protocol/MATRX_ACTIONS.md` (§7 carries the one-system
  mandate) · envelope core: `aidream/services/matrx_envelope/`.
- No DB column is involved in C2 (confirmed vs `types/database.types.ts`).

## Done

- C1 — docs + lexicon shipped in all three repos; mirror verified byte-identical.
- Q1–Q6 all answered by Arman 2026-08-17; rulings recorded in UNIFICATION.md / NOMENCLATURE.md /
  the lexicon (O-1..O-4 ruled; all five names explicitly confirmed).
- U1 — one-vocabulary docs landed: UNIFICATION.md created; MATRX_ACTIONS.md §7 mandated; lexicon
  banner added; NOMENCLATURE.md updated to ruled status.

## Decisions needed

None here. The only gate is the already-tracked Action/Function naming cluster (lexicon
Unsettled table), which unblocks U4.
