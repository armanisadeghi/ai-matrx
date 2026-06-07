# Matrx Quality Model

Status: Draft specification  
Scope: Global quality propagation rules for sources, artifacts, utilities, lineage, retrieval, ranking, and agent decision-making.  
Industry assumptions: None. This model must not encode domain-specific concepts such as courts, transcripts, classrooms, patients, cases, students, or any other industry objects.

---

## 1. Purpose

The Matrx Quality Model provides a standard way to assign, propagate, degrade, improve, and explain quality scores as content moves through the system.

The system ingests many kinds of inputs, transforms them through utilities, produces derived artifacts, and later reuses those artifacts for search, generation, automation, and decision support. Every source, artifact, and derived output needs a quality profile that can update automatically without requiring constant human judgment.

The goal is not to prove truth. The goal is to maintain a practical, bounded, explainable estimate of quality based on source strength, capture fidelity, transformation behavior, lineage, validation, and task alignment.

---

## 2. Core Rule

Quality is not one overloaded number internally.

Internally, each artifact has a **Quality Vector**. Externally, users may see one simplified **Composite Quality** score.

```text
User sees:
Quality: 87

System stores/derives:
source_quality: 98
capture_quality: 99
faithfulness: 78
alignment: 85
coverage: 90
utility_value: 88
composite_quality: 87
```

Do not collapse signals too early. Keep the component scores available so agents, retrieval, ranking, and UI explanations can understand *why* an artifact has its final score.

---

## 3. Canonical Terminology

### 3.1 Source

A **Source** is any original input or upstream artifact from which knowledge enters or re-enters the system.

A source can be external, user-created, imported, generated, or derived. Source does not mean “perfect.” It only means “this is being used as an input to something else.”

Examples of possible sources, without domain assumptions:

```text
uploaded file
web page
audio recording
chat message
structured row
image
existing artifact
human-written note
AI-generated summary
previously created flashcard
```

### 3.2 Artifact

An **Artifact** is any stored object in the system that can carry quality metadata.

Artifacts may be raw, cleaned, transformed, generated, validated, or derived.

Examples:

```text
raw file
converted text
chunk
summary
extraction
classification
flashcard
quiz
answer
note
agent output
research synthesis
structured record
```

### 3.3 Utility

A **Utility** is any process that operates on one or more inputs and may produce, modify, validate, or route artifacts.

Examples:

```text
importer
converter
OCR engine
transcriber
chunker
cleaner
summarizer
extractor
classifier
generator
validator
ranker
merger
human review action
```

A utility does not have to be AI. A utility can be deterministic code, an AI agent, a human action, or a hybrid process.

### 3.4 Quality Event

A **Quality Event** is a recorded quality-affecting operation.

Every meaningful utility run should create a quality event that records:

```text
input_artifact_ids
output_artifact_ids
utility_id
utility_version
effect_type
quality_inputs
quality_outputs
parameters used
actor_type
created_at
explanation
```

Quality events are part of provenance. They make quality explainable and reprocessable.

### 3.5 Lineage

**Lineage** is the chain of sources, artifacts, utilities, and quality events that produced an artifact.

Lineage must be preserved. A derived artifact must never lose awareness of its upstream dependencies.

### 3.6 Quality Laundering

**Quality laundering** happens when a weak or lossy upstream artifact is transformed into a polished downstream artifact that appears more trustworthy than its lineage supports.

Quality laundering must be prevented.

A generated artifact may become more useful, clearer, or better structured than its parent, but it must not automatically become more authoritative than the source chain allows.

---

## 4. User-Facing Score Scale

Users should see and enter simple 0–100 scores.

```text
95–100 = excellent
85–94  = strong
75–84  = good / usable
65–74  = weak / review recommended
50–64  = poor
0–49   = unreliable
```

Users should not need to understand log-odds, logits, multipliers, or internal propagation math.

### 4.1 User Score Conversion

User-facing scores use integers or decimals from 0 to 100.

Internal normalized scores use `q` in the open interval `(0, 1)`.

```text
q = visible_score / 100
```

Operational scores must be clamped before math:

```text
q = clamp(q, epsilon, 1 - epsilon)
```

Default:

```text
epsilon = 0.0001
```

So:

```text
0   becomes 0.0001 for math
100 becomes 0.9999 for math
```

Use exact 0 or exact 1 only as labels or policy states, not normal math values.

---

## 5. Quality Vector

Every artifact should support the following quality dimensions.

### 5.1 `source_quality`

How trustworthy the artifact’s source is for the current purpose.

This is about the origin or upstream authority of the information.

High `source_quality` does not mean every downstream representation is perfect.

