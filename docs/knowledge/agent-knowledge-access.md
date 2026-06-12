# Agent Knowledge Access & Retrieval

> **Status: living doc.** The access model + retrieval contract below are **DECIDED**; items in §10 are **OPEN**. This is the spec for how an agent reaches RAG/NER knowledge — the counterpart to [`scope-association-pipeline.md`](scope-association-pipeline.md) (how content gets *into* scopes) and [`04_matrx_quality_model.md`](04_matrx_quality_model.md) (how trustworthy what it finds is).

---

## 1. The model in one sentence

**Bounded agentic search.** An agent is given a *bounded universe* + powerful *search/navigate tools*, and becomes "aware" by **searching** — never by having the corpus auto-injected. The 2026-04-29 auto-injection P0 proved injection-by-default wrong; frontier models don't need it — they call the tools themselves.

**One exception — pre-orchestrated hint injection** (§7): rare, opt-in, per-agent/surface, scoped (e.g. memory). Powerful when needed, never the default.

---

## 2. Access hierarchy — mirrors the tool system exactly

Knowledge access reuses the **exact** precedence the tool system already implements in [`aidream/api/utils/tool_merge.py::apply_unified_tools`](../../aidream/api/utils/tool_merge.py) (`TOOL_ROUTING_RULES.md §7`). Don't invent a new hierarchy — clone this one.

| Layer | Tools (today) | Knowledge access (this spec) |
|---|---|---|
| Capability/surface defaults | surface `tool_surface_defaults` | surface default knowledge grants |
| Surface amendments | `client.amendments` add/remove | surface add/remove of grants |
| **Agent definition** | `config.tools` + `tool_config.excluded_tools` (forbidden floor) | agent's `knowledge_config.grants` + `knowledge_config.forbidden` |
| Request | `tools` / `tools_replace` | per-request grant add / replace |
| **User overrides** | `user.add` / `user.remove` | user add / remove of grants |
| Kill switch | `auto_tools_disabled` | `knowledge_disabled` |

**Resolution rule (identical to tools):**
```
effective_grants  = union(agent.grants, surface.add, request.add, user.add) − amendments/forbidden
effective_excluded = (agent.forbidden ∪ user.remove) − user.add        # user.add beats agent.forbidden
searchable_universe = (effective_grants − effective_excluded) ∩ user_owned_resources   # ownership is the hard cap
```
**The user wins** (can grant the agent anything they own; the agent may then fail if misused — that's the user's call). **`user.remove` is absolute.** **Ownership is the outer ceiling** — a grant can never widen past what the user owns, and a public/widget **surface can only narrow** (it sets a tight default and may forbid, never widen).

---

## 3. Three tiers of narrowing

```
MAX ACCESS (ceiling)   ⊇   ACTIVE FOCUS (default)   ⊇/⊆   AGENT SELF-FILTER
   user/surface grant         set by surface/context        agent narrows or widens
   — hard, can't exceed       (e.g. "this repo",            within [focus → ceiling]
                               "this case")
```

