# RAG Search System — Handoff (2026-07-02)

State of the search-quality rescue + model upgrade that ran 2026-06-27 → 2026-07-02 across **matrx-frontend** and **aidream**. Read this before touching retrieval ranking, the `/rag/search` page, or the rag DB surface.

---

## Architecture (settled — do not re-litigate)

- **Semantic search requires the Python server.** Query embedding, Cohere rerank, and LLM query-expansion/HyDE are secret-key external calls; the 3-lane recall (pgvector + FTS + KG-entity) fuses via RRF in `aidream/packages/matrx-rag/matrx_rag/search.py`. The browser cannot do this.
- **Retrieve-then-rerank, two models by design:** Voyage **`voyage-4-large`** embeds prose (2026-07 upgrade — RTEB leader, 1024d, table `rag.embeddings_voyage_4_large_1024`; `voyage-code-3` for code), then Cohere **`rerank-v4.0-pro`** cross-encodes the top-50 fused candidates against the query text. Standard pattern, not a conflict. The legacy `openai:text-embedding-3-small` model + `rag.embeddings_oai_3_small_1536` table stay registered until the post-deploy verification, then get dropped in a follow-up migration.
- **Pipeline order:** expand/HyDE → embed → vector+lexical+entity recall → RRF fuse (entity weight 0.8, HyDE 0.3) → priority + entity-importance boosts → hydrate top-50 → Cohere rerank (confidence-gated at 0.25) → granularity-aware MMR → top-k + entity map.
- **Filtered-ANN recall is iterative-scan-dependent.** HNSW returns ~`ef_search` (40) neighbors BEFORE the ACL/scope WHERE filter — without iterative scans, a caller whose visible rows are a minority gets recall collapse (observed live: an owner of 7,221 embedded chunks got `vector_candidates=2`; with the fix, 100). On managed Supabase, `ALTER DATABASE/ROLE` for `hnsw.*` is permission-blocked and startup-packet GUCs do NOT survive Supavisor transaction pooling (probed live) — the ONLY reliable carrier is `SET LOCAL` in the query's own transaction, which `_vector_recall` now does via the new `QueryBuilder.compile()` matrx-orm primitive. Any future pgvector query behind an ACL filter must do the same.

## DB structure — updated facts (verified against the live snapshot 2026-06-30)

- **`rag` schema IS PostgREST-exposed.** `exposed_schemas` includes `rag`; ~25 rag tables are in `types/database.types.ts` (from line ~28245). **This supersedes the 2026-06-10 "rag is server-only" invariant** — old comments in aidream migrations (`kg_024`) still state the opposite.
- Core tables (schema `rag`): `kg_chunks` (+`content_tsv`), `embeddings_oai_3_small_1536`, `embeddings_voyage_code_3_1024`, `kg_entities`, `kg_chunk_entities`, `kg_entity_aliases`, `kg_edges`, `kg_clusters`, `data_stores`, `data_store_members`, `data_store_grants`, `retrieval_audit`, `embedding_cache`, suggestion + sweep tables.
- RAG-adjacent: `docproc.processed_documents` / `processed_document_pages` / `derive_runs`; `files.files` (cld_files); `public.cld_file_rag_jobs` (ingest job lock).
- **Scope filtering couples to `platform.associations`** (`target_type='scope'`), mapped by the hardcoded `_SCOPE_ENTITY_TYPE_ALIASES` in `search.py` — **must stay in sync with `platform.entity_types` tokens**. A new source_kind alias registered without updating that map silently breaks scope filtering for it.
- ⚠️ **Do NOT blindly swap FE reads to direct supabase-js on rag.*:** the Python visibility clause (`_build_visibility_clause`) is much richer than the rag RLS policies (adds `note_shares`, cld-file ACL, `data_store_grants` global/industry/org branches). A direct read returns FEWER rows wherever sharing matters. Any direct-read migration needs per-table RLS parity work first.

## DONE (all committed, test/typecheck-gated, adversarial-review-corrected)