### 5.2 `capture_quality`

How accurately the source was captured into this artifact’s current usable form.

This is especially relevant when converting from one representation to another.

Examples:

```text
audio → transcript
image → OCR text
PDF → extracted text
web page → cleaned markdown
structured import → normalized rows
```

### 5.3 `faithfulness`

How closely this artifact stays attached to its parent material.

Faithfulness is not the same as factual correctness.

A derived artifact can be factually correct but low-faithfulness if it adds material, generalizes too much, omits important context, or changes the framing.

### 5.4 `alignment`

How well the artifact fits the intended scope, task, user need, project, or operational purpose.

Alignment is purpose-relative.

An artifact can be true but poorly aligned.

### 5.5 `coverage`

How completely the artifact covers the needed material relative to its intended purpose.

Coverage is not always “more is better.” It means appropriately complete.

### 5.6 `utility_value`

How useful the artifact is for the current intended use.

This is allowed to increase even when faithfulness decreases.

Example:

```text
A concise summary may be less faithful than the full source but more useful for quick review.
```

### 5.7 `composite_quality`

The simplified score used for display, ranking, gating, default retrieval behavior, and agent heuristics.

`composite_quality` is computed from the quality vector. It should not replace the component scores.

---

## 6. Internal Math

All quality movement should happen in log-odds space.

### 6.1 Definitions

```text
q = normalized quality score, where 0 < q < 1
z = logit(q)
```

```text
logit(q) = ln(q / (1 - q))
```

```text
sigmoid(z) = 1 / (1 + e^-z)
```

Round only for display. Store enough precision for repeatable propagation.

### 6.2 Why Log-Odds

Log-odds keeps quality bounded between 0 and 1 while making movement harder near the edges and easier in the middle.

This means:

```text
Moving 55 → 80 is reasonable.
Moving 85 → 98 requires much stronger evidence.
Moving 99 → 100 is practically impossible without explicit policy.
```

---

## 7. Utility Quality Profile

Every utility should have a default **Utility Quality Profile**.

Minimum fields:

```text
utility_id
utility_version
effect_type
output_quality
source_faithfulness
transformation_strength
coverage_preservation
alignment_preservation
```

Recommended optional fields:

```text
max_output_quality
min_output_quality
requires_human_validation
can_improve_input
can_degrade_input
can_be_seeded_by_default
notes
```

### 7.1 User-Facing Utility Fields

Users should usually see only simple fields.

Recommended basic mode:

```text
Utility Quality: 0–100
Keeps to Source: 0–100
```

Recommended advanced mode:

```text
Output Quality: 0–100
Keeps to Source: 0–100
Coverage Preservation: 0–100
Alignment Preservation: 0–100
Transformation Strength: 0–100
```

### 7.2 Field Meanings

#### `output_quality`

The expected quality level of this utility’s output when used correctly.

This is the utility’s target quality.

#### `source_faithfulness`

How tightly the utility stays attached to the input material.

Low source faithfulness does not necessarily mean bad. Creative, abstractive, or generative utilities may intentionally have lower source faithfulness.

#### `transformation_strength`

How strongly the utility’s own behavior dominates the output compared to the input.

```text
0   = input dominates completely
50  = input and utility both matter
100 = utility output profile dominates strongly
```

#### `coverage_preservation`

How well the utility preserves the necessary breadth of the input.

#### `alignment_preservation`

How well the utility preserves the input’s alignment to the current purpose.

---

## 8. Utility Effect Types

A utility must declare one primary `effect_type`.

Allowed values:

```text
preserve
adjust
derive
```

These are canonical. Do not invent alternate names unless this spec is updated.

---

## 9. Effect Type: `preserve`

Use `preserve` when the utility does not materially change quality.

Examples:

```text
lossless import
safe copy
stable storage
metadata assignment
non-mutating indexing
safe chunk boundary creation
```

Math:

```text
q_out = q_in
z_out = z_in
```

A `preserve` utility may still create a quality event for lineage, but it should not move the relevant quality dimensions.

---

## 10. Effect Type: `adjust`

Use `adjust` when the utility adds positive or negative evidence about an existing artifact.

Examples:

```text
human validation
automated validation
cross-checking
quality warning
detected corruption
manual downgrade
manual upgrade
```

Math:

```text
z_out = z_in + impact
q_out = sigmoid(z_out)
```

`impact` is stored internally in log-odds units.

If a user enters a multiplier-like factor:

```text
impact = ln(factor)
```

But normal users should not enter factors. Prefer simple adjustment presets or 0–100 validation scores.

### 10.1 Recommended Adjustment Presets

For UI actions, convert named actions to impacts.