- **Max access** — §2 resolution. Hard outer boundary; the agent is *incapable* of exceeding it.
- **Active focus** — the session default, narrower than max (the coding agent *may* see other repos but **defaults to this one**; the case agent defaults to the active case). Set by the surface/context.
- **Self-filter** — the agent voluntarily narrows (cost/precision) or widens up to the ceiling. Often unnecessary for precision (irrelevant scopes won't surface anyway) but matters for **recall noise + cost**.

---

## 4. Grant shape

One uniform grant object, multiple rows per agent (mirrors how an agent can carry many tools), composed with **set algebra**:

```
grant = { kind, target_id, mode }
kind ∈ { scope, scope_type, org, everything }
mode ∈ { include, exclude }      # exclude = surgical removal INSIDE a broad grant (conflict walls)
```

- **`scope`** — a specific scope instance ("Ava", "Case 123").
- **`scope_type`** — every scope of a type.
- **`org`** — everything in an organization (+ optionally that org's "Unassigned").
- **`everything`** — the personal "Chat Agent": all the user owns.
- **"Unassigned" is first-class** — a grantable target (the big catch-all where untagged content lives). Granting a scope-type does **not** auto-include its Unassigned; it must be explicit.

### Set algebra (the real primitive — replaces "data stores", §4a)
Grants compose, not just append:
- **Union** (`include` rows) — "Ava ∪ Kids ∪ Unassigned".
- **Exclude** (`mode=exclude`) — **conflict walls**: "Org X − Case Y" (an attorney ethically walled off from one matter inside a firm they otherwise fully access). This is a surgical removal *inside* a grant, distinct from the agent's forbidden floor.
- **Intersection** (`∩`, e.g. via a filter expression) — "Practice Area: CA WC ∩ kind:reference" — the "slice a scope" need.

```
searchable_universe = ((⋃ include_grants) − (⋃ exclude_grants) − effective_excluded) ∩ user_owned_resources
```

### 4a. "Data stores" — DEPRECATED as a primitive
`rag.data_stores` + `rag.data_store_members` (migration `0009`) is a **hand-curated, frozen M2M list of specific content rows** — functionally just a saved `include_sources` list. It predates the scope system and the `ctx_scope_id` linkage was explicitly deferred ("plan Part 9.3"). It is **superseded**:
- **Reference libraries (AMA Guides, statutes, firm memos)** → a **scope** (e.g. `Practice Area: CA WC`). Dynamic, self-maintaining. Not a bucket.
- **Combine / slice scopes** → the **set algebra** above.
- **Ad-hoc "just these N rows"** → `include_sources` (transient search param).
- **Residual (optional, later):** a **"saved selection"** — a named, shareable filter *expressed in scope set-algebra*, NOT a manual row list. Only build if the convenience is demanded.

Migration path: stop creating manual data stores; migrate existing ones to scope assignments (or a saved selection); retire `data_store_members` once empty.

---

## 5. The retrieval contract — every search returns TWO things

### 5a. Ranked chunk hits — minimal by design (progressive disclosure)
The initial hit gives *just enough* — like reading a file's first 100 lines + its metadata — for the agent to (1) know if it's the right thing, (2) know exactly what to fetch next, (3) **eliminate sibling wrong-hits** so it stops chasing dead ends. Each hit carries:

- snippet + score
- **artifact type** (cleaned_content / extraction / note / code / pdf_derived / …)
- **scope/org tags**
- **quality vector + composite** (from [`04`](04_matrx_quality_model.md)) — so the agent judges trust, not just relevance
- **lineage handle** + IDs — to drill without re-searching

### 5b. Condensed entity/topic map — the "holy grail" sidecar (the NER payoff)
A compact map (~1 line per top entity/topic) so the agent sees **where to go** without reading content:

```
Dr. Smith (person) · 12 artifacts: 8 medical_record, 3 deposition, 1 report
  ↳ linked: Patient X, Clinic Y, AMA Guide §3   ↳ derived: extraction "26 visits"   ↳ best source: pdf#A p.235 (q=91)
AMA Guides §3 (topic) · 4 source docs
```

**This is a major context-saver:** instead of pulling 12 chunks to discover structure, the agent reads 10 lines and makes one targeted fetch. NER is therefore **both** a behind-the-scenes ranking *booster* **and** an agent-facing *map*.

> **Coding parallel (same shape):** searching "tools" in a codebase should return a **symbol/centrality graph** — hub (`apply_unified_tools`) → linked (`merge_request_tools`, `ToolSpec`, `ToolRegistry`) → leaves (30 implementations), ranked by centrality. Entity → {artifact types + counts}, relevance/centrality rank, linked entities, derived artifacts, pointer to the highest-quality source. The map's value is *ranked navigation*, not content.

### 5c. Drill-down actions (v1 target)
1. **Open the original region/page** (the "go read PDF p.235 myself" validate-the-smoking-gun move) — reaches the **provenance root**.
2. **Walk lineage to source-of-truth** (`cleaned_content ← ocr_text ← pdf p.235`) — a recursive walk up `parent_artifact_id`.
3. **List derived/sibling artifacts** (the already-extracted "26 visits") — a fan-out `children WHERE parent = X`.

**Two source-of-truth roles (DECIDED 2026-06-06):** a hit's **canonical working copy** is what retrieval *prefers* (the clean, promoted artifact); its **provenance root** is the immutable original one graph-walk away (what verification trusts). They never compete. Served cheaply by the lineage **DAG** (`artifact_lineage_edges`, both columns indexed) — schema + traversal contracts in [`04`](04_matrx_quality_model.md) §22.

> **Tombstones:** a user may delete a source. A drill-down that reaches a deleted anchor returns a **tombstone marker** ("content removed") — lineage stays intact, the link never dangles. Retention is auto-drop-never, not deletion-veto. See `04` §22.7.

---

## 6. Tool surface (proposed)

Small family, not one tool (and a one-line capability preamble so it "stands out" — §8):

- `knowledge_search(query, filters?)` — semantic + lexical + structural within the searchable universe; returns §5a hits **and** the §5b map.
- `knowledge_get(artifact_id)` / `knowledge_fetch_region(artifact_id, page|region)` — full content / open original.
- `knowledge_navigate(entity|topic|scope)` — entity → linked artifacts, topic-cluster → artifacts (the §5b map, expanded).

Self-filtering is mostly just search params (`filters`); a persistent "narrow my working set for this task" is optional, not required.

---

## 7. Hint injection — the preserved exception (e.g. memory)

Auto-injection is the **exception, not the rule**. It is allowed only when **pre-orchestrated**:

- The agent must **already be granted the knowledge tool** (no injecting into an agent that can't access RAG).
- Configured **per-agent or per-surface** (e.g. a chat agent with memory), reusing/generalizing the dormant `rag_awareness_mode` machinery.
- Injects **specific, scoped hints** (memory relevant to this query) — **never** "everything that matched."
- Subject to the incident rules (`00_CLEANUP §6`): feature-flagged, budgeted, circuit-broken, no unbounded hot-path DB.

Memory is the canonical case: chat agent + a bounded body of memory + inject the relevant slice on each query. Tightly limited by design.

---

## 8. Why it "stands out" without bloating context

The **access grant rendered as a one-line preamble**: *"You can search: Case 123, the AMA Guides library, Unassigned."* It's already loaded (no hot-path DB), it's safe (names of reachable areas, not content), and it tells the agent the power exists + roughly what's in reach — so the tool family isn't lost among 30 others. Static preamble (cheap) ≠ hint injection (dynamic, rare, §7).

---

## 9. DB modifications (proposed — verify against `agx_agent`)

- **`agx_agent.knowledge_config` JSONB** (new) — mirrors `tool_config`: `{ grants: [...], forbidden: [...], focus_default: {...}, hints: {...}, knowledge_disabled: bool }`. Read with the same defensive `getattr(row, "knowledge_config", None) or {}` pattern as `tool_config` in [`agx_manager.py`](../../packages/matrx-ai/matrx_ai/db/agx_manager.py).
- **Surface defaults** — a knowledge analogue of `tool_surface_defaults` on `ui_surface`.
- **Request + user overrides** — extend the unified request shape with knowledge add/remove (parallel to `tools` / `user.add` / `user.remove`).
- **Reuse** the existing `rag_awareness_mode` column + `compute_awareness_fragment` for §7 hints.
- **`rag.scope_bindings`** (backlog #41) is effectively the *resolved* searchable-universe binding — fold it into this model rather than building separately.

---

## 10. Decisions log + still-open

**DECIDED**
- **Exclude grants (conflict walls) — YES** (2026-06-06). `mode=exclude` is first-class — "Org X − Case Y". Required for ethical walls, not optional. (§4)
- **Data stores — DEPRECATED** (2026-06-06). Manual frozen buckets, predate scopes. Replaced by scopes (reference libraries) + set algebra (slice/combine) + `include_sources` (ad-hoc). Optional residual = a "saved selection" expressed in scope algebra. (§4a)
- **Source-of-truth & lineage shape — DECIDED 2026-06-06.** Provenance root (immutable original) + canonical working copy (promoted derived; what retrieval prefers); lineage is a DAG, not a pointer; chunks are artifact nodes; entities anchor to one artifact. Drives §5c. Detail: [`04`](04_matrx_quality_model.md) §22. Build = E9.

**STILL OPEN — decide next**
- **Intersection mechanics** — how is `∩` expressed in a grant set (a filter expression on a grant? a typed `intersect` group)? The operator is decided; the wire shape isn't.
- **Active-focus mechanics** — is "focus" a real persisted session field the agent can change, or just the surface's default `filters`? (§3 says it exists; the mechanism is open.)
- **Map ranking signal** — what ranks the §5b map: centrality (KG edges), hit-frequency, quality, or a blend? (Ties to E1 + KG clustering.)
- **Speed budget for hints** (§7) — is the system fast enough to inject query-relevant hints inside the prompt budget without a circuit-breaker trip?
- **Saved-selection** — do we build the named-reusable-filter convenience, or is grant set-algebra per-agent enough?
