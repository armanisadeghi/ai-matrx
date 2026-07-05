# The Shape System — Core

> The team, assembled by position first, players later. This captures *what roles exist and how they relate* — not which implementation "wins." Where a canonical decision is settled, it's marked **[settled]**; where it's yours to guide, it's marked **[open]**.

---

## 1. The atom — the Shape

Everything in the system reduces to one thing: **the Shape** — a named, versioned structure.

A workflow node, a tool, an agent, a custom app — none are special. Each one *produces or consumes a Shape*. So the whole system is **schema in → schema out**, and the Shape is the unit that flows through all of it.

**Canonical home [settled]:** `content_ir.kind_definitions` + `kind_edge`, read through the `content_ir.kind_definition_versions` view. This is the schema of record. Python, React, React Native, Vite, and JS all validate and render against it.

---

## 2. The core commitment — convergence at detection (not at the component)

This is the keystone. A Shape can *arrive* in many forms, but it only *lives* in one.

**Input surfaces (many):**
- `__kind` JSON (official / canonical form)
- XML (the older, easier-for-an-LLM-to-emit form we keep on purpose)
- Tool results
- Known markdown patterns
- Other/unofficial: non-official `__kind` JSONs, structured markdown converted to structured output, and anything else we can *pluck out of content* and recognize

**The boundary:** the instant a **detector** recognizes content as Shape X — regardless of how it arrived — it **emits the canonical `__kind` JSON for Shape X.**

> "The XML becomes the kind." XML is an **input surface, not an internal format.** The moment it's recognized, it *becomes the kind.*

**The concrete promise:** past the detection boundary there is exactly **one** internal representation — the kind's JSON — and every downstream machine only ever sees that. No component, sample, Pydantic type, artifact, or state ever knows or cares that XML (or markdown, or a tool result) existed.

This is stronger than "converge at the component." It makes everything after detection **format-agnostic by construction, not by discipline.** "One flashcard component regardless of source" isn't a rule we enforce — it's a consequence of normalizing at the door.

---

## 3. What each Shape carries — its kit

Per-Shape assets. Each attaches to a specific Shape *and its version*.

| # | Asset | What it is |
|---|-------|-----------|
| 1 | **Schema** | The definition itself. **[settled — `content_ir`, shipped]** |
| 2 | **Skill** | The deep teaching doc for an agent — full detail, no guesswork. |
| 3 | **Content block** | The quick reference a user drops into a system prompt (tiny example + a few bullets), inserted from the right-click context menu. |
| 4 | **Output component** | Renders the Shape for a human. |
| 5 | **Input component** | Collects the Shape from a human (textarea → switch → radio → dropdown → multiselect → db-backed option lists). |
| 6 | **Sample data** | Real instances, bound to the exact schema *version* they came from. |
| 7 | **Pydantic type** | Validates the Shape server-side. |

### Split-by-format vs. shared-across-formats

Because everything converges at detection, the fault line is clean:

- **Split** (JSON and XML each get their own) — these all live *before* the boundary: **skill**, **content block**, **detection**.
- **Shared** (one, regardless of source) — these all live *after* the boundary: **schema**, **output component**, **input component**, **samples**, **Pydantic type**, **artifact/state**.

**Skills, refined [open→resolved as a policy]:** skills go *both ways* depending on the target model.
- **Merged skill** — for a highly intelligent agent that can be trusted to choose the right variant.
- **Split skills (one per format)** — for smaller models: tell them exactly how to do it and remove the guesswork.

---

## 4. The machines — operate over *any* Shape

System-wide capabilities, not per-Shape.

8. **Detection** — "this stream / tool result / markdown / XML contains Shape X" → normalize to canonical `__kind` JSON. Streaming render and the JSON-extraction-to-DB path are sub-facets here. *(This is the boundary from §2.)*