```text
strong downgrade     impact = -2.00
moderate downgrade   impact = -1.00
minor downgrade      impact = -0.40
no change            impact =  0.00
minor upgrade        impact =  0.40
moderate upgrade     impact =  1.00
strong upgrade       impact =  2.00
```

These values can be tuned globally, but the names and direction should remain stable.

---

## 11. Effect Type: `derive`

Use `derive` when the utility creates a new artifact from one or more inputs.

Examples:

```text
transcription
OCR
cleanup
summarization
extraction
classification
flashcard creation
quiz creation
answer generation
research synthesis
structured data generation
```

A derived output is not merely the input with a small adjustment. It is a new artifact with its own quality profile and lineage.

### 11.1 Derive Math

For each affected quality dimension:

```text
z_in = logit(q_in)
z_target = logit(utility_target_quality)
strength = transformation_strength / 100

z_out = (1 - strength) * z_in + strength * z_target
q_out = sigmoid(z_out)
```

Where:

```text
utility_target_quality = output_quality / 100
```

This means:

```text
If input quality is low, a good utility can improve the output.
If input quality is high, a lossy utility can reduce the output.
```

This is expected and desired.

### 11.2 Dimension-Specific Targets

Do not apply one target blindly to every dimension when the utility profile provides more specific values.

Recommended mapping:

```text
source_quality:
  usually inherited from lineage, not improved by derivation

capture_quality:
  affected by import, OCR, transcription, conversion, cleanup

faithfulness:
  target = source_faithfulness

alignment:
  target = alignment_preservation

coverage:
  target = coverage_preservation

utility_value:
  target = output_quality
```

### 11.3 Source Quality Rule

A derived utility generally must not increase `source_quality`.

It may increase `utility_value`, `clarity`, `coverage`, or `alignment`, but it should not make the artifact more authoritative than its source lineage supports.

Exception: a validation utility using `adjust` may increase confidence in a specific artifact, but the quality event must record the validator, validation method, and scope of validation.

---

## 12. Multiple Inputs

A utility may use multiple input artifacts.

Before applying derive math, compute an input basis for each dimension.

Default rules:

### 12.1 Conservative Dimensions

For dimensions where the weakest link matters, use minimum or weighted minimum.

Recommended conservative dimensions:

```text
source_quality
capture_quality
faithfulness
```

Default:

```text
q_basis = min(input_scores)
```

### 12.2 Additive/Expansive Dimensions

For dimensions where multiple inputs can improve the result, use weighted aggregation.

Recommended expansive dimensions:

```text
coverage
utility_value
alignment
```

Default:

```text
q_basis = weighted_average(input_scores, weights)
```

Weights should be based on actual usage when available.

Examples:

```text
amount of content used
citation count
retrieval rank
explicit user selection
utility-provided contribution weights
```

If no weights are available, use equal weights.

### 12.3 Conflict Rule

If inputs conflict materially, do not average the conflict away.

Create a quality event with a conflict flag:

```text
has_conflict = true
conflict_severity = 0–100
```

Then reduce affected dimensions using `adjust`.

---

## 13. Composite Quality

`composite_quality` is the simplified score used by the system when it needs one number.

Composite quality must be purpose-aware.

A single universal formula will be wrong for some tasks. Therefore, use named composite profiles.

### 13.1 Default Composite Profile

If no specific profile is selected:

```text
composite_quality = weighted_geometric_mean(
  source_quality,
  capture_quality,
  faithfulness,
  alignment,
  coverage,
  utility_value
)
```

Default weights:

```text
source_quality: 0.20
capture_quality: 0.15
faithfulness:    0.20
alignment:       0.20
coverage:        0.15
utility_value:   0.10
```

Use geometric mean instead of arithmetic mean because low component scores should materially drag down the composite.

Formula:

```text
composite = exp(
  sum(weight_i * ln(q_i)) / sum(weight_i)
)
```

Then display:

```text
visible_composite = round(composite * 100)
```

### 13.2 Conservative Composite Profile

Use when factual reliability, provenance strength, or safe reuse matters.

```text
composite_quality = min(
  source_quality,
  capture_quality,
  faithfulness
)
```

Optional: combine with alignment and coverage only after the conservative floor is established.

### 13.3 Utility Composite Profile

Use when the question is practical usefulness rather than factual authority.

Recommended weights:

```text
source_quality: 0.10
capture_quality: 0.10
faithfulness:    0.15
alignment:       0.25
coverage:        0.20
utility_value:   0.20
```

### 13.4 Retrieval Composite Profile

Use for ranking search results.

Retrieval should consider both semantic relevance and quality.