**Model upgrade round (2026-07-02, aidream `582c29782` + FE `522ac376e`):**
- `voyage-4-large` prose default (researched best-available; ~4.5M-token corpus re-embed fits Voyage's free 200M tier). Migration 0136 **applied + ledgered + live-verified** (6 RLS policies at exact parity with the oai table). **All 13,004 live chunks backfilled — 0 missing** (`scripts/backfill_voyage4_embeddings.py`, idempotent).
- `rerank-v4.0-pro` (beats v3.5 on every public benchmark set).
- Fixed latent `_embed_voyage` bug (hardcoded voyage-code-3 for ALL Voyage models).
- Fixed filtered-ANN recall collapse (see Architecture) — verified live: same query/user went `vector_candidates` 2 → 100 and the missing document passages returned, through the FULL new stack (`voyage-4-large` embed → new table → `rerank-v4.0-pro` `status=applied`).
- Router health/library status probes repointed at the new prose table; self-heal + `_vector_recall` table→ORM-model map extended (load-bearing).

**aidream** (`packages/matrx-rag/matrx_rag/search.py` + router; **deploy-gated** — live behavior changes only after deploy):
- `a1dd89bb6` / `454aec8f7` — entity-lane 40-char content gate + length tiebreak (killed "3-word title ranks #1"); granularity-aware MMR (same-source cross-granularity dupes collapse at 0.45; distinct sections keep 0.72).
- `8d0c5f660` — embedding / expansion / HyDE failures degrade (lexical+entity carry the search) instead of 500ing; blank queries short-circuit.
- `c76f6b105` — `RERANK_CONFIDENCE_FLOOR = 0.25`: all-low Cohere windows keep RRF order; `rerank_status` (`applied|low_confidence|failed|off`) surfaced on `SearchResponse` → `SearchResponseOut` → stream `RagSearchResult`. Suite: 212 green.

**matrx-frontend** (`features/rag/`; live as soon as `main` deploys/dev-serves):
- `f0b724959` / `0783790e2` — entity-only badge + entity-rank bar + entity chips; `SearchScopeSummary` (resolved store/org/scopes/kind; "no org = ALL your orgs"); per-term coverage chips; sidebar HyDE/multi-query/MMR knobs actually wired; honest lexical-search labeling.
- `641154e2c` / `f607f5286` / `e2b93ec7b` — `/rag/viewer?page=` deep-link; complete + URL-encoded `citationHrefFor`; seqRef race guards on all three async runners (search, diagnose stream, agent tool); `?tab`/`?store_id` deep-link handling; null guards; Entity-Recall KPI fixed.
- `241b5b20b` — `rerank_status` FE display ("rerank skipped: low confidence" / "rerank failed — fusion order") + reranker tooltip; `522ac376e` — v4-stack tooltip + regenerated types.

## PENDING (detailed)

1. **Deploy aidream** — the single gate. Until deploy, prod serves the OLD stack (openai embeddings, rerank-v3.5, no confidence floor, collapsed filtered recall). After deploy, prod immediately runs voyage-4-large + rerank-v4.0-pro against the already-backfilled table.
2. **Immediately post-deploy:** (a) re-run `uv run python scripts/backfill_voyage4_embeddings.py` — catches any chunks ingested between the 2026-07-02 backfill and the deploy (pre-deploy prod still writes embeddings to the OLD table); (b) smoke `/rag/search`: results line shows real hits, `rerank_status="applied"`, and a weak query shows "rerank skipped: low confidence".
3. **Follow-up migration (after 1–2 weeks of verified quality):** drop `rag.embeddings_oai_3_small_1536` + deregister `openai:text-embedding-3-small` from `SPECS` + remove its self-heal map entry (no-legacy rule). Also re-check `RERANK_CONFIDENCE_FLOOR` (0.25, tuned on v3.5) against `rag.retrieval_audit` rerank-score distributions under v4.0-pro.
4. **Direct-read migration opportunity (new, from rag exposure)** — pure reads (data-store list/detail, per-doc chunk inspection) could go supabase-js direct per the no-Python-for-DB-reads rule, **but only after** RLS parity with the Python visibility clause is established per table (see warning above). Candidate first target: `useDataStores` list.
5. **Stale invariant cleanup** — aidream migration comments (`kg_024` etc.) and any FE comments still claiming "rag not PostgREST-exposed" should be corrected; run Supabase advisors on rag.* RLS now that exposure is real.
6. **Eval-gated tuning backlog** (needs live A/B, deliberately not shipped blind): concurrent recall lanes via `asyncio.gather` (~2-3× latency win); RRF score-floor for long-tail noise; entity-lane weight (0.8) recalibration; multi-variant lexical recall; CJK/`websearch_to_tsquery` NULL fallback; corpus-wide per-term coverage (FE ships a per-results version); letterhead/boilerplate stripping at the cleanup stage (medical records surface near-identical letterhead pages as separate hits — content issue, not ranking).
7. **Bug 7 (deferred by design):** the `?q=` deep-link auto-run fires before Redux context hydrates → runs org-unfiltered. Acceptable for the "AI search — everything" hand-off; revisit if org-scoped deep links appear.
8. **`_SCOPE_ENTITY_TYPE_ALIASES` sync guard** — no automated check exists that its tokens match `platform.entity_types`. Worth a `check:schema`-style assertion.

## Verification friction (this machine)

Two heavy dev servers keep RAM near exhaustion: preview compiles stall, Turbopack HMR corrupts (`rm -rf .next-preview` + restart the preview server — a browser reload never fixes it), full `tsc` takes minutes. Gate backend work with `uv run pytest packages/matrx-rag/tests/` (fast, real) and FE work with `pnpm type-check`; do live browser checks on the user's own server.
