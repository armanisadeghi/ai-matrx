# The Shape System — operating doc

> **Naming rule:** "Shape" is the product name of the system; **"kind"** is the technical noun (`content_ir.kind_definition.kind`). CLI namespace is `shape:*`; DB and code vocabulary stays `kind`.
>
> Companion concept doc: [`content-ir-kind-full-system.md`](./content-ir-kind-full-system.md). Program plan of record: `~/.claude/plans/please-review-this-plan-serialized-parrot.md` (this doc is the durable extract).

---

## The model

**1 atom** — the **Shape**: a named, versioned structure. Home: `content_ir.kind_definition` + `kind_edge`, read via `kind_definition_version`.

**7 assets per Shape:** schema · skill(s) · content block · output component · input component · samples (`kind_example`) · pydantic mirror.

**3 machines:** detection (`kind_surface` — every input surface normalizes to canonical `__kind` JSON at the boundary) · registry/resolver (`kind_component`: (kind, platform, role) → component) · artifact + state.

**4 consumers:** agent outputs · **workflow node I/O (live since 2026-07-05)** · tool results · custom apps.

**THE KEYSTONE — convergence at detection.** A Shape arrives on many surfaces (`__kind` JSON, XML tags, fences, tool results, markdown). The instant a detector recognizes Shape X it emits the canonical `__kind` JSON; the arrival format is discarded. Below the boundary everything is format-agnostic **by construction**. Split-per-format assets (skill, content block, detection) sit ABOVE the boundary; shared assets (schema, components, samples, pydantic, artifact/state) sit BELOW.

## The posture (read before judging any inventory)