```text
retrieval_score = semantic_score * quality_modifier
```

Recommended quality modifier:

```text
quality_modifier = 0.5 + (0.5 * composite_quality)
```

This means quality can boost or reduce ranking, but does not completely erase semantic relevance by default.

For high-risk workflows, use stricter gating before ranking.

---

## 14. Seeding and Reuse

Composite quality alone must not decide whether a derived artifact can be reused as a source of truth.

Every artifact should support:

```text
can_be_seeded
seed_policy
```

Default:

```text
can_be_seeded = false for derived artifacts
```

Derived artifacts may become seedable through explicit policy, validation, or human approval.

This prevents quality laundering and uncontrolled propagation of generated errors.

---

## 15. Human Validation

Human validation is an `adjust` quality event.

It should record:

```text
validator_id
validator_type
validation_scope
validated_dimensions
impact or target score
notes
created_at
```

Validation can affect one or more dimensions.

Examples:

```text
faithfulness approved
coverage incomplete
alignment strong
source questionable
capture has errors
```

Do not treat all validators as equal unless the product explicitly chooses to.

Validator authority may be modeled later as part of the adjustment impact.

---

## 16. Default Utility Profiles

These are generic defaults only. They are not industry-specific.

```text
Lossless Importer
  effect_type: preserve
  output_quality: 99
  source_faithfulness: 100
  transformation_strength: 0
  coverage_preservation: 100
  alignment_preservation: 100

Clean Converter
  effect_type: derive
  output_quality: 95
  source_faithfulness: 95
  transformation_strength: 35
  coverage_preservation: 95
  alignment_preservation: 95

Noisy Converter
  effect_type: derive
  output_quality: 70
  source_faithfulness: 70
  transformation_strength: 60
  coverage_preservation: 70
  alignment_preservation: 80

Safe Chunker
  effect_type: preserve
  output_quality: 99
  source_faithfulness: 100
  transformation_strength: 0
  coverage_preservation: 100
  alignment_preservation: 100

Cleaner / Normalizer
  effect_type: derive
  output_quality: 86
  source_faithfulness: 88
  transformation_strength: 65
  coverage_preservation: 90
  alignment_preservation: 90

Extractor
  effect_type: derive
  output_quality: 88
  source_faithfulness: 85
  transformation_strength: 75
  coverage_preservation: 75
  alignment_preservation: 85

Summarizer
  effect_type: derive
  output_quality: 84
  source_faithfulness: 80
  transformation_strength: 80
  coverage_preservation: 65
  alignment_preservation: 85

Study / Review Artifact Generator
  effect_type: derive
  output_quality: 86
  source_faithfulness: 78
  transformation_strength: 85
  coverage_preservation: 76
  alignment_preservation: 80

Quiz / Assessment Generator
  effect_type: derive
  output_quality: 82
  source_faithfulness: 74
  transformation_strength: 85
  coverage_preservation: 72
  alignment_preservation: 78

Creative Generator
  effect_type: derive
  output_quality: 90
  source_faithfulness: 40
  transformation_strength: 95
  coverage_preservation: 50
  alignment_preservation: 70

Human Validation
  effect_type: adjust
  default impact: configurable
```

These defaults should be editable per org, project, utility version, and workflow.

---

## 17. Generic Examples

### 17.1 Near-Lossless Source Path

```text
source artifact:
  source_quality: 99
  capture_quality: 99

lossless importer:
  effect_type: preserve

output:
  source_quality: 99
  capture_quality: 99
```

No quality movement is needed.

### 17.2 Weak Capture Then Cleanup

```text
source artifact:
  source_quality: 99

captured artifact:
  capture_quality: 65

cleanup utility:
  effect_type: derive
  output_quality: 86
  source_faithfulness: 88
  transformation_strength: 65
```

The cleanup may improve usefulness and readability, but lineage still remembers that the capture was weak.

The derived artifact should not become equivalent to a pristine source unless validated.

### 17.3 High-Quality Input Through Lossy Derivation

```text
input:
  source_quality: 98
  capture_quality: 99
  faithfulness: 99

summarizer:
  effect_type: derive
  output_quality: 84
  source_faithfulness: 80
  transformation_strength: 80

output:
  may have strong utility_value
  should have lower faithfulness than input
```

This is correct. Summaries are useful but inherently selective.

### 17.4 Derived Artifact From Multiple Inputs

```text
inputs:
  artifact_a composite: 95
  artifact_b composite: 82
  artifact_c composite: 70

synthesis utility:
  effect_type: derive
```

For conservative dimensions, start from the weaker links.

For coverage and utility value, aggregate based on contribution weights.

