# Knowledge Provenance & Truth Model

> **⚠️ All scoring is canonical in [`04_matrx_quality_model.md`](04_matrx_quality_model.md).** That document is the single source of truth for *every* quality / trust / authority score — the **Quality Vector** (`source_quality`, `capture_quality`, `faithfulness`, `alignment`, `coverage`, `utility_value`, `composite_quality`), log-odds propagation, the three utility effect types (`preserve` / `additive_impact` / `targeted_transform`), composite profiles, quality events, lineage edges, and seeding controls (`can_be_seeded` / `seed_policy`). **This doc covers lineage, the four content roles, and how provenance attaches to scopes — NOT the scoring math.** The coarse "authority tier / transformation type" framing below is a conceptual lens; **where it differs from `04`, `04` wins.** Do not re-explain scoring anywhere but `04`.

## Core idea — two independent axes
- **Provenance (lineage):** where a thing came from and what it passed through.
- **Authority (truth confidence *now*):** how much we trust it as fact at this moment.

Lineage alone is not enough. In an AI system, processing can make something **more**
true (validation, cross-checking) or **less** true (lossy compression). So authority
is tracked separately from lineage and is allowed to change.

This is a **layer that rides alongside** scopes and the pipeline. It does not change
the scope hierarchy or the M2M assignment model — it only annotates trust.

## Source of truth — two roles, never competing (DECIDED 2026-06-06)
"Source of truth" is **two** things answering two questions — they never compete:
- **Provenance root** — the immutable original (the PDF, the audio). Never rewritten. Anchors `source_quality`. *Truth-of-record* — what verification walks back to.
- **Canonical working copy** — the artifact the system *prefers to read, serve, and seed* for a purpose. **Can** be a promoted derived artifact (clean text, validated JSON). A **pointer/flag, not a rewrite**; promotion goes through the seeding/promotion gate (`04`).

Retrieval prefers the **canonical working copy** (cleaner, cheaper); verification walks lineage back to the **provenance root** (truth). This single distinction drives drill-down (§5c of [`agent-knowledge-access.md`](agent-knowledge-access.md)) and fan-out.

**Lineage is a DAG, not a pointer.** The legacy single `(source_kind, source_id)` parent is replaced by `artifact_lineage_edges(parent_artifact_id, child_artifact_id, utility_id, utility_version, quality_event_id, edge_type)` — schema + traversal contracts canonical in [`04`](04_matrx_quality_model.md) §22. **Every RAG chunk is an artifact node** (own quality vector + edges), not a lone pointer. Node flags: `is_provenance_root` (originals only), `canonical_for` (the promoted working copy), plus `can_be_seeded` / `seed_policy`.

## Deletion & erasure — the user is the ultimate boss (DECIDED 2026-06-06)
"Retain by default" means **the system never auto-drops content just because it finished reading it** — it does **not** mean the system refuses deletion. The user owns their data and may delete anything. Our only jobs are to (1) **warn** when the target is an anchor/source feeding a derived cluster, and (2) **tombstone** instead of hard-vanish so the graph doesn't dangle. Nothing more — it is not our job to protect the user from themselves.

**Tombstone (the immutable-root reconciliation):** deleting a provenance root **purges its bytes/content** but keeps the **node shell + lineage edges + quality vectors**. The graph stays walkable, derived artifacts keep their ancestry, and a drill-down to a redacted root returns a tombstone marker ("content removed"), not a broken link. This satisfies legal *delete-the-document* obligations without collapsing the lineage DAG. Data model: [`04`](04_matrx_quality_model.md) §22.7.

**Cascade vs survive — user's choice, sane default:** on anchor deletion, derived artifacts (clean text, extractions) **survive by default** — they're independent artifacts the user often wants. The warning **offers one-click cascade-redaction** (tombstone the whole derived subtree) for true right-to-be-forgotten / legal-hold release, since a derived clean copy can carry the same sensitive bytes. We surface the choice; the user decides.

## Four content roles
| Role | Meaning | Truth value |
|---|---|---|
| **Source** | knowledge enters here | inherent (ranges high → low) |
| **Destination** | knowledge is produced / refined here | earned, conditional on what made it |
| **Utility** | operates on / transforms knowledge | none itself — it *transforms* authority |
| **Container** | holds / groups other entities (operational — tasks, projects, batches) | none itself — it *organizes*, doesn't transform |

## The formula (conceptual — the real math is in `04`)
```
input_authority  ×  utility_transformation  =  output_authority
```
A weak source through a strong validation tool can outrank a strong source through a lossy one. Truth is **earned**, not inherited. **The actual computation** — log-odds propagation and the three effect types (`preserve` / `additive_impact` / `targeted_transform`) — is defined in [`04_matrx_quality_model.md`](04_matrx_quality_model.md). This line is just the intuition.

