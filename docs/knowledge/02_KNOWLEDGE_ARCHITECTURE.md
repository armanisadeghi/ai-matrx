# Matrx Knowledge System — Master Architecture

> **Single source of truth** for the architecture and the full 7-phase lifecycle. The Phase 6 NER pipeline is zoomed in further in [`03_KNOWLEDGE_MODULE.md`](03_KNOWLEDGE_MODULE.md). Every module, package, and line of code — Python server, Admin, Local, Code, Chrome, Mobile, and the Matrx packages — maps to a place in here. A module that maps **nowhere** is a red flag.

---

## 0 · Core purpose

Ingest **any** content → understand it (entities + concepts) → **tag it to the org's own scopes** (Client Ava, Case 123, Patient X) → so users and agents can search **semantically** ("back pain") *and* **structurally** ("everything for Client Ava, Case 123"), trust results **by provenance**, and keep raw data **forever**, re-processable when instructions change.

**The One Principle:** *Clean, trustworthy data is earned, not given.* Every real source arrives messy. The system's value **is** the chain of transformations that turns that mess into knowledge.

---

## 1 · What makes this one of a kind — the Agent Fabric

Strip every other capability and keep this one, and you still have something rare. Strip *this* one and keep everything else, and you have just another very good system. **The differentiator is that a custom agent — built in minutes — can be plugged in at any node or edge of the system to do whatever you need.**

Two properties make the fabric more than "agents that chat":

**a) Agents attach anywhere.** Every phase (1–7) and every edge between phases is an attach point. A cleaning agent at Phase 3, a fact-checker at Phase 4, a scope-suggester at Phase 6, a publisher at Phase 7 — same fabric, different position.

**b) Agents are polymorphic — not just chatbots.** The same underlying agent can manifest as:
- a **chatbot** (conversational),
- a **button** (one-tap action),
- a **form** (structured input → action),
- a **one-page app / widget** (a bounded mini-tool),
- an **event automation** (runs whenever *X* happens),
- a **scheduled background job** (continuous or on an interval).

**c) MCP egress — agents as universal adapters.** The Hub's contents are highly accessible. Whatever the system natively does, it does in-system. The moment it *doesn't* do exactly what's needed, an agent takes the data — in whatever format is required — and moves it to the external platform (Shopify, WordPress, anywhere with an MCP surface) to finish the job.

**Orchestration ladder:** `Recipe → Prompt → Agent → Swarm`. Alongside agentic work sits **deterministic** execution: Functions, Tools, APIs. Pick the cheapest reliable mechanism per task; agents are not the answer to everything.

**Pipeline-creation ingredients** (what composes an agent/pipeline): Agent Instructions · Skills · Tools · Context · Recipe Prompt · Structured User Input.

> Relationship to the planes below: the four planes *describe* a knowledge object; the Agent Fabric is the **active layer that operates on them** at every phase. It is cross-cutting, not a fifth descriptive axis.

---

## 2 · The four planes (+ RAG) — the orthogonality rule

A single knowledge object has four orthogonal axes. **They must never collapse into one another** — most architectural bugs come from collapsing two.

| Plane | Axis | Answers |
|---|---|---|
| **1 · Content / Entities** (the nouns) | every scopeable thing, catalogued in `public.shareable_resource_registry`, each playing a role: **Source / Destination / Utility / Container** | *What is it?* |
| **2 · Pipeline** (the verbs) | the 7-phase flow, raw → utilized | *Where in the flow?* |
| **3 · Scopes** (the target) | per-org dimensions + M2M assignments | *What is it about?* |
| **4 · Provenance / Authority** (the trust) | how much we believe it *now*, given origin + lineage | *How much do we trust it?* |
| **RAG / Consumption** (output) | text + embedding + metadata for retrieval | *How do we find it?* |

---

## 3 · The 7-phase pipeline

Each phase lists its goal, the concrete inventory, and the **Agents** hook — where the fabric plugs in.

### Phase 1 · Acquire
- **Goal:** capture the raw source, stamp origin lineage.
- **Sources:** files (PDF, scanned docs, `.md`, `.txt`) · audio/video (meeting recordings, voice memos) · web (raw scrapes, known sites — noisy with ads/menus) · social (X, YouTube, posts) · official records & API feeds.
- **Agents:** scheduled scraper jobs, watcher automations ("on new upload/email, ingest").