If the inputs conflict, flag the conflict and apply an adjustment penalty.

### 17.5 Good But Poorly Aligned Output

```text
artifact:
  source_quality: 92
  capture_quality: 95
  faithfulness: 80
  alignment: 55
  coverage: 88
  utility_value: 70
```

This artifact may be factually good but not useful for the current purpose.

The model must preserve that distinction.

---

## 18. Database Guidance

This section is conceptual, not a final schema.

Recommended entities:

```text
quality_profiles
quality_vectors
quality_events
utility_quality_profiles
composite_quality_profiles
artifact_lineage_edges
```

### 18.1 Store Both User and Internal Values When Useful

For auditability, consider storing:

```text
visible_score
normalized_score
logit_score
```

But do not require all three everywhere if they can be deterministically recomputed.

Recommended storage rule:

```text
Store normalized scores and source values.
Compute logits when needed.
Store quality events for reproducibility.
```

### 18.2 Version Utility Profiles

Utility profiles must be versioned.

If the flashcard generator changes behavior, old quality events should still point to the profile version used at the time.

```text
utility_id
utility_version
quality_profile_version
```

### 18.3 Never Store Unexplained Composite Scores Only

A composite score without component scores or quality events is not sufficient.

Agents must be able to explain:

```text
why this score exists
which utility changed it
which source/artifact it came from
which dimensions are weak
whether it is safe to reuse
```

---

## 19. Agent Rules

AI coding agents and runtime agents must follow these rules.

1. Do not create domain-specific quality dimensions.
2. Do not collapse quality into one number internally.
3. Use the canonical quality vector names.
4. Use only canonical utility effect types: `preserve`, `adjust`, `derive`.
5. Use log-odds math for quality movement.
6. Use 0–100 scores for user-facing inputs and displays.
7. Clamp scores before logit math.
8. Preserve lineage for every derived artifact.
9. Do not allow derived artifacts to launder weak provenance into high authority.
10. Do not let `composite_quality` alone decide whether something can seed new knowledge.
11. Version utility quality profiles.
12. Record quality events for meaningful transformations.
13. Prefer defaults over requiring users to think about quality every time.
14. Allow human validation to adjust specific dimensions.
15. Keep source quality, capture quality, faithfulness, alignment, coverage, utility value, and composite quality conceptually separate.

---

## 20. Implementation Pseudocode

```python
import math

EPSILON = 0.0001


def clamp_q(q: float, epsilon: float = EPSILON) -> float:
    return max(epsilon, min(1.0 - epsilon, q))


def from_visible_score(score: float) -> float:
    return clamp_q(score / 100.0)


def to_visible_score(q: float) -> int:
    return round(clamp_q(q) * 100)


def logit(q: float) -> float:
    q = clamp_q(q)
    return math.log(q / (1.0 - q))


def sigmoid(z: float) -> float:
    return clamp_q(1.0 / (1.0 + math.exp(-z)))


def preserve(q_in: float) -> float:
    return clamp_q(q_in)


def adjust(q_in: float, impact: float) -> float:
    return sigmoid(logit(q_in) + impact)


def derive(q_in: float, target_quality: float, strength: float) -> float:
    """
    q_in: 0–1 input score
    target_quality: 0–1 utility target score
    strength: 0–1 transformation strength
    """
    strength = max(0.0, min(1.0, strength))
    z_in = logit(q_in)
    z_target = logit(target_quality)
    z_out = ((1.0 - strength) * z_in) + (strength * z_target)
    return sigmoid(z_out)


def weighted_geometric_mean(scores: dict[str, float], weights: dict[str, float]) -> float:
    numerator = 0.0
    denominator = 0.0
    for key, weight in weights.items():
        if key not in scores:
            continue
        q = clamp_q(scores[key])
        numerator += weight * math.log(q)
        denominator += weight
    if denominator == 0:
        return EPSILON
    return clamp_q(math.exp(numerator / denominator))
```

---

## 21. Final Design Decision

The Matrx Quality Model uses:

```text
0–100 user-facing scores
0–1 normalized internal scores
log-odds propagation math
multi-dimensional quality vectors
canonical utility effect types
quality events
lineage preservation
purpose-aware composite profiles
explicit seeding controls
```

## 22. Lineage & History

> Closes the source-of-truth decision end to end. Companion diagram: `docs/knowledge/visuals/lineage_graph_provenance_vs_canonical.svg`. Resolves the previously-dangling `04 §22` reference.

### 22.1 Two-role source of truth

The question "is the source of truth the original or the cleaned artifact?" is a false binary. There are two roles; they never compete because they answer different questions.

