# RAG Search System — Handoff (2026-07-01)

State of the search-quality rescue that ran 2026-06-27 → 2026-07-01 across **matrx-frontend** and **aidream**. Read this before touching retrieval ranking, the `/rag/search` page, or the rag DB surface.

---

## Architecture (settled — do not re-litigate)

- **Semantic search requires the Python server.** Query embedding (OpenAI `text-embedding-3-small`), Cohere rerank, and LLM query-expansion/HyDE are secret-key external calls; the 3-lane recall (pgvector + FTS + KG-entity) fuses via RRF in `aidream/packages/matrx-rag/matrx_rag/search.py`. The browser cannot do this.
- **Retrieve-then-rerank, two models by design:** OpenAI embeds (one embedding model per index — `rag.embeddings_oai_3_small_1536`; Voyage `voyage-code-3` for code), then Cohere `rerank-v3.5` cross-encodes the top-50 fused candidates against the query text. This is the standard pattern, not a conflict. `COHERE_API_KEY` is set in prod and **rerank is in active use**.
- **Pipeline order:** expand/HyDE → embed → vector+lexical+entity recall → RRF fuse (entity weight 0.8, HyDE 0.3) → priority + entity-importance boosts → hydrate top-50 → Cohere rerank (confidence-gated) → granularity-aware MMR → top-k + entity map.

## DB structure — updated facts (verified against the live snapshot 2026-06-30)

- **`rag` schema IS PostgREST-exposed.** `exposed_schemas` includes `rag`; ~25 rag tables are in `types/database.types.ts` (from line ~28245). **This supersedes the 2026-06-10 "rag is server-only" invariant** — old comments in aidream migrations (`kg_024`) still state the opposite.
- Core tables (schema `rag`): `kg_chunks` (+`content_tsv`), `embeddings_oai_3_small_1536`, `embeddings_voyage_code_3_1024`, `kg_entities`, `kg_chunk_entities`, `kg_entity_aliases`, `kg_edges`, `kg_clusters`, `data_stores`, `data_store_members`, `data_store_grants`, `retrieval_audit`, `embedding_cache`, suggestion + sweep tables.
- RAG-adjacent: `docproc.processed_documents` / `processed_document_pages` / `derive_runs`; `files.files` (cld_files); `public.cld_file_rag_jobs` (ingest job lock).
- **Scope filtering couples to `platform.associations`** (`target_type='scope'`), mapped by the hardcoded `_SCOPE_ENTITY_TYPE_ALIASES` in `search.py` — **must stay in sync with `platform.entity_types` tokens**. A new source_kind alias registered without updating that map silently breaks scope filtering for it.
- ⚠️ **Do NOT blindly swap FE reads to direct supabase-js on rag.*:** the Python visibility clause (`_build_visibility_clause`) is much richer than the rag RLS policies (adds `note_shares`, cld-file ACL, `data_store_grants` global/industry/org branches). A direct read returns FEWER rows wherever sharing matters. Any direct-read migration needs per-table RLS parity work first.

## DONE (all committed, test/typecheck-gated, adversarial-review-corrected)

**aidream** (`packages/matrx-rag/matrx_rag/search.py` + router; **deploy-gated** — live behavior changes only after deploy):
- `a1dd89bb6` / `454aec8f7` — entity-lane 40-char content gate + length tiebreak (killed "3-word title ranks #1"); granularity-aware MMR (same-source cross-granularity dupes collapse at 0.45; distinct sections keep 0.72).
- `8d0c5f660` — embedding / expansion / HyDE failures degrade (lexical+entity carry the search) instead of 500ing; blank queries short-circuit.
- `c76f6b105` — `RERANK_CONFIDENCE_FLOOR = 0.25`: all-low Cohere windows keep RRF order; `rerank_status` (`applied|low_confidence|failed|off`) surfaced on `SearchResponse` → `SearchResponseOut` → stream `RagSearchResult`. Suite: 212 green.

**matrx-frontend** (`features/rag/`; live as soon as `main` deploys/dev-serves):
- `f0b724959` / `0783790e2` — entity-only badge + entity-rank bar + entity chips; `SearchScopeSummary` (resolved store/org/scopes/kind; "no org = ALL your orgs"); per-term coverage chips; sidebar HyDE/multi-query/MMR knobs actually wired; honest lexical-search labeling.
- `641154e2c` / `f607f5286` / `e2b93ec7b` — `/rag/viewer?page=` deep-link; complete + URL-encoded `citationHrefFor`; seqRef race guards on all three async runners (search, diagnose stream, agent tool); `?tab`/`?store_id` deep-link handling; null guards; Entity-Recall KPI fixed.
- (uncommitted at handoff-write time, in flight: `rerank_status` FE display + Cohere tooltip — see change log)

## PENDING (detailed)

1. **Deploy aidream, then live re-verify** — run `/rag/search?q=contract indemnification liability`: the "Review the contract" task must not be #1; the FELA passage appears once; a weak query shows "rerank skipped: low confidence". Until deploy, prod serves the OLD ranking.
2. **Prod smoke of `rerank_status`** — confirm the field arrives ("applied" on a normal query) and the FE line renders.
3. **Direct-read migration opportunity (new, from rag exposure)** — pure reads (data-store list/detail, per-doc chunk inspection) could go supabase-js direct per the no-Python-for-DB-reads rule, **but only after** RLS parity with the Python visibility clause is established per table (see warning above). Candidate first target: `useDataStores` list.
4. **Stale invariant cleanup** — aidream migration comments (`kg_024` etc.) and any FE comments still claiming "rag not PostgREST-exposed" should be corrected; run Supabase advisors on rag.* RLS now that exposure is real.
5. **Eval-gated tuning backlog** (needs live A/B, deliberately not shipped blind): concurrent recall lanes via `asyncio.gather` (~2-3× latency win); RRF score-floor for long-tail noise; entity-lane weight (0.8) recalibration; multi-variant lexical recall; CJK/`websearch_to_tsquery` NULL fallback; corpus-wide per-term coverage (FE ships a per-results version).
6. **Bug 7 (deferred by design):** the `?q=` deep-link auto-run fires before Redux context hydrates → runs org-unfiltered. Acceptable for the "AI search — everything" hand-off; revisit if org-scoped deep links appear.
7. **`_SCOPE_ENTITY_TYPE_ALIASES` sync guard** — no automated check exists that its tokens match `platform.entity_types`. Worth a `check:schema`-style assertion.

## Verification friction (this machine)

Two heavy dev servers keep RAM near exhaustion: preview compiles stall, Turbopack HMR corrupts (`rm -rf .next-preview` + restart the preview server — a browser reload never fixes it), full `tsc` takes minutes. Gate backend work with `uv run pytest packages/matrx-rag/tests/` (fast, real) and FE work with `pnpm type-check`; do live browser checks on the user's own server.
