# Knowledge Provenance & Truth Model

## Core idea — two independent axes
- **Provenance (lineage):** where a thing came from and what it passed through.
- **Authority (truth confidence *now*):** how much we trust it as fact at this moment.

Lineage alone is not enough. In an AI system, processing can make something **more**
true (validation, cross-checking) or **less** true (lossy compression). So authority
is tracked separately from lineage and is allowed to change.

This is a **layer that rides alongside** scopes and the pipeline. It does not change
the scope hierarchy or the M2M assignment model — it only annotates trust.

## Three content roles
| Role | Meaning | Truth value |
|---|---|---|
| **Source** | knowledge enters here | inherent (ranges high → low) |
| **Destination** | knowledge is produced / refined here | earned, conditional on what made it |
| **Tool** | operates on knowledge | none itself — it *transforms* authority |

## The formula
```
input_authority  ×  tool_transformation  =  output_authority
```
A weak source through a strong validation tool can outrank a strong source through a lossy one. Truth is **earned**, not inherited.

## Authority tiers
- **primary** — assumed factual (court transcripts, official filings, Cleveland Clinic). Seeds the system.
- **derived** — produced by a trusted process; confidence is conditional.
- **unvalidated** — raw input (web scrapes, first-draft notes). Must be processed before trust.

## Tool transformation types
| Type | Effect on confidence | Example |
|---|---|---|
| validation | ↑ increases | cross-check attorney notes against the transcript |
| synthesis | ≈ / slight ↑ | combine multiple good sources |
| distillation | ≈ neutral | extract key points |
| abstraction | ↓ decreases | summary of a summary; heavy compression |

## The rule we are protecting (anti-sprouting)
Only **primary**, or **derived above a confidence threshold**, may be used as a
RAG / NER **seed** (i.e. ingested in Stage 1). This is the guard that stops a bad
output from re-entering the system as a false source and propagating.

## Promotion
A derived item becomes a seed **only** by passing a **validation gate** —
human approval or a trusted validation agent. Record `{gate, timestamp, approver}`.
Promotion is always explicit, never automatic.

## Maps onto scope-value `source_type`
The scope model already tags each value with `source_type`
(`user_input` / `ai_generated` / `imported` / `system`). That is the same idea at the
value layer — so generalize it rather than duplicating it:
- `source_type` = how it was produced.
- `authority_tier` = how much we trust it now (primary / derived / unvalidated).
- `confidence_score` = the 0–1 handle downstream systems use.

Rough mapping: `user_input` + trusted `imported` → **primary**; `system` + reviewed
`ai_generated` → **derived**; raw scraped/imported + unreviewed `ai_generated` → **unvalidated**.

## Where it plugs into the 5-stage pipeline
1. **Extract** — each entity inherits its document's tier + confidence.
2. **Resolve** — a merge keeps the highest authority among the merged mentions.
3. **Score importance** — provenance weights importance (official > raw in the same scope).
4. **Link to scopes** — AI links are *suggestions* (→ `scope_association_suggestions`),
   never overwrites of ground-truth scope values; human confirmation is a promotion gate.
   (Accept already writes into `ctx_context_item_values` via `set_context_value()`.)
5. **Store** — each chunk carries entities, importance, scope links, `authority_tier`,
   `confidence_score`, `content_role`, and lineage, alongside its embedding.

## Suggested entity fields
- `content_role` — source | destination | tool (multi allowed)
- `authority_tier` — primary | derived | unvalidated
- `tool_transformation_type` — validation | synthesis | distillation | abstraction | null
- `confidence_score` — 0–1 (seeded by tier, updated by each tool that touches it)
- `can_be_seeded` — bool
- `validation_gates_passed` — [{gate, ts, approver}]
- `derived_from` — entity refs (the lineage edges)