### Phase 2 · Convert
- **Goal:** raw artifact → raw text equivalent (still ugly, but machine-readable).
- **Processes:** PDF parsing · audio transcription (speaker turns) · image/table understanding (OCR + reconstruction to text) · web extraction.
- **Agents:** specialized transcription/OCR-repair agents for hard formats.

### Phase 3 · Clean — two tiers
- **Tier A — generic clean:** AI pass that fixes OCR garbage, restores structure, labels speakers, strips scrape chrome. Sufficient for many inputs.
- **Tier B — custom / known-type clean (the differentiator in action):** for content of a *known type* (medical reports, court transcripts, recurring meetings with known speakers/topics/vocab), a purpose-built agent applies org-specific instructions — correcting known items (names, roles, products) and emitting structured JSON or noise-stripped text.
- **Agents:** the generic cleaner (A) and the org's known-type extraction agents (B). Tier B is what separates Matrx from generic RAG.

### Phase 4 · Enrich & branch
- **Goal:** validate, refine, and route.
- **Processes:** fact-checking against world truth or the org's own known data · refining for accuracy/conciseness · **branching** (one clean input through multiple filters, fanning out into distinct outputs in different containers).
- **Agents:** fact-check agents, refiners, branching/routing automations. Authority can change here (validation ↑, lossy compression ↓).

### Phase 5 · Admit to Hub — *the boundary*
- **Goal:** permitted content enters the **Central Hub** with lineage preserved.
- **Hub representations:** text · chunks · summaries · strings · structured schemas · vectors · indices · scoped items.
- **Note:** this is where a future **seeding guard** would decide what becomes a seed — *undecided*, see §5.
- **Agents:** triage/gate agents that decide admission and tag known metadata on the way in.

### Phase 6 · Structure & associate — *(zoom-in: the 5-stage NER pipeline)*
1. **Extract** — candidate spans (entities + concepts) via GLiNER2/Haiku. *Cost: very low.*
2. **Resolve** — collapse duplicates/synonyms ("lumbar strain" = "back injury"). *Cost: 1 batch LLM call/doc.*
3. **Score importance** — distinctive vs. corpus noise, weighted by provenance.
4. **Split & link** — *entities* → scope links (suggestions until human-confirmed); *concepts* → tagged thematic, skip linking.
5. **Store enriched chunks** — chunk → embed → persist text + embedding + entities + scope links + trust + lineage in one record.
- **Agents:** resolution, importance, and scope-suggestion agents.

### Phase 7 · Use & reprocess ↻
- **Access & display:** sheets, docs, tables, lists.
- **Search:** semantic (vectors) + structural (scopes) + trust-weighted.
- **Tools:** agents, functions, structured tools.
- **Output integrations:** export (xlsx), WordPress, Shopify, custom solutions, artifacts, render blocks (charts, flashcards, quizzes, tasks).
- **Apps:** chat, voice chat, custom agent apps/widgets, mobile, Chrome extension, desktop.
- **Reprocess loop ↻:** reach into the Hub, have an agent transform something, **put the result back** in a retained format — nothing consumed-and-lost.
- **Agents:** generators (artifacts/flashcards/quizzes), publishers (Shopify/WordPress via MCP), reprocessing jobs, search agents.

---

## 4 · Scopes & structured data

> Full detail: [`scope-model.md`](scope-model.md) · entity catalogue: [`scopeable_entities.md`](scopeable_entities.md).

User-defined dimensions — never hardcoded like Salesforce.

- **Four-level chain:** `scope type (Kids) → scope (Ava) → item (age) → value (15)`.
- **Items** are defined on the **type** (columns); **scopes** are instances (rows); **values** are cells.
- **Attribute vs. M2M:** an item/value (`age`) is an *attribute* of the scope; a note *about* Ava is an *M2M entity tag* (`ctx_scope_assignments`).
- **Ground truth:** scope values are curated facts — versioned (`is_current`), stamped with `source_type`.
- **Tables:** `ctx_scope_types` · `ctx_scopes` · `ctx_context_items` · `ctx_context_item_values` · `ctx_scope_assignments`.

