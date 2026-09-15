---
type: Reference
title: "data-to-kinds — Stage A (Distill)"
description: "The Stage A (Distill, aidream) procedure, steps 0-10: blast radius, real captures, shape tables, @kind models, adapters, publish, demo endpoint; read it when you are Stage A of a run. Companion to the data-to-kinds skill."
tags: [data-to-kinds, skills, stage-a]
timestamp: 2026-09-10T00:00:00Z
---

# Stage A — Distill (aidream)

## Contents

- 0. Map the blast radius FIRST
- 1. Find the source's ONE engine and capture real data
- 2. Complete the source
- 3. Check what already exists BEFORE proposing
- 4. Propose shapes as markdown tables
- 5. Record Arman's rulings — no table-approval stop
- 6. Build the models with the SDK
- 7. Build one translation adapter per provider
- 8. Publish — dry-run first, then apply
- 9. Ship the demo endpoint
- 10. No gate — update the ledger and fire Stage B

0. **Map the blast radius FIRST — it gates the keep/drop tables.** You cannot ask Arman to
   approve dropping a field without knowing who reads it. Produce the full consumer set for the
   family's existing slugs across **all five surfaces** and paste it into the ledger; the
   enumeration, the live counts, and the reason grep alone returns a clean wrong answer are in
   [`common-docs/operations/kind-conversion-board.md`](../../operations/kind-conversion-board.md)
   § four consumer surfaces — **read it, do not improvise this step**. In short: code (all repos)
   is one surface; the others are DB rows (`mandate.definition.output_kind` and
   `mandate.provision.derived_input_kind`, joined on `provision_key` — `agent.mandate` no longer
   exists, verified live 2026-09-10; `content_ir.kind_component`, `workflow.trigger.kind`), persisted history
   (`workflow.node_outcome`, `node_data_slot`, `hindsight.replay_step`, `kind_instance`/
   `kind_example`), and generated artifacts (`.gen.ts`, compiled mirrors, matrx-extend). **And a
   FIFTH, found 2026-08-25 after four were called complete: DATABASE FUNCTIONS AND TRIGGERS** —
   `pg_proc.prosrc`, where PL/pgSQL parses, validates, indexes and MINTS our shapes. No grep of any
   repo returns a deployed function body, and `kind_consumers.py` reads DB rows, not function
   source. A live example: `context.parse_reference_fence` returned NULL for the new shape while
   `context.provision_scope_dataset` kept minting the old one — invisible to every other surface. When
   `scripts/kind_consumers.py` exists, run it and paste its output instead of hand-building the
   list. Register the family on the conversion board at G1/G2 before you go further.
1. **Find the source's ONE engine and capture real data.** Locate the live client the nodes use
   (duplicated API clients are a defect — fix on sight, one engine, specialised layers above it).
   Call it with real credentials from platform config across 4–6 query archetypes that exercise
   every section the provider can return; save each raw response as a test fixture in the family
   module (`aidream/services/<family>_kinds/tests/fixtures/<provider>_<archetype>.json`). Never
   fabricate samples. Note measured findings (sections that never appeared, formats) in the ledger.
2. **Complete the source (mandatory, non-blocking).** Survey the provider's full surface vs what
   we call today and fire a recon chip (pattern: `systems/content-ir-system/SEARCH_PROVIDER_RECON.md`
   — endpoints, verticals, params, response sections, plan sizing). Its findings land in the ledger
   as follow-up capability work. Distillation proceeds without waiting.
3. **Check what already exists BEFORE proposing.** Registry (`content_ir.kind_definition`, slugs +
   `metadata.maturity`/`family`), the well-known primitives (`rating`, `opening_hours`,
   `postal_address`, `geo_coordinates`, …), `aidream/kinds/<domain>.py` (the army's `@kind`
   placeholders — your family may already have placeholder rows you will UPGRADE, not re-mint),
   `NOMENCLATURE.md` + the lexicon for names. A near-duplicate slug is a defect; reuse-or-supersede
   is a proposal to Arman, never a silent choice.
4. **Propose shapes as markdown tables — one per proposed kind:** field · type · required/
   optional · source path in the raw payload · kept/dropped + why; plus one table of DROPPED
   top-level sections + why; plus the layer diagram (collection → items → primitives). Multiple
   sources stay SEPARATE at first; after separate agreement, present the merge analysis (what
   shares a kind without losing provenance, what stays source-specific). Follow the distillation
   laws in SKILL.md. Bring him material he can rule on in one look; never JSON walls, never a question
   without its table (page/action/question).
5. **Do NOT stop for a table approval — Stage A has no gate** (gap #14 of 2026-08-24; SKILL.md
   pipeline table: Stage A gate "none"). The ONE approval gate is Arman's ruling on Stage B's
   rendered demo; tables are how you show your work when he asks, not the thing he signs. Every
   keep/drop/merge/require decision is still his — each row carries your recommendation, and he
   confirms or corrects. Write code without waiting. Record each ruling in the ledger's decisions
   section; generalize any standing rule into this skill.
6. **Build the models with the SDK** in a parallel path (`aidream/services/<family>_kinds/` or
   the family's `aidream/kinds/<domain>.py` for upgrades; live nodes untouched):
   ```python
   from matrx_graph.content_ir.model import KindModel
   from matrx_graph.content_ir.sdk import kind

   @kind("web_result", label="Web Result", family="search", maturity="distilled",
         example={...translated real capture...})
   class WebResult(KindModel):
       url: str
       title: str
       source: str            # provenance survives merging — a field, never a slug
       rating: Rating | None = None   # nested kinds are nested KindModels → kind_edge rows
   ```
   `KindModel` owns `__kind` entirely (declared `Literal` field, alias on both halves of the
   config); nested kinds are nested `KindModel`s; plain sub-structure that is not a kind is a
   `KindSubModel` (`matrx_graph.content_ir.model`: accepts the `__kind` marker live nested `$def`s
   declare, emits none), never a bare `BaseModel` (gap #27). `example=` is validated at import. Every field a distillation
   ADDS to an existing registered kind must be optional-with-default (the compatibility gate).
7. **Build one translation adapter per provider** (`<provider>_adapter.py`:
   `to_kind(raw) -> (Collection, TranslationReport)`) with per-section MAPPED/DROPPED key
   registers at the top of the file, and `KeyAudit` from **`matrx_graph.content_ir.audit`** — the
   ONE shared copy, which makes UNKNOWN keys scream (log + ops record, never raise) and captures
   every present DROPPED value. Identify yourself to it (`KeyAudit(SOURCE, family="<family>",
   adapter_hint="aidream/services/<family>_kinds/{provider}_adapter.py")`) so the scream still
   names the file to edit. Generic unification code (date parsing incl. relative dates →
   approximate ISO, HTML → text+links, durations, site-name derivation) is
   **`matrx_graph.content_ir.translate`**; only translators that touch YOUR models go in a local
   `translate.py`. Reference implementation: `aidream/aidream/services/search_kinds/`. Tests over
   the real fixtures; the core assertion is every fixture translates **fully accounted** (zero
   unknown keys). `uv run pytest aidream/services/<family>_kinds/tests` green.
8. **Publish — dry-run first, then apply:**
   ```bash
   uv run python scripts/publish_kind_catalog.py aidream.<module.path>            # plan, read-only
   AGENT_USER_ID=<your user id> uv run python scripts/publish_kind_catalog.py aidream.<module.path> --apply
   ```
   Creates definition + canonical example + `kind_edge` rows, system org, `visibility='public'`,
   syncs `metadata.maturity` from the decorator. **Drift never auto-applies:** an existing slug
   whose live schema differs exits 2 — add `--evolve` for additive-optional drift (passes the
   BACKWARD gate, bumps version), `--breaking <slug>` per slug only for a deliberate narrowing
   after you checked what old payloads contain. Kinds land **INACTIVE by design** — the
   activation dual gate (`content_ir.set_kind_activation`) needs an active role=`output`
   `kind_component`, which Stage B supplies; do not promise activation in Stage A. A slug a live
   consumer already holds (`faq_item` was nested under `seo_package`) is merged by the laws
   (fields go optional so both fit), never blind-updated.
9. **Ship the demo endpoint** — a thin router + service that runs the REAL engine and streams the
   kind JSON back (`aidream/api/routers/search_kinds.py` + `services/search_kinds/service.py`:
   `POST /api/<family>-kinds/<verb>` → `create_streaming_response` → `{result, translation}`).
   Deploy (repo release flow) and verify it live with a real call.
10. **No gate — finish and hand off** (gap #14 of 2026-08-24: Stage A does not stop to collect an
    approval; SKILL.md pipeline table: gate none → fire B). Update the ledger (Stage A DONE, slugs, endpoint,
    fixtures, what is cutover-gated), push, and **fire the Stage B chip** with the standalone
    prompt in SKILL.md § Chip prompts. If you cannot create a chip, write the exact prompt into the ledger and say so.