## Authority tiers
- **primary** — assumed factual (court transcripts, official filings, Cleveland Clinic). Seeds the system.
- **derived** — produced by a trusted process; confidence is conditional.
- **unvalidated** — raw input (web scrapes, first-draft notes). Must be processed before trust.

## Utility transformation types
| Type | Effect on confidence | Example |
|---|---|---|
| validation | ↑ increases | cross-check attorney notes against the transcript |
| synthesis | ≈ / slight ↑ | combine multiple good sources |
| distillation | ≈ neutral | extract key points |
| abstraction | ↓ decreases | summary of a summary; heavy compression |

## Now DEFINED in `04` (no longer undecided)

1. **Quality / trust scoring — DECIDED.** It is **not** one number: it is the **Quality Vector** + a purpose-dependent **composite**, propagated in log-odds space per [`04_matrx_quality_model.md`](04_matrx_quality_model.md). Extraction confidence stays a *mechanical capture signal*, never the composite. Encode per `04`.
2. **Seeding control (anti-sprouting) — GOVERNED by `04`.** Hard rule: **derived artifacts do not automatically become trusted seed sources.** Seeding requires explicit `seed_policy` / validation / human approval (`can_be_seeded`). Definition + fields live in `04`.

> **Three score types — never conflate (a `04` corollary):** (1) **Quality** = the artifact's quality vector/composite — canonical in `04`. (2) **Scope match confidence** = an agent's guess that content matches a *known* scope/item — [`scope-association-pipeline.md`](scope-association-pipeline.md). (3) **NER extraction confidence** = a model's mechanical certainty it pulled an entity correctly. Separate axes, separate storage.

## Maps onto scope-value `source_type`
The scope model already tags each value with `source_type`
(`user_input` / `ai_generated` / `imported` / `system`). That is the same idea at the
value layer — so generalize it rather than duplicating it:
- `source_type` = how it was produced.
- `authority_tier` = how much we trust it now (primary / derived / unvalidated).
- quality scores = the **`04` Quality Vector + composite** (not a single `confidence_score`); `source_type` / `authority_tier` are coarse inputs to it.

Rough mapping: `user_input` + trusted `imported` → **primary**; `system` + reviewed
`ai_generated` → **derived**; raw scraped/imported + unreviewed `ai_generated` → **unvalidated**.

## Entities anchor to an artifact — they do NOT carry parallel lineage
An entity isn't an artifact — it is **extracted from** one. So a mention anchors to a single artifact node and **inherits trust through the graph**, never duplicating it:
```
EntityMention {
  text, kind, span,
  extracted_from_artifact_id,        // the ONE anchor (e.g. the JSON chunk)
  extraction_confidence,             // mechanical only (NER capture signal)
  transformation_flags: [...],       // per-artifact meaning signal, e.g. "inferred_date"
  human_verification: null,
}
```
"It also appears in the clean text and the raw PDF" is **derived** by walking lineage edges from the anchor — not stored. The resolved entity (Phase 6 step 2) groups mentions across artifacts; trust comes from each anchor artifact's quality vector. Detail: [`04`](04_matrx_quality_model.md) §22.

## Where it plugs into the 5-stage pipeline
1. **Extract** — each mention **anchors to its artifact** (`extracted_from_artifact_id`); trust is inherited from that node, not copied onto the entity.
2. **Resolve** — a merge keeps the highest authority among the merged mentions.
3. **Score importance** — provenance weights importance (official > raw in the same scope).
4. **Link to scopes** — AI links are *suggestions* (→ `scope_association_suggestions`),
   never overwrites of ground-truth scope values; a human confirms before a value is written.
   (Accept writes into `ctx_context_item_values` via `set_context_value()`.)
5. **Store** — each chunk carries entities, importance, scope links, `authority_tier`,
   `confidence_score`, `content_role`, and lineage, alongside its embedding.

## Suggested entity fields (provenance/lineage only — quality fields are owned by `04`)
- `content_role` — source | destination | utility | container (multi allowed)
- `authority_tier` — primary | derived | unvalidated *(coarse lens; canonical scoring is the `04` Quality Vector)*
- `utility_transformation_type` — maps to `04`'s effect types (`preserve` / `additive_impact` / `targeted_transform`)
- **artifact lineage** — NOT stored per-entity. Lives on the artifact graph (`04` `artifact_lineage_edges`); an entity anchors via `extracted_from_artifact_id` and inherits trust through the graph (see entity-anchoring section above).

**Quality / seeding fields** — `source_quality`, `capture_quality`, `faithfulness`, `alignment`, `coverage`, `utility_value`, `composite_quality`, `can_be_seeded`, `seed_policy` — are **defined and owned by [`04_matrx_quality_model.md`](04_matrx_quality_model.md)**. Do not redefine them here.