---

## 5 · Provenance & authority — the trust layer

- **Content roles:** **Source** (knowledge enters) · **Destination** (knowledge produced) · **Utility** (operates/transforms, no truth of its own) · **Container** (operational — holds/groups other entities like tasks & projects, no truth of its own). Many are dual.
- **Authority tiers:** `primary` (assumed factual) · `derived` (trusted process) · `unvalidated` (raw).
- **Transformation rule:** `input_authority × utility_transformation = output_authority`.

### `UNDECIDED` / future — do not encode yet
Two things we *want* but have **not** decided. Don't build either as settled.

1. **Trust / quality scoring.** Today we conflate distinct signals into one "confidence": **Source Prior**, **Extraction Confidence**, **Validation Deltas**, and the **Composite Trust** they should feed. **Extraction confidence is mechanical certainty, not truth.** Likely future state: keep extraction quality as a *gate only*; compute trust separately as source prior moved by validation deltas.
2. **Seeding control (anti-sprouting).** We'd like a guard so a low-authority derived item (e.g. an AI-generated flashcard) can't be re-ingested as if it were an authoritative source and propagate errors. The mechanism (a seeding gate / promotion step / authority threshold) is undecided and depends on (1) — you can't gate on authority you can't score. *Suggestion:* gate on an explicit human-set `can_be_seeded` flag, not an auto score.

---

## 6 · Orchestration & human-in-the-loop

- **AI orchestration:** `Recipe → Prompt → Agent → Swarm`, plus deterministic Functions/Tools/APIs.
- **HITL — Pre:** label, tag, scope, known metadata, pipeline selection.
- **HITL — During:** review, modify, redo, reject, expand.
- **HITL — After / ongoing:** reject, modify, mark stale.

---

## 7 · 🛑 Guardrails — the 9 STOP rules

STOP and flag for human review if code does any of the following:

1. Treats a single confidence/trust number as a settled contract.
2. Uses **extraction confidence** as if it were **trust/truth**.
3. Writes a scope link straight into `ctx_context_item_values` **without** human confirmation (bypassing `scope_association_suggestions`).
4. Tags an entity to a scope **type** instead of a scope **instance**.
5. Defines scope items on a **scope** instead of on the **type**.
6. Deletes or overwrites raw extractions instead of tagging/versioning them.
7. Scope-links a **concept**, or hardcodes org-specific dimensions ("Customer") in shared code.
8. Ranks importance by raw frequency alone (ignoring distinctiveness/provenance).
9. Implies an LLM call per entity rather than a batch pass per document.

*(Fabric corollary: an agent wired in at a phase still obeys these — e.g. a Phase 7 publisher agent must carry lineage out when it pushes data through MCP egress.)*

---

## 8 · How to use this map

1. **Locate the work.** Name the phase(s) and plane(s) a module serves before building; state it in the module's own docs.
2. **No-fit = red flag.** A module that maps nowhere means the map is missing something (tell us) or the module is doing something it shouldn't.
3. **Respect the boundary (Phase 5).** Raw→text utilities live in 1–3; scope-linking/indexing in 6; retrieval/generation/egress in 7. Crossing concerns across the boundary is the most common drift.
4. **Carry lineage everywhere** — including out through MCP egress. Dropping the origin record breaks the trust story.
5. **Decide trust before encoding it** (§5 `UNDECIDED`).

---

## 9 · Open work (next pass)

The pipeline shape is settled; the **per-phase module inventory is not yet filled in.** Still open:

- **Map real modules to each phase** — name the actual packages/files (Python server, Admin, Local, Code, Chrome, Mobile, and the Matrx packages) that serve each of Phases 1–7.
- **Assign phase ownership** — decide which package *owns* each phase and where the seams between them are.
- **Map Hub representations to storage** — tie each Phase 5 representation (text · chunks · summaries · schemas · vectors · indices · scoped items) to its actual store.
- **Resolve the trust-scoring question** (§5 `UNDECIDED`) before encoding any of it into schema or code.
