# Knowledge System — Master Tasklist (the road to reality)

> **What this is.** The single tracker for everything that must get done — big and small — before the Knowledge System vision is real. It is the **gap analysis**: the [vision](01_KNOWLEDGE_OVERVIEW.md) (what we want) minus the [code reality](../rag_and_ner/reality/00_REALITY_MAP.md) (what we have) = the tasks below.
>
> **How it relates to the other docs:**
> - **Vision** (what we're building): [`01_KNOWLEDGE_OVERVIEW.md`](01_KNOWLEDGE_OVERVIEW.md) → its detail docs.
> - **Reality** (what the code does today): [`../rag_and_ner/reality/`](../rag_and_ner/reality/00_REALITY_MAP.md).
> - **Backlog inventory + evidence** (every item, with file:line proof and bucket): [`../rag_and_ner/00_CLEANUP.md`](../rag_and_ner/00_CLEANUP.md) — **§2.0 is the bucket index**.
> - **This doc** is the *prioritized, trackable* layer on top of that inventory. Each task links to its backlog `#N` for the evidence; update **status here** as work happens.
>
> **Keep it honest:** a task is `✅ done` only when the code does it (cite where). Truth-checked against live code 2026-06-04.

---

## Legend

**Status:** `☐` not started · `◐` in progress · `⛔` blocked · `✅` done · `💤` deferred
**Priority:** `P0` the crux / unblocks everything · `P1` high value, do soon · `P2` real work, not urgent · `P3` nice-to-have / scale
**Bucket** (from `00_CLEANUP` §2.0): **BUILD** code task · **VISION** concept · **DROP** dead · **OPS** one-shot · **UNDECIDED** decide first.
`#N` = the item number in [`00_CLEANUP.md`](../rag_and_ner/00_CLEANUP.md) §2 (evidence + notes live there).

---

## E0 · Decide first — these gate real code (UNDECIDED + contradictions)

Building before these are answered will encode the wrong thing. Owner: **you** (product/architecture).

| Status | Decision | Refs |
|---|---|---|
| ✅ | **Quality / trust model — DECIDED 2026-06-05.** Not one number: a **Quality Vector** + purpose-dependent **composite**, propagated in log-odds space (`preserve`/`additive_impact`/`targeted_transform`), with seeding controls. Single source of truth: [`04_matrx_quality_model.md`](04_matrx_quality_model.md). Extraction confidence stays a mechanical gate, walled off. Build = **E9** (rollout). | #15, #16, #17 · [`04`](04_matrx_quality_model.md) |
| ✅ | **Scope-link ownership — DECIDED 2026-06-05.** Both, as two suggestion-first stages (A assign source→scope, B fill scope items), driven by a Helpful AGX agent, scored by a **match confidence** walled off from the Quality Model. Spec: [`scope-association-pipeline.md`](scope-association-pipeline.md). Build = E3. | `00_CLEANUP` §4.2/§4.12 |
| ☐ | **Scope substrate is destructive** — the scope plan drops `workspace_id` from `cx_conversation`/`notes`/`user_files`/`transcripts` and renames `context_item_values`→`ctx_context_item_values`. Verify nothing in RAG ingest keys on `workspace_id` before #48–51. | `00_CLEANUP` §4.11 · #84 |
| ✅ | **Awareness model — DECIDED 2026-06-06.** Replaced by **bounded agentic search**: never auto-inject; agent gets a bounded universe + search/navigate tools, access granted per-agent **mirroring the tool hierarchy** (agent grants + forbidden floor → surface → user wins; ownership is the hard cap). Auto-injection survives only as rare pre-orchestrated **hint injection** (memory). Spec: [`agent-knowledge-access.md`](agent-knowledge-access.md). Build = **E10**. | #41, #42, #45, #46 |
| ✅ | **Source-of-truth & lineage shape — DECIDED 2026-06-06.** Not a binary: **provenance root** (immutable original; anchors `source_quality`; truth-of-record verification walks back to) **+** **canonical working copy** (the promoted derived artifact retrieval *prefers* — clean text / validated JSON; a flag, not a rewrite; promotion via the seeding gate). Lineage = a **DAG** (`artifact_lineage_edges`), not a single parent pointer; **every chunk is an artifact node** with its own quality vector. Entities **anchor** to one artifact, not carry parallel lineage. Detail: [`04`](04_matrx_quality_model.md) §22. Build = **E9**. | `04` §22 |
| ✅ | **Deletion & erasure — DECIDED 2026-06-06.** "Retain by default" = **no auto-drop on done-reading**, NOT a deletion veto. **User is the ultimate boss** — may delete anything. On anchor deletion: **warn** + **tombstone** (purge bytes; keep node shell + lineage edges + quality vectors so the graph stays walkable). Derived artifacts **survive by default**; warning offers one-click **cascade-redact** for right-to-be-forgotten. Data model: [`04`](04_matrx_quality_model.md) §22.7. Build = **E9**. | `04` §22.7 |
| ☐ | **`.aidreamignore` + branch/time-travel semantics** — product behavior unclear. | #26, #28 |
| ☐ | Keep the **two NER stacks** distinct (kg/GLiNER vs PDF Presidio/spaCy redaction) — don't conflate in any roadmap. | #97, §4.13 |

---

## E1 · The crux — wire NER/KG into retrieval (biggest vision↔reality gap)

> Today: NER writes entities on ingest; `search()` **never reads them**. This epic closes the seam. See [`reality/03_CONNECTION_REALITY.md`](../rag_and_ner/reality/03_CONNECTION_REALITY.md).

| Status | P | Task | Depends on | Ref |
|---|---|---|---|---|
| ☐ | P0 | `search()` joins the entity layer (`kg_chunk_entities`/`kg_entities`/clusters) for ranking/expansion/filters | — | #1 |
| ☐ | P0 | Entity-aware re-ranking (importance / scope-linked entities boost passages) | #1, #3, E3 | #2 |
| ☐ | P1 | Voyage code embeddings reachable in default `search()` (not OpenAI-table-only) | — | #10 |
| ☐ | P1 | Structural retrieval filter by **scope** (`ctx_scope_assignments`) — semantic + structural together | E0 scope, #84/#85 | #48 |
| ☐ | P2 | Wire `grounding.verify_grounded` into the search/ranking path (built, only used in eval) | — | #40 |

---

## E2 · Flip the switches — built but off/unwired (cheap, high-value)

> Code exists; it just never runs in production. Lowest effort per unit of value.

| Status | P | Task | Ref |
|---|---|---|---|
| ☐ | P1 | Wire **KG clustering** into production (call `run_clustering_pass` post-ingest or scheduled) — only the test harness calls it today | #5 |
| ☐ | P1 | Enable the **auto_ingest NOTIFY listener** (`AIDREAM_AUTO_INGEST_LISTENER`) + operate it — unblocks notes/transcript/scrape/task auto-index | #99 |
| ☐ | P1 | Turn on **notes auto-index** end-to-end (rides on #99) | #19 |
| ☐ | P1 | NOTIFY listener for `rag_data_store_changed` → `refresh_agents_for_data_store` (functions exist, unwired at startup) | #43 |
| ☐ | P2 | Cross-chunk NER finisher (`MATRX_RAG_NER_FINISHER_MODEL`) | #6 |
| ☐ | P2 | LLM canonicalizer (`RAG_NER_CANONICALIZER_MODEL`) — defined, "not wired yet" | #7 |
| ☐ | P2 | Semantic scope matching in suggestions (`SUGGESTION_MATCH_SEMANTIC`) | #8 |
| ☐ | P2 | Contextual retrieval prefixes (`RAG_CONTEXT_RETRIEVAL`) | #29 |
| ☐ | P2 | HyDE / multi-query expansion (defaults off) | #38 |
| ☐ | P2 | Cohere rerank (needs `COHERE_API_KEY`) | #39 |

---

## E3 · Close the NER pipeline (Phase 6 stages 3–4 + dedup)

| Status | P | Task | Depends on | Ref |
|---|---|---|---|---|
| ☐ | P1 | **Importance scoring** (stage 3) — distinctive vs corpus noise, provenance-weighted; align with the quality model | E9 (quality rollout) | #3 |
| ☐ | P1 | **Scope Association — Stage A agent** (AGX "Scope Matcher"): feed full known-taxonomy JSON; abstain-is-good; emit candidates w/ match confidence → `scope_association_suggestions`. Triggers on **new source ingest**. | E0 scope (done) | #49 |
| ☐ | P1 | **Scope Association — Stage B agent** (AGX "Item Extractor"): feed scope-type item keys + current values (truncated) + content + `fetch_full_value` tool; blank→propose, filled→suggest-change-with-evidence. | Stage A | #50 |
| ☐ | P1 | **Item-value suggestion ledger + confirm paths** — Stage A confirm → `ctx_scope_assignments`; Stage B confirm → `ctx_context_item_values` (`source_type` ai→user). Never auto-write. | #49, #50 | #9, #50 |
| ☐ | P2 | Speculative Stage-B gate (run B before user confirm when Stage A match confidence ≥ proceed-threshold) + user-triggered gap-fill entry point | Stage A/B | spec |
| ☐ | P2 | Batch resolve / dedupe across chunks (not just in-batch) | — | #11 |
| ☐ | P2 | Near-duplicate entity merge (cosine > 0.92) in the hot path | — | #12 |
| ☐ | P2 | Tag scopeable entity types from registry on ingest (subset → full) | E0 scope | #51 |

---

## E4 · Content bridges — get more Sources into the corpus

> Most of these "Sources" in the vision produce **zero chunks** today.

| Status | P | Task | Ref |
|---|---|---|---|
| ☐ | P1 | **Conversation / `cx_message` body ingest** (currently `unsupported_source_kind`) | #18 |
| ☐ | P1 | **Research → RAG bridge** (`research_*`/`source_*` tables; ~2k sources unindexed) | #20 |
| ☐ | P1 | **Transcript + scraped-content auto-ingest** (resolver supports them; no default path) | #94 |
| ☐ | P1 | Delta/version-aware research re-index (re-index on new versions, not full re-ingest) | #95 |
| ☐ | P2 | Wire `matrx_legal.rag` embedder + `search_indexed_cases` into host RAG/tool registry | #92 / #22 |
| ☐ | P2 | **Sandbox codebase indexing** (walker → `repo_ingest`) | #21 |
| ☐ | P3 | File-watcher incremental code index (Mode B) | #24 |

---

## E5 · Ingestion quality — PDF, code, dedup

| Status | P | Task | Ref |
|---|---|---|---|
| ☐ | P2 | Layout/semantic-aware PDF chunking (Docling section boundaries) | #86 |
| ☐ | P2 | Multimodal RAG chunks — figure/chart variants + `[FIGURE: file_id]` placeholders | #87 |
| ☐ | P2 | Wire repeated header/footer strip (`strip_repeated_regions`, shipped) into ingest | #89 |
| ☐ | P2 | RAG-ingest dedup by content hash (reuse `processed_documents.file_content_hash`) | #91 |
| ☐ | P2 | Page-extraction → entities (today writes chunks, not entities) | #31 |
| ☐ | P3 | Tiered PDF→RAG ingest (permissive / Docling / cloud-OCR) | #88 |
| ☐ | P3 | `pdf_layout_classifications` cache table | #90 |
| ☐ | P3 | Cross-file symbol resolution (import-graph) | #27 |
| ☐ | P3 | `chunk_code` line-window → richer (tree-sitter is the real path) | #30 |

---

## E6 · Retrieval safety, infra, package extraction

| Status | P | Task | Ref |
|---|---|---|---|
| ☐ | P1 | `rag.scope_bindings` table (explicit scope→source binding) — incident design | #41 |
| ☐ | P1 | Tenant-level feature flag for any hot-path RAG context | #45 |
| ☐ | P1 | Latency budget + circuit breaker on prompt-time RAG resolution | #46 |
| ☐ | P2 | `rag.ingest_runs` audit table (prior art: `matrx-legal` `LegalIngestRun`) | #32 |
| ☐ | P2 | VectorStore seam migration (inline asyncpg → `get_vector_store()`) | #36 |
| ☐ | P2 | matrx-rag Phase 2b — five injection seams (PDF writer, dedup service, +3) | #93 |
| ☐ | P2 | matrx-rag package router parity (streaming, verify, library, data-stores, admin) | #37 |
| ☐ | P2 | RAG ingest as background worker with dedicated pool | #74 |
| ☐ | P2 | `cld_events` → RAG (re)index worker (file create/update/delete) | #96 |
| ☐ | P2 | matrx-utils PDFHandler `s3://` in `fetch_remote` (drop the aidream workaround) | #72 |
| ☐ | P2 | Stream-event TypeScript types published / synced (drift caused a parser bug) | #73 |
| ☐ | P2 | Eval harness golden sets at scale | #71 |
| ☐ | P2 | matrx-local mounts matrx-rag routers + local VectorStore (other repo) | #77 |
| ☐ | P3 | Self-hosted GLiNER2 (reduce hosted dependency) | #76 |

---

## E7 · Admin / agent UI (lives in `dashboard/` / `matrx-frontend` — verify there)

> Backend/API mostly shipped; the gap is frontend. Confirm against the FE repos before scoping.

| Status | P | Task | Ref |
|---|---|---|---|
| ☐ | P1 | Per-agent **RAG controls UI** (`rag_awareness_mode` + tool checkboxes) — DB column exists | #42 |
| ☐ | P2 | matrx-admin RAG section (7 pages in old DASHBOARD spec) | #52 |
| ☐ | P2 | `rag_boost` slider on agent + job; render `agent_structured_json` hits from `metadata.payload` | #65 |
| ☐ | P2 | `RAG_AUTO_INDEX_EXTRACTIONS` per-org/per-user UI toggle (env-only today) | #66 |
| ☐ | P2 | `/rag/search` page — rerank toggle / data-store filter | #57 |
| ☐ | P3 | Word-level bbox overlay (#54), char-level chunk highlight (#55), retrieval audit UI (#56) | #54–56 |
| ☐ | P3 | File-status badges, "not yet indexed" filter, live chunk counts in `/files` | #58–60 |
| ☐ | P3 | Reusable FE components (CitationChip, SectionHistogramPill, …), keyboard nav, better error toast | #61, #63, #64 |
| ☐ | P3 | Opt-in FE rendering for agent-extract priority hits | #62 |

---

## E8 · OPS — one-shot / operational

| Status | P | Task | Ref |
|---|---|---|---|
| ☐ | P2 | Backfill historical page-extraction runs into RAG (`scripts/backfill_rag_extraction_index.py`) | #67 |
| ☐ | P2 | Backfill `kg_chunks.processed_document_id` for legacy rows (verify `scripts/backfill_kg.py` covers it) | #33 |
| ☐ | P3 | Backfill / re-ingest Ellie ACOEM PDFs as global library | #34 |
| ☐ | P3 | Periodic vacuum / analyze on `rag.kg_chunks` at 100k+ | #75 |
| ☐ | 💤 | Drop legacy `extracted_documents` view (after FE migration verified) | #35 |

---

## E9 · Quality model rollout (design DECIDED in [`04_matrx_quality_model.md`](04_matrx_quality_model.md))

> Design is settled — this is **implementation only**. `04`'s own TASKS section was written without seeing the codebase; the tasks below are the repo-grounded version. Ground each against real packages/tables before building.

| Status | P | Task | Ref |
|---|---|---|---|
| ☐ | P1 | **Quality engine module** — `clamp_q` / `logit` / `sigmoid` / `preserve` / `adjust` / `derive` / `weighted_geometric_mean` / `compute_composite_quality` / `apply_utility_profile` / `create_quality_event`, + edge-case tests (0, 100, 99.99, weak-input-strong-utility, strong-input-lossy-utility, missing/conflicting). Package TBD (matrx-utils/matrx-ai candidate; must stay package-independent). | `04` TASKS §1 |
| ☐ | P1 | **DB schema** — `artifact_quality_vectors`, `utility_quality_profiles` (incl. **`calibration_state`** `uncalibrated\|provisional\|calibrated` — add from the start; bolting it on later re-touches every profile row), `quality_events`, `artifact_lineage_edges` (`parent_artifact_id, child_artifact_id, utility_id, utility_version, quality_event_id, edge_type`; index BOTH columns), `composite_quality_profiles`, `quality_policy_defaults` (relational columns for canonical fields, JSONB only for extras). Migration → apply to Supabase → `python db/generate.py`. | `04` TASKS §2, §22, §22.6 |
| ☐ | P1 | **Chunk = artifact node** — replace the lone `(source_kind, source_id)` pointer; persist quality vector + lineage edges at Stage-5 ingest. Node flags: **`is_provenance_root`** (originals only) + **`canonical_for`** (promoted working copy). | #15 · `04` §22 |
| ☐ | P1 | **Lineage traversal contracts** — recursive drill-down (walk parents → source-of-truth) + fan-out (`children WHERE parent = X`, "its 26 extractions"); serve §5c drill-downs from these. | `04` §22 · access §5c |
| ☐ | P1 | **Entity anchoring** — `EntityMention.extracted_from_artifact_id` (one anchor) + `span` + `extraction_confidence` (mechanical) + `transformation_flags` (per-artifact) + `human_verification`. Cross-artifact appearance is **derived** by walking edges, NOT stored. Trust = each anchor's quality vector. | `04` §22 · `03` §6 |
| ☐ | P1 | **Seeding guard** — `seed_policy` / `can_be_seeded`; derived artifacts never auto-seed; canonical promotion goes through it. | #16 · `04` §seeding |
| ☐ | P1 | **Tombstone / erasure path** — delete a provenance root → purge bytes, retain node shell + lineage edges + quality vectors; drill-down to a deleted anchor returns a tombstone marker. Anchor-delete warning; default derived **survive** + optional one-click cascade-redact. | E0 erasure · `04` §22.7 |
| ☐ | P2 | **Default utility profiles + backfill** — every existing utility (chunker, extractor, resolver, converter, OCR, …) gets a default profile; no null quality vectors in active scoring. | #17 · `04` TASKS §4 |
| ☐ | P2 | **Named composite profiles** — purpose-dependent composite (factual/legal-conservative vs study/usability), not one universal formula. | `04` §composite |
| 💤 | P3 | **DEFER to v2** — multi-input weighting (`04` §12), conflict penalties (§12.3), composite-profile precedence hierarchy (§13/§8). Correct but premature: no usage data to calibrate against yet. | `04` §12–13 |

---

## E10 · Agent knowledge access & retrieval tools (DECIDED in [`agent-knowledge-access.md`](agent-knowledge-access.md))

> Mirrors the existing tool-injection hierarchy ([`tool_merge.py`](../../aidream/api/utils/tool_merge.py)). Don't invent a new merge — clone it.

| Status | P | Task | Ref |
|---|---|---|---|
| ☐ | P1 | **`agx_agent.knowledge_config` JSONB** + resolver — grants / forbidden floor / focus_default / hints, defensive read like `tool_config`. Migration → Supabase → `db/generate.py`. | spec §9 |
| ☐ | P1 | **Access merge** — union(agent, surface, request, user) − excluded, ∩ user-owned; user-wins; surface-narrows-only. Reuse the `apply_unified_tools` precedence. | spec §2 |
| ☐ | P1 | **Grant set-algebra** — union + **exclude** (conflict walls, "Org X − Case Y") + **intersection** (slice, "CA WC ∩ reference"). | spec §4 |
| ☐ | P2 | **Deprecate `rag.data_stores`** — migrate manual buckets → scope assignments / saved selection; AMA-Guides-style libraries become scopes; retire `data_store_members`. | spec §4a |
| ☐ | P1 | **`knowledge_search` tool** — returns §5a minimal hits **+** §5b condensed entity/topic map; bounded by the resolved universe. | spec §5,6 · #1,#2,#48 |
| ☐ | P1 | **`knowledge_get` / `knowledge_fetch_region`** — full content + open original page/region (lineage drill to source-of-truth). | spec §5c |
| ☐ | P1 | **`knowledge_navigate`** — entity → linked artifacts, topic-cluster → artifacts (NER-as-map). Requires E1 (KG read in retrieval). | spec §5b · #1,#10,#40 |
| ☐ | P2 | **Grant-as-preamble** — render the searchable universe as a one-line capability preamble so the tool family stands out. | spec §8 |
| ☐ | P2 | **Hint injection (memory)** — generalize `rag_awareness_mode`/`compute_awareness_fragment` to pre-orchestrated, scoped, flagged hints. | spec §7 · #43 |
| ☐ | P2 | Fold **`rag.scope_bindings` (#41)** into the resolved-universe binding (don't build separately). | spec §9 · #41 |

---

## Vision backlog — track, but NOT "before reality"

These are concept/goal items. They live in the [vision docs](01_KNOWLEDGE_OVERVIEW.md); listed here so they're never lost. Promote to an epic above only after the relevant E0 decision.

| Item | Where the vision lives |
|---|---|
| Entity vs concept split (stage 4) — concepts thematic-only | `03_KNOWLEDGE_MODULE.md`; #4 |
| Per-org theme pass (human-reviewed noise dampening) | `03_KNOWLEDGE_MODULE.md` §7; #13 |
| Org-specific linking agent (reusable prompt + scope lists) | #14 |
| ~~Provenance on chunk~~ — **promoted to E9** (quality vector + lineage on chunk) | E9; #15 |
| Map modules → 7 phases (architecture §9 open work) | `02_KNOWLEDGE_ARCHITECTURE.md` §9; #47 |
| pgvector → Vespa/Qdrant at scale; per-tenant FinOps; image enrichment runner | #68, #69, #70 |
| Agent Fabric attach points per phase; Tier-B clean agents; MCP egress w/ lineage; unified "Hub" reprocess loop; human-in-the-loop bands | `02_KNOWLEDGE_ARCHITECTURE.md` §1; #79–83 |
| PDF redaction NER (Presidio/spaCy) — separate stack, tracked to avoid conflation | #97 |

---

## Done since last audit · Dropped

- ✅ **#78 — `rag` schema in ORM generation** (2026-06-03): generated managers in `db/managers/rag/`, `db/models_rag.py`, `kg_managers.py` imports them. See [`reality/04`](../rag_and_ner/reality/04_ORM_AND_SCHEMA.md) §3.
- ✅ **pgvector codec bug** (2026-06-03): vector columns now decode to `list[float]`. `reality/04` §2.
- ❌ **Dropped:** #23 matrx-medical (0 files in repo) · #25 `aidream/cli/repo_ingest.py` (never existed) · #53 4-pane viewer (superseded by 3-pane preview) · #98 `ctx_get` search-mode (excluded by design).

---

## Maintaining this file

- When you start/finish a task, flip its **status** here and (if done) add a one-line "where in code" note.
- New work: add the row here **and** an evidence entry in [`00_CLEANUP.md`](../rag_and_ner/00_CLEANUP.md) §2 with a `#N`.
- Vision (concepts) → `docs/knowledge/`. Code truth → `docs/rag_and_ner/reality/`. Never scatter RAG markdown elsewhere.