- **Importance inversion.** What adheres today (flashcards, quiz) was the low-stakes testbed. What doesn't adhere (Matrx Actions, the XML render pipeline, the variable form system, tool results) is the mission-critical production material that was deliberately kept off the system until it had a real home. **Adoption = bridging real systems IN, not polishing testbeds.**
- **Borrow, don't conquer.** The render pipeline (`content-splitter-v2` + accumulator) transitions to **dual-mode**: XML stays a first-class *input surface* permanently (LLMs emit it easily); `__kind` JSON is the *internal* form. Content blocks are a borrowed delivery vehicle into the user's context menu — we don't own that system. The form system (`VariableDefinition` → `VariableInputComponent`) is production — the input-component asset is a **bridge** to it, never a new form builder.
- **Matrx Actions is the elder sibling** — the origin system this generalizes, live in production. Its 12 invariants are constraints on us (envelope detected by `matrx_version` presence only; position invariants; handler = only side-effect path; no parallel encodings; …). The only sanctioned touches near it: the kind-slug collision guard and a ` ```matrx ` `kind_surface` row routing to the protocol handler. Actions↔kinds convergence is deferred (Arman's call); `kind_definition.metadata` carries the safety vocabulary (`category: pure|side_effect|sensitive`) so either direction needs no schema change.

## Rulings (settled)

| # | Ruling |
|---|---|
| R1 | Component resolver = `content_ir.kind_component` ((kind, platform, role) → `component_key`; platforms incl. `react-native`; `source: bundled\|db`, db = web sandbox only). `skill.render_definition` stays the palette; `skill.render_component` gets graveyarded (Stage 3). |
| R2 | Detection registry = `content_ir.kind_surface` (UNIQUE (surface_type, token); named `parser_strategy` implemented in BOTH runtimes; generator emits byte-identical compiled bootstraps both sides). Control tags (thinking/reasoning/plan/…) are NOT Shapes — code-owned. |
| R3 | Wire formats: `__kind` = the one internal content representation · `metadata.__ir` = parse-provenance cache (never authored) · MatrxEnvelope = the action protocol, untouched. |
| R4 | Samples live in `kind_example` (version-bound, many per kind@version, `is_canonical` partial-unique, `source: authored\|captured\|migrated\|synthetic`); fresh-capture via `kind_definition.capture_until/capture_target`; `sample_data` migrates then DROPS. |
| R5 | Input components: bridge kind fields → `VariableDefinition` (`kindFieldsToVariableDefinitions`); workflow-studio keeps AutoForm (kind's `emitted_json_schema` slots in). Nested fields v1 = structured-JSON textarea. |
| R6 | `is_active` gates render-trust at the resolver seam (inactive/unknown → generic viewer, never an error). Envelope staleness: `kindVersion` stamped in envelopes; mismatch → cheap re-parse. |
| R7 | Stateful Shapes: `canvas.canvas_items.state` jsonb + `cx_canvas_update_state` (no version bump); context injects `{__kind, id, data, state}` capped ~8KB. |
| R8 | Python order: fingerprint parity (HARD gate on any `__ir` emission) → emission complete-only at persistence → kind cache invalidation → `response_format_for_kind` ✅ → node `output_kind` ✅ → tool `output_kind` LAST. |
| R9 | Skill-paired content blocks live under the **Agent Skills** category tree, linked via `platform.associations`, **two per skill (one simple, one complex)**. Skills: one per kind per syntax — `kind_<slug>` (JSON) / `kind_<slug>_xml`. Coexist-not-clobber (`-kind` suffix) during transition. |
| R10 | Status is **GENERATED** (`shape-doctor` → `check:shapes` → `SHAPES_STATUS.md` + admin board), never hand-maintained. Per-kind prose lives in `kind_definition.description`. |

## Workflow I/O as kinds (LIVE — the first mission-critical consumer)

- `NodeSpec.input_kind/output_kind`; per-node authored overrides `data.input_kind`/`data.output_kind`; all built-ins kind-typed (structural kinds for stable shapes, generic `json`/`text`/… for pass-through; `io.user_input` = inline anonymous shape).
- Scheduler: input kind gates pre-execute (fatal, per-field); output drift logs loudly, never fails a run; `output_kind` on every `NodeOutcome`, `node_completed` event, and `workflow.node_outcome.output_kind`.
- Catalog runtime: `matrx_graph.kinds` (`get_kind`/`validate_against_kind`/`invalidate_kind_catalog_cache`, loud-fail-open). LLM binding: `matrx_ai.kinds.response_format_for_kind(slug)` (portable strict schema via the lint gate).
- Authoring rule: **read `packages/matrx-graph/docs/node-authoring.md` §"Declare your I/O as platform kinds" before adding a node.**

## Roadmap (stages; W = done 2026-07-05)

**W ✅** workflow I/O · **0** this doc + skill + doctor (`check:shapes`) + envelope collision guard · **1** flashcards vertical incl. keystone (`<flashcards>` XML → kind → same component), minimal resolver + `is_active` gate, `[kind]` preview route, `shape:sample` CLI, Python fingerprint parity starts · **2** `kind_example` at scale + capture windows + `shape:new`/`shape:skill` generators + `sample_data` DROP · **3** resolver sweep (all kinds' web components registered; skl annihilation) · **4** input bridge (`kindFieldsToVariableDefinitions`) · **5a** full surface seeding + generated bootstraps swap into accumulator/splitter/`block_detector` · **5b** `__ir` emission (fingerprint-gated) + pydantic binding · **6** per-kind sweep (doctor-arbitrated) · **7** tools `output_kind` (LAST) + React Native maps (first external platform) + user/org render preferences.

## Laws

- **Verify live, never trust reports** — DB counts by `execute_sql`, renders by runtime marker/screenshot.
- **Additive first; a paved alternative ships before its guardrail.**
- **Loud recovery** — every fail-open path logs at ERROR; a silent fallback is a defect.
- **Definition of done for a Shape:** its `check:shapes` row is green + a preview screenshot.

## Change Log

- 2026-07-05 — Created (Stage 0). Stage W recorded: 3 new content_ir tables, 11 workflow-I/O kinds, engine integration, `response_format_for_kind`.