- **Provenance root** — the immutable original (the uploaded PDF, the audio file, the raw scrape). Never rewritten. Anchors `source_quality`. This is *truth-of-record*: what verification trusts.
- **Canonical working copy** — the artifact the system *prefers to read, serve, and seed* for a given purpose. This **may** be a promoted derived artifact (clean text, validated JSON). It is a flag/pointer, **not** a rewrite of history. Promotion routes through the existing seeding/promotion gate (§14).

Rule: **retrieval prefers the canonical working copy; verification walks to the provenance root.** Both are always retained; the root is always one graph-walk away.

**Fan-in:** an artifact synthesized from multiple inputs has a *set* of provenance roots, not one. All traversal and "truth-of-record" logic must treat the root as a set.

### 22.2 The edge table

Lineage is a DAG, not a parent pointer. The current single `(source_kind, source_id)` field is replaced by a directed-edge table.

```text
artifact_lineage_edges(
  parent_artifact_id   -- the INPUT (upstream, toward root)
  child_artifact_id    -- the DERIVED OUTPUT (downstream)
  utility_id
  utility_version
  quality_event_id     -- the §3.4 event for the run that produced child
  edge_type
)
```

- **Index both `parent_artifact_id` and `child_artifact_id`** — both directions come from this one table.
- **`edge_type` enum (canonical):** `convert · ocr · transcribe · clean · chunk · extract · classify · summarize · synthesize · validate · adjust`. Extend only by updating this enum.
- A fan-in run (multiple inputs → one output) produces **one edge per input**, all sharing the same `quality_event_id`.
- **Every RAG chunk is an artifact node** with its own quality vector. Chunking is a `preserve` utility (§9), so a chunk inherits its parent's vector via its `chunk` edge.
- **Append-only.** Edges and quality events are never mutated; reprocessing mints **new** nodes and edges (consistent with §18.2 versioning).
- **Acyclic — enforced.** The Phase 7 reprocess loop ("put the result back") must create a new artifact node with edges *from* its inputs. It must **never** add an edge back to an existing ancestor. A cycle is a STOP-level bug.

### 22.3 Node flags

On each artifact (alongside the §14 `can_be_seeded` / `seed_policy`):

- **`is_provenance_root`** — boolean, `true` only for originals (no inbound lineage edges).
- **`canonical_for`** — canonicality is a property of **(lineage cluster, purpose)**, not of a node alone. Contract:

  ```text
  canonical_resolver(provenance_root_id, purpose) -> artifact_id   -- exactly one per (cluster, purpose)
  ```

  Implement as a small table keyed on `(provenance_root_id, purpose)` with a uniqueness constraint, so one cluster can have different canonicals for different purposes (e.g. `read` → clean text, `structured_query` → validated JSON).

  **v1 shortcut:** if only one purpose exists initially (`retrieval`), a nullable `canonical_for text[]` array of purpose tags on the node is acceptable, with an app-level one-canonical-per-purpose guarantee. Migrate to the resolver table when purposes proliferate.

### 22.4 Traversal contracts

- **Drill-down** (verification): recursive CTE walking `parent_artifact_id` edges. Returns the full ancestry; with fan-in, branches and returns the **set** of provenance roots. This is the "chunk → clean text → OCR → PDF p.278" walk.
- **Fan-out** (impact): `SELECT * FROM artifact_lineage_edges WHERE parent_artifact_id = X`. This is "the 26 derived extractions."
- **Best source** (citation/serving): within the lineage cluster (connected component sharing root[s]), restricted to nodes that **contain the target content**:
  1. if a `canonical_for(purpose)` node exists, use it;
  2. else the node with the highest `composite_quality` under the active purpose profile;
  3. tie-break toward higher `capture_quality` (closer to the root = more faithful).
  Feeds the `§5b` map's `best source` pointer.

### 22.5 Entity anchoring

An entity is **not** an artifact — it is extracted *from* one. It anchors to its source artifact and inherits trust through the graph; it does not carry a parallel lineage.

```text
EntityMention {
  text
  kind                       -- entity | concept
  extracted_from_artifact_id -- the anchor node (one)
  span                       -- [start, end] in that artifact
  extraction_confidence      -- MECHANICAL certainty only
  transformation_flags       -- per-artifact meaning signals, e.g. "inferred_date"
  human_verification         -- null | verified | disputed
}
```

- Cross-artifact appearance ("also in the clean text and the raw PDF") is **derived by walking lineage edges from the anchor — never stored.**
- Trust comes from the anchor artifact's quality vector, reached through the graph. The mention itself carries only mechanical confidence, per-artifact flags, and human verification.
- **This explicitly corrects the earlier `found_in` array**, which duplicated the lineage graph at the entity grain and invented per-layer confidences.

