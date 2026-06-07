# Scope Association Pipeline — auto-assigning content to scopes & filling scope items

> **What this is.** When fresh content enters the system, a **Helpful Agent** (a real AGX agent definition) tries to MATCH it against the user's **known** scopes and scope items, and proposes links the user can confirm. It is *matching against known things*, nothing more.
>
> **Companion docs:** scope model → [`scope-model.md`](scope-model.md) · scopeable entities → [`scopeable_entities.md`](scopeable_entities.md) · pipeline context (Phase 6, Stage 4) → [`01_KNOWLEDGE_OVERVIEW.md`](01_KNOWLEDGE_OVERVIEW.md).

---

## 🚧 The wall — "match confidence" is NOT the Quality Model

The only score in this pipeline is **match confidence (0–1): the agent's self-reported certainty that new content corresponds to a *known* scope, or that an extracted value corresponds to a *known* scope item.** It is a guess about a **match**.

It has **nothing to do** with — and must **never** be stored in, averaged with, or read as — the [Matrx Quality Model](04_matrx_quality_model.md)'s quality score `q`, authority tier, provenance, trust, or extraction confidence. Different axis, different system, different table. If you find code mixing them, that is a bug.

---

## When it runs (triggers)

| Trigger | Runs? | Notes |
|---|---|---|
| **New source content ingested** (fresh PDF, note, uploaded text, conversation, scrape) | ✅ **default** | This is the primary case. The content is *new information arriving*. |
| Content a utility merely **transformed** (summary, reformat, derived artifact) | ❌ no | Re-matching transformed copies is noise. Match the original source, not its derivatives. |
| **User-triggered gap-fill** over already-converted / RAG content | ✅ secondary | Only when a human knows a scope is missing items and asks an agent to consume data (possibly via RAG tool calls) to fill the blanks. Explicit, never automatic. |

---

## The two stages

Run in order. **Stage B never runs unless Stage A has a scope** (assigned by the user, or matched above the proceed-threshold). *No scope → do not attempt to fill items. Full stop.*

```
new source ──► STAGE A: which known scope is this about?  ──► STAGE B: fill that scope-type's items from the content
              (entity → scope assignment)                    (scope item → value)
```