9. **Registry / resolver** — given a Shape + platform, which component renders (or inputs) it?
   - Hard-coded today for the primary UI. **If a component is already hard-coded, it's done — we don't spend thought on it now.** **[settled]**
   - **All user-defined components are dynamic and live in the database.** **[settled]**
   - Direction of travel: increasingly db-driven as we expand to other platforms.
   - One registry serves all formats, because detection already unified them.

10. **Artifact + state** — when a recognized Shape has side effects or state, mint **one** stateful artifact with an ID, persist it, and let the LLM see the live state. One copy, state built in: a quiz remembers its answers on refresh or a week later; we keep *current state*, not the original LLM markdown/JSON. Bonus — the LLM reads that live state via context.

---

## 5. The consumers — everyone speaks Shape

Canonicalize the roster once, and each of these gets rendering, input, validation, and artifact-state **for free**:

- **Agent outputs** — a Shape.
- **Workflow node inputs *and* outputs** — every node defines its I/O as Shapes.
- **Tool results** — a Shape. **Status:** tools already have fairly well-established schemas that convert into ours without much hassle — a low-friction merge, not a rebuild. **[open, but easy]**
- **Custom app in / out** — a schema for input, a schema for output (even a rare text-in/text-out agent). An app may wrap a single agent or a whole multi-agent workflow; externally it's still Shape-in / Shape-out.

Once they all share the registry, a tool result can flow straight into a node, an agent, or a renderer with **no glue.**

---

## 6. The flow (lifecycle) — how the positions play together

```
DEFINE          Schema (canonical __kind JSON)  ·  home: content_ir
                        │
                        │   ── input surfaces (many) ──
                        │      __kind JSON · XML · tool result · markdown · other
                        ▼
GUIDE           Skill (deep)  +  Content Block (quick, context-menu insertable)
                        │        [split per format for small models · merged for smart agents]
                        ▼
EMIT            an agent / node / tool / app produces an instance (in ANY surface form)
                        │
════════════════ DETECTION BOUNDARY ════════════════
RECOGNIZE       a detector identifies Shape X  →  emits canonical __kind JSON
                        │   (XML/markdown/tool-result identity is discarded here — forever)
                        ▼
              ┌──── everything below sees ONLY the canonical JSON ────┐
              │                                                        │
INSTANTIATE   has state/side-effects? → Artifact (ID + embedded state)│
                        │                                             │
RENDER        Registry → Output Component (one per Shape, all sources)│
                        │                                             │
PERSIST       state stored on the artifact; LLM sees live state       │
                        │                                             │
VALIDATE      Pydantic mirror validates server-side, end to end       │
              └────────────────────────────────────────────────────┘

EVIDENCE        Sample Content (version-bound) feeds agents + preview rendering
INPUT           Input Components produce Shape-conforming data going the other way
```

The single most important structural fact: **the split assets (skill, content block, detection) all sit ABOVE the boundary; the shared assets (component, samples, Pydantic, artifact, state) all sit BELOW it.**

---

## 7. Fixed vs. open — kept separate on purpose

**Settled**
- Schema home = `content_ir.kind_definitions` + `kind_edge` via `kind_definition_versions`.
- Convergence happens at **detection**; there is exactly one internal representation (the kind's JSON) past that point.
- XML and all other surfaces are **input surfaces**, not internal formats.
- Already-hard-coded components: leave them; all user components are dynamic + in the DB.
- Sample content is bound to a schema **version**.
- Stateful Shapes become single artifacts with embedded, LLM-visible state.

**Open — for you to guide**
- Which surface is the *authoring default* per Shape (when both JSON and XML skills exist).
- The exact detector contract / registry keying across platforms.
- Sequencing of the tools canonicalization (known to be easy — just needs a slot).
- When/whether specific hard-coded components migrate to db-driven.

---

## The roster, in one line

**1 atom (the Shape) · 7 things it carries · 3 machines that operate over it · 4 consumers that speak it — with format as an attribute of the atom that disappears at detection.**
