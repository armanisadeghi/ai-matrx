# Knowledge Provenance & Truth Model

## Core idea — two independent axes
- **Provenance (lineage):** where a thing came from and what it passed through.
- **Authority (truth confidence *now*):** how much we trust it as fact at this moment.

Lineage alone is not enough. In an AI system, processing can make something **more**
true (validation, cross-checking) or **less** true (lossy compression). So authority
is tracked separately from lineage and is allowed to change.

This is a **layer that rides alongside** scopes and the pipeline. It does not change
the scope hierarchy or the M2M assignment model — it only annotates trust.

## Four content roles
| Role | Meaning | Truth value |
|---|---|---|
| **Source** | knowledge enters here | inherent (ranges high → low) |
| **Destination** | knowledge is produced / refined here | earned, conditional on what made it |
| **Utility** | operates on / transforms knowledge | none itself — it *transforms* authority |
| **Container** | holds / groups other entities (operational — tasks, projects, batches) | none itself — it *organizes*, doesn't transform |

## The formula
```
input_authority  ×  utility_transformation  =  output_authority
```
A weak source through a strong validation tool can outrank a strong source through a lossy one. Truth is **earned**, not inherited.

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

## Future / undecided — do **not** encode in schema or code yet
Two things we *want* but have **not** decided. Treat both as guardrails (don't build as if settled), not gaps to silently fill.

1. **Quality / trust scoring.** How "good" a piece of knowledge is. We conflate several distinct signals (source prior, extraction confidence, validation deltas, the composite trust they should feed) into one number. **`confidence_score` below is a placeholder, not a contract** — extraction confidence is mechanical certainty, *not* truth.
2. **Seeding control (anti-sprouting).** We'd like a guard so a low-authority derived item (e.g. an AI-generated flashcard) can't be re-ingested as if it were an authoritative source and propagate errors. The mechanism — a seeding gate, a promotion step, which authority threshold — is **undecided**, and it depends on (1): you can't gate on authority you can't yet score. *Non-binding suggestion:* when we tackle it, gate on an explicit human/validation-set `can_be_seeded` flag, never on an auto-computed score.

## Maps onto scope-value `source_type`
The scope model already tags each value with `source_type`
(`user_input` / `ai_generated` / `imported` / `system`). That is the same idea at the
value layer — so generalize it rather than duplicating it:
- `source_type` = how it was produced.
- `authority_tier` = how much we trust it now (primary / derived / unvalidated).
- `confidence_score` = a single 0–1 handle — **undecided / placeholder** (see Future section); do not treat as settled.

Rough mapping: `user_input` + trusted `imported` → **primary**; `system` + reviewed
`ai_generated` → **derived**; raw scraped/imported + unreviewed `ai_generated` → **unvalidated**.

## Where it plugs into the 5-stage pipeline
1. **Extract** — each entity inherits its document's tier + confidence.
2. **Resolve** — a merge keeps the highest authority among the merged mentions.
3. **Score importance** — provenance weights importance (official > raw in the same scope).
4. **Link to scopes** — AI links are *suggestions* (→ `scope_association_suggestions`),
   never overwrites of ground-truth scope values; a human confirms before a value is written.
   (Accept writes into `ctx_context_item_values` via `set_context_value()`.)
5. **Store** — each chunk carries entities, importance, scope links, `authority_tier`,
   `confidence_score`, `content_role`, and lineage, alongside its embedding.

## Suggested entity fields
- `content_role` — source | destination | utility | container (multi allowed)
- `authority_tier` — primary | derived | unvalidated
- `utility_transformation_type` — validation | synthesis | distillation | abstraction | null
- `confidence_score` — 0–1 *(undecided / placeholder — see Future section)*
- `can_be_seeded` — bool *(ties to the undecided seeding control — future)*
- `validation_gates_passed` — [{gate, ts, approver}] *(future, with seeding control)*
- `derived_from` — entity refs (the lineage edges)