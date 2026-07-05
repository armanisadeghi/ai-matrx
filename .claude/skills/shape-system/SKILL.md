---
name: shape-system
description: The canonical recipe for working with the Shape System — the platform-wide structured-content registry (content_ir.kind_definition + kind_surface / kind_component / kind_example). Use whenever a task involves adding or activating a kind ("add a kind", "new shape", "new structured content type", "render block" for a kind-shaped payload), writing or reading `__kind` JSON, kind schemas, samples ("sample", "dual gate", "activate a kind"), detection surfaces (XML tag / fence language → kind), kind components, content blocks or skills that teach a kind, workflow node input_kind/output_kind, or binding an agent's structured output to a kind. Read BEFORE touching any content_ir table or any kind asset. Never build a parallel registry, detector, or sample store.
---

# Shape System — how to add to it (and never around it)

**Glossary:** "Shape" = product name; **"kind"** = the technical noun (`content_ir.kind_definition.kind`). One kind = one named, versioned structure that every platform (web, Python, workflow-studio, React Native later) validates and renders against.

**Operating doc (read it):** [`features/content-ir/docs/SHAPE_SYSTEM.md`](../../../features/content-ir/docs/SHAPE_SYSTEM.md) — rulings, posture, roadmap. FEATURE.md invariants: [`features/content-ir/FEATURE.md`](../../../features/content-ir/FEATURE.md).

## The model in three lines

- A Shape carries 7 assets: schema · skill(s) · content block · output component · input component · samples (`kind_example`) · pydantic mirror.
- Every input surface (`__kind` JSON, XML tag, fence, tool result) converges to canonical `__kind` JSON at DETECTION (`kind_surface` is the one list). Below that boundary everything is format-agnostic by construction.
- Consumers: agent outputs, **workflow node I/O (live)**, tool results (Stage 7), custom apps.

## Adding a kind (the paved road)

1. **Schema** — insert the `kind_definition` row (fields in `data[]` for ts-owned; `emitted_json_schema` always; org = system org `39c38960-d30c-4840-b0c1-c9960de95582` for platform kinds, `visibility='public'`). Python-owned kinds derive the schema from the pydantic model: `Model.model_json_schema()` — never hand-write what a model can emit. Idempotent SQL, applied via Supabase MCP, ledgered in `public._schema_migrations`.
2. **Sample** — one `kind_example` row per kind@version (`is_canonical=true`, `validation_status='passed'` only after REAL validation — run `Draft202012Validator`/ajv yourself). The dual gate (`registry/kind-dual-gate.ts`) is the activation law: structural leg (ajv over `emitted_json_schema`) + render leg (bridge produces real serverData) → `is_active`.
3. **Component** — register the web component; a kind without a component stays `is_active=false` and renders the generic viewer (correct, not a failure).
4. **Skill + content block** — one skill per kind per syntax (`kind_<slug>` JSON / `kind_<slug>_xml`); skill bodies teach the REAL parser failure modes. Blocks pair with the skill under the **Agent Skills** category (two per skill: simple + complex), linked via `platform.associations`. Coexist-not-clobber: never overwrite a live legacy block; use a `-kind` suffix during transition.
5. **Surface** (if the kind has a non-JSON arrival form) — one `kind_surface` row (`surface_type`, `token`, named `parser_strategy`). Never add a tag/fence literal to `stream-block-accumulator.ts` / `content-splitter-v2.ts` / `block_detector.py` — those lists are frozen and die in Phase 7.

## Workflow node I/O (live)

- `NodeSpec.output_kind` is MANDATORY for non-dynamic nodes (structural kind for stable shapes; generic `json` minimum). `input_kind` gates inputs pre-execute. Per-node authored overrides: `data.input_kind` / `data.output_kind`. Read `packages/matrx-graph/docs/node-authoring.md` §kinds (aidream repo) before adding a node.
- Runtime: `matrx_graph.kinds.get_kind / validate_against_kind` (loud-fail-open). After ANY kind registry mutation call `invalidate_kind_catalog_cache()` (and remember the FE warm registry re-reads on its own cadence).
- LLM binding: `matrx_ai.kinds.response_format_for_kind(slug)` → strict portable response_format. Unknown/unportable kinds decline loudly with `None`.

## Hard rules

- **One registry.** Never a parallel kind list, detector, sample store, or component map. Extending `content_ir` IS the feature.
- **Verify live, never trust reports** — after any DB write, `execute_sql` the counts; after any render change, a runtime marker or screenshot.
- **XML is not legacy.** It is a permanent first-class input surface; the win is translation to `__kind`, not deletion.
- **Matrx Actions (MatrxEnvelope) is off-limits** except the collision guard and its `kind_surface` row. Its invariants are listed in SHAPE_SYSTEM.md.
- **`sample_data` on kind_definition is interim** — new samples go to `kind_example`; never add new readers of `sample_data`.
- **DB changes follow the db-change skill** (MCP apply → ledger → `pnpm db-types` → aidream `python db/generate.py` → live verify → both repos commit).

## Definition of done

Your kind's `pnpm check:shapes` row is green (once the doctor ships — until then: schema + passing canonical example + component-or-generic decision + skill/block per R9, each live-verified) **and** a preview screenshot exists. A kind with a fabricated `validation_status='passed'` is a defect.