These map exactly to the two attach points in [`scope-model.md`](scope-model.md#two-ways-something-relates-to-a-scope): **A = the M2M assignment** (`ctx_scope_assignments`); **B = the item/value cell** (`ctx_context_item_values`).

> **They may be one agent in a JSON round-trip (preferred, more powerful):** Stage A returns a scope guess; the system replies with that scope-type's item keys + current values; the same agent then (a) *revises or retracts* its scope guess ("on second look this isn't a Kid at all"), (b) *raises/lowers* its match confidence with new evidence (e.g. the doc's date-of-birth matches Ava's → 0.85 → 0.99), and (c) returns item suggestions. Or implement as two separate agents. Document whichever you build; the conversational form is the target.

---

## Stage A — assign the source to a known scope

| Rule | Behavior |
|---|---|
| **A1 · User already assigned a scope** | **Final. Do not touch.** The user's assignment is ground truth. *(Future, optional: gently hint "you may also want scope X" — not built now.)* |
| **A2 · No scope assigned** | Run the agent. **Feed it the full known taxonomy** as JSON: every org the user belongs to, every `ctx_scope_type`, every `ctx_scope` instance. The agent matches the content against that list only. |
| **A3 · Abstain is a GOOD answer** | If the content doesn't clearly map to a known scope (e.g. a Python guide when the user has no programming scope), the agent returns **no match**. Encourage this. A false positive does more harm than a silent miss. |
| **A4 · Multiple candidates allowed** | The agent may return several candidate scopes, **each with its own match confidence**. |
| **A5 · Output is always a suggestion** | Stage A never assigns as fact. It writes **suggestions**; the user confirms. |
| **A6 · Speculative proceed** | If a candidate's match confidence ≥ the **proceed-threshold** (example `0.80`), the system may run **Stage B speculatively** for that scope *before* the user confirms — to show value fast. The assignment still requires user confirmation to become fact. |

**Goal in plain terms:** the user uploads a PDF and we say *"we think this belongs to Ava"* instead of making them click Ava — but only when we're genuinely sure.

---

## Stage B — fill the scope-type's items from the content

Precondition: a scope is known (A1) or matched ≥ proceed-threshold (A6). Items are defined on the **scope type**, so "Ava is a Kid → Kids tracks these 20 items."

**Agent input:** the 20 item keys **+ their current values** (long values **truncated** — provide a tool to fetch the full value on demand, since a value can be multiple pages) **+ the source content.**

| Situation | Agent behavior | Output |
|---|---|---|
| **Item is blank** | More leeway to propose a value when the content clearly supplies it (e.g. `age` blank, transcript shows DOB → propose age). | suggestion |
| **Item is already filled** | **Do not overwrite.** May suggest a *change* **only with strong evidence** (e.g. `age=14`, but the doc shows a birthday two months ago → suggest `15`). Memory-reconciliation style: compare new info to what exists; never blindly assume the new value wins. | suggestion (higher evidence bar) |
| **Small edit / addition** | Tiny tweaks are valid suggestions too (e.g. a useful sentence to add to a brand's `description`). | suggestion |

**Stage B output is always a suggestion.** The agent never writes a value directly. (A future, carefully-gated high-match-confidence "more direct" path is an open hook — see below — but suggestion is the default and the contract.)

---

## Match-confidence bands (examples — configurable, not a contract)

| Band | Stage A | Stage B |
|---|---|---|
| below low | abstain — emit **no** suggestion | n/a (no scope) |
| ≥ proceed (≈ `0.80`) | suggestion **+** authorize speculative Stage B | propose blank-item values as suggestions |
| ≥ high (≈ `0.95`) | still user-confirmed as fact; may enable a more-direct path later | strong enough to suggest *changes* to filled items |

Numbers are illustrative. The agent's instructions must tell it how to calibrate and that **abstaining is rewarded, false matches are penalized.**

---

## Where writes land

| Stage | Suggestion (always) | Confirmed by user → fact |
|---|---|---|
| A — assignment | `scope_association_suggestions` *(exists)* | `ctx_scope_assignments` (entity ↔ scope) via the confirm path |
| B — item value | a scope-item-value **suggestion ledger** *(NEEDS BUILD — mirror of `scope_association_suggestions` for item values)* | `ctx_context_item_values` via `set_context_value()`; `source_type='ai_generated'` until a human confirms, then `'user_input'` |

`ctx_context_item_values` is **versioned** (`is_current=true` on the live row), so a confirmed change supersedes without destroying history.

---

## Implementation = a real AGX agent (so it's testable)

This is **not** buried Python heuristics — it is one (or two) AGX agent definitions with explicit instructions, so the user can run a document through and see whether the agent did the right thing.

Build pieces:
1. **AGX agent(s)** — Stage A "Scope Matcher" and Stage B "Item Extractor" (or one unified conversational agent).
2. **Known-taxonomy JSON feeder** — assembles all orgs / scope types / scopes (Stage A) and item keys + current values (Stage B).
3. **`fetch_full_value` tool** — returns the untruncated current value of a scope item on demand.
4. **Item-value suggestion ledger** — the Stage B suggestion store + its confirm path.
5. **Trigger** — fire on new-source ingest (default); expose a user-triggered gap-fill entry point.

---

## Hard rules (do / never)

- ✅ User assignment wins; auto-matching only fills the gap when the user gave nothing.
- ✅ Abstaining is the correct answer when unsure — silence beats a wrong scope.
- ✅ Everything the agent produces is a **suggestion**; the human confirms before anything becomes fact.
- ✅ Stage B requires a scope; never extract item values without one.
- ✅ Match against **known** scopes/items only — this agent does not invent new scope types.
- ❌ Never overwrite a filled scope value without strong evidence (and even then, only as a suggestion).
- ❌ Never store or compare **match confidence** with the Quality Model's `q` / authority / trust / extraction confidence. Separate axis, separate table.
- ❌ Never run this on utility-transformed copies — match the original source.

---

## Open hook (TBD — do not build as settled)

A high-match-confidence "more direct" write path (agent action without a confirm click, for the safest cases) is a **possible future** with the right agent guidance. Left undefined on purpose; the default and the contract today is **suggestion → human confirm.**