### 22.6 Display & scope notes

- **Banding is a UX/client concern, not an engine gate.** The engine builds and propagates faithfully regardless of calibration; whether the client shows a raw integer or a band (and an "uncalibrated" marker) is presentation. To make that decidable, carry a **`calibration_state`** field on utility quality profiles (§7) — `uncalibrated | provisional | calibrated` — so the client knows when to band. Tuning the profile numbers is the usage/client loop's job.
- **v2 deferrals:** §12 (multi-input basis), §12.3 (conflict penalties), §13 (composite-profile precedence), §8 task-row — remain deferred to v2, matching `00_MASTER_TASKLIST` E-rows. The §22 data model is designed not to preclude them. *(Agent: verify each of those headings in `04` carries the 💤 v2 marker.)*


This is the required foundation for quality scoring across all industries, artifact types, utilities, agents, and workflows.


# TASKS

## 1. Write the real quality engine code

The `.md` has pseudocode, not production code.

You need a real module with:

```text
clamp_q()
logit()
sigmoid()
preserve()
adjust()
derive()
weighted_geometric_mean()
compute_composite_quality()
apply_utility_profile()
create_quality_event()
```

Also add unit tests for edge cases:

```text
0
100
50
99.99
multi-input derivation
weak input through strong utility
strong input through lossy utility
missing scores
conflicting inputs
```

## 2. Decide the database shape

This is the biggest current gap.

The document says conceptually what should exist, but it does not fully define the schema.

You need to define exact tables/fields for at least:

```text
artifact_quality_vectors
utility_quality_profiles
quality_events
artifact_lineage_edges
composite_quality_profiles
quality_policy_defaults
```

My default recommendation:

```text
Use relational columns for canonical fields.
Use JSONB only for extra/custom metadata.
Do not store the main quality vector only as JSON.
```

For example, every artifact quality vector should have real fields like:

```text
entity_type
entity_id
source_quality
capture_quality
faithfulness
alignment
coverage
utility_value
composite_quality
composite_profile_id
can_be_seeded
seed_policy
created_at
updated_at
```

## 3. Define exactly what gets attached to what

This needs to be explicit.

Recommended rule:

```text
Every scopeable/storable artifact can have a quality vector.
Every utility version can have a utility quality profile.
Every meaningful transformation creates a quality event.
Every derived output gets lineage edges back to its inputs.
```

So:

```text
Data/artifact → quality_vector
Utility/version → utility_quality_profile
Utility run → quality_event
Input/output relationship → lineage_edge
Composite formula → composite_quality_profile
```

## 4. Create default profiles for every existing utility

Do not allow missing quality profiles.

For rollout, assign everything a default.

You need a migration/backfill task:

```text
For every utility:
  if no utility_quality_profile exists:
    assign a generic default based on utility category
```

Minimum categories:

```text
preserve/import
converter
ocr/transcription
cleaner/normalizer
chunker
extractor
classifier
summarizer
generator
synthesizer
validator
human_review
unknown
```

For `unknown`, use a safe default, not a blank:

```text
effect_type: derive
output_quality: 75
source_faithfulness: 75
transformation_strength: 50
coverage_preservation: 75
alignment_preservation: 75
requires_human_validation: false
can_be_seeded_by_default: false
```

## 5. Decide how user-facing “one number” expands internally

This is still not fully settled.

You said users may enter one easy score like `80`.

You need a rule like:

```text
Utility Quality = 80
```

expands to:

```text
output_quality: 80
source_faithfulness: maybe 80 or category-adjusted
coverage_preservation: maybe 80
alignment_preservation: maybe 80
transformation_strength: category default
```

For example:

```text
summarizer, user enters 84:
  output_quality: 84
  source_faithfulness: 80
  coverage_preservation: 65
  alignment_preservation: 85
  transformation_strength: 80
```

That mapping needs to be codified so agents do not improvise.

## 6. Define artifact default quality

Utilities need defaults, but so do artifacts.

When new data enters the system, what happens if nobody scores it?

You need default source/capture rules like:

```text
user-uploaded native text: source_quality 85, capture_quality 95
user-entered note: source_quality 80, capture_quality 99
imported structured data: source_quality 85, capture_quality 95
web scrape: source_quality 60, capture_quality 80
audio transcription: source_quality inherited, capture_quality based on transcriber profile
AI-generated artifact: source_quality inherited/constrained, faithfulness based on utility
unknown source: source_quality 50, capture_quality 75
```

The exact numbers can change, but the system needs a default for every intake path.

## 7. Define missing-score behavior

No nulls for active scoring.

Rule should be:

```text
If a score is missing, fill from policy defaults.
If no policy default exists, use global fallback.
If global fallback is missing, block the operation in dev/test.
```

For production, never let scoring silently fail.

## 8. Finalize composite profiles

The doc defines default/conservative/utility/retrieval profiles, but you need to decide where profile selection happens.

Possible levels:

```text
global default
org default
project default
workflow default
utility override
artifact type override
runtime override
```

You should define precedence.

Recommended:

```text
runtime override
workflow
project
org
artifact type
global default
```

## 9. Define multi-input contribution weights

The document says use weights when available, but the system needs a default mechanism.

You need to decide what creates weights:

```text
retrieval score
token count used
citation count
explicit user selection
utility-reported contribution
equal weight fallback
```

Recommended default:

```text
If utility reports contribution weights, use them.
Else if retrieval scores exist, normalize and use them.
Else if content length used is known, use that.
Else use equal weights.
```

## 10. Define conflict detection and penalties

The spec says conflict should not be averaged away, but it does not define how conflicts are detected.

You need:

```text
has_conflict
conflict_severity
affected_dimensions
penalty impact
```

Start simple:

```text
minor conflict: -0.40 impact
moderate conflict: -1.00 impact
major conflict: -2.00 impact
```

Apply to:

```text
faithfulness
alignment
coverage
composite_quality
```

depending on context.

## 11. Define seeding policy clearly

The current rule is good:

```text
derived artifacts default to can_be_seeded = false
```

But you need exact policies:

```text
never_seed
human_approved_only
validated_only
trusted_workflow_only
always_seed
```

And exact fields:

```text
can_be_seeded
seed_policy
seed_approved_by
seed_approved_at
seed_reason
```

## 12. Add audit/versioning rules

Utility profiles must be versioned.

Need explicit rules:

```text
Never mutate an old utility profile used by old events.
Create a new profile version instead.
Quality events point to the exact profile version used.
Reprocessing can use either original profile or latest profile depending on mode.
```

## 13. Decide reprocessing behavior

When a utility profile changes, should old artifacts update?

You need modes:

```text
do_not_reprocess
recalculate_score_only
reprocess_artifact
mark_stale_pending_reprocess
```

This is important because changing a flashcard generator’s quality from `86` to `72` should probably update downstream confidence, but not necessarily regenerate all flashcards immediately.

## 14. Define UI labels

The internal names are good, but the UI needs stable labels.

Recommended:

```text
source_quality → Source Quality
capture_quality → Capture Quality
faithfulness → Keeps to Source
alignment → Matches Purpose
coverage → Coverage
utility_value → Usefulness
composite_quality → Quality
```

For utilities:

```text
output_quality → Utility Quality
source_faithfulness → Keeps to Source
transformation_strength → Rewrite Strength / Transformation Strength
coverage_preservation → Preserves Coverage
alignment_preservation → Preserves Purpose
```

## 15. Add calibration workflow

Eventually, humans will notice:

```text
This flashcard utility is too generous.
This OCR tool is better than we thought.
This summarizer loses too much coverage.
```

You need a simple admin workflow:

```text
view utility profile
see recent output quality
adjust one or more scores
create new profile version
optionally recalculate affected artifacts
```

## 16. Add test fixtures with generic examples

Create 5–10 reusable test scenarios.

Use neutral names, not industry-specific entities:

```text
high-quality source → preserve → derive
low-quality capture → cleanup → derive
multiple sources → synthesis
generated artifact → reused as source
conflicting inputs → conflict penalty
human validation → quality adjustment
```

## 17. Add hard agent rules to the repo

Coding agents need a short “do not violate” block.

Something like:

```text
Do not create a quality score without component dimensions.
Do not create a derived artifact without lineage.
Do not create a utility without a quality profile.
Do not allow null quality values.
Do not let generated artifacts seed new knowledge by default.
Do not mutate historical utility profile versions.
Do not create industry-specific quality dimensions.
```

## My recommended next order

Do these first:

```text
1. Finalize DB schema.
2. Write the production quality engine.
3. Add global defaults for every artifact/source/utility type.
4. Backfill all existing utilities with default profiles.
5. Add quality event + lineage creation to utility runs.
6. Add composite profile selection rules.
7. Add tests.
```

The biggest missing thing right now is not the math. The math is good.

The biggest gap is the **data contract**:

```text
What fields exist?
Where are they stored?
What gets created automatically?
What defaults apply when nobody has configured anything?
```

Once that is nailed down, this becomes implementable.

HELP SOURCE: https://chatgpt.com/c/6a237e6d-b30c-83e8-ac11-3c2edadb98b9