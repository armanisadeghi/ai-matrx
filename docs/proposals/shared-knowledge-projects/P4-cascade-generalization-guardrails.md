# P4 — Cascade Generalization + Guardrails (DB + both repos) — **PRIORITY 3**

> Read [`README.md`](README.md) and the [handoff](../../handoffs/shared-knowledge-access.md)
> first. Status: **NOT STARTED** as of 2026-07-23.

## Objective

The cascade works for the PDF tree and is prod-proven. It works for exactly one shape of member:
`source_kind='cld_file'` is hard-coded in every sync trigger and backfill, so a library of notes,
transcripts, or scraped pages conveys **nothing** — the same wall Arman hit, waiting for the next
content type. This project makes "access cascades down the whole tree" structurally true and then
makes it *stay* true with guards that scream, so the failure class goes extinct instead of
recurring the next time someone adds a child table or a hardening pass narrows a listing.

## Scope

**In:**

1. **Non-`cld_file` store members (D-A).** For each of `note | transcript | scraped | research |
   code_file`: confirm the entity token in `platform.entity_types`, register the
   `X → data_store` rule in `association_types` (little→big, `conveys_max='viewer'`) **before**
   writing any edge (the auto-orient trigger rejects wrong-way writes of registered pairs),
   extend `rag.sync_data_store_member_association()` + backfill, and verify each content type's
   own RLS honors `iam.has_access` for that token. Then verify the **open path** in each native
   viewer (notes window, transcript studio, scraper view) for a grant-only reader — chunk search
   is already grant-aware; opening is what you are wiring.
2. **Remaining file babies.** Audit `files.analysis*`, `files.entities`, `files.structure`,
   `files.pages`, `files.page_annotations`, `files.file_rag_jobs`, `docproc.derive_runs` against
   the matrix; add additive grant-aware SELECT where a real surface reads them. Pattern:
   `migrations/page_extraction_library_grant_read.sql`. Consider folding the repeated
   job-readability `EXISTS` into one `STABLE SECURITY DEFINER can_read_extraction_job(job_id)`
   so the planner can cache the sub-plan per job.
3. **`page_extraction.py` hand-rolled gate (D-B).** `aidream/api/routers/page_extraction.py:157`
   (and `:53`, `:84`) compare `owner_id == ctx.user_id` with an ANY-admin bypass, on endpoints
   that **spend money** on embeddings — violating the repo's own rule ("never hand-roll an
   ownership comparison"). Rewrite onto the kernel per **Decision 4** (handoff): reads follow the
   cascade, spend actions stay owner/curator. Do not widen spend actions to grant readers.
4. **Acceptance matrix (the deliverable that makes this project permanent).** A parameterized,
   repeatable script — `(store, entitled_user, control_user)` — asserting the full grid: search
   hit, file download, doc metadata, pages, page image, chunks, extractions, each baby table,
   the store row itself, plus `viewer=true / editor=false / control=false` at every level.
   It must fail loudly and be runnable post-deploy. One home (`scripts/`), documented.
   **Use the non-admin entitled user** `elliesadeghijd@gmail.com`
   (`77c6af70-a35e-4724-a304-64a0dd789674`, entitled only via Pearlman Brown →
   ca-workers-comp). `admin@admin.com` is a super_admin and reports `can_curate=true`, which
   masks exactly the failures this matrix exists to catch.
5. **Drift guards (loud, non-blocking, wired like `pnpm check:schema`).**
   - *Edge coverage:* every `association_types` rule with `conveys_max` has live edges +
     reachability rows wherever its legacy table has rows (catches "the trigger stopped firing"
     and "a new member kind forgot its edge").
   - *Judge/RLS agreement:* for a sample of rows, `iam.has_access(type,id,'viewer')` must not
     disagree with what RLS actually returns — this is exactly the `rag.data_stores` bug found
     2026-07-23 (judge yes, RLS zero rows).
   - *Dead policy:* an RLS policy references a predicate but the role lacks the table/column
     SELECT grant (the `processed_documents` near-miss; column grants saved it by luck).
   - *Registry cycle check:* `iam.has_access_for_base` recurses through component/containment
     parents with no depth guard — a cyclic `entity_relationships` row would stack-overflow every
     RLS read at query time.
6. **Data hygiene + drift cleanup.** Orphan `data_store_members` rows outlive their files (D-F:
   2 of 4 live members point at deleted files) — decide delete-vs-flag and enforce. Reconcile
   the stale on-disk migrations vs live function bodies (D-H, `web_crawl_artifact_*`): the repo
   SQL no longer matches production, which will mislead the next reader. Close the `archived_at`
   asymmetry (D-D) so read and curate agree.
7. **Perf sanity.** The kernel now runs per row inside several RLS policies and loops reachability
   containers. Measure on realistic volumes (7.7k+ AMA chunks, 233 reachable files);
   `platform.reachability (item_type,item_id)` index is already present. Optimize only what you
   measured.

**Out:** product UI (P2/P3), the publish pipeline (P1), sharing *policy* changes (you generalize
child coverage, not who may share what).

## Deliverables / DoD

- A grant on a store containing a note + a transcript + a scraped page cascades: the entitled
  reader opens each in its native viewer; the control user cannot.
- Every baby table either passes the matrix or is documented as not-tenant-readable-by-design in
  `features/rag/FEATURE.md`.
- The acceptance matrix script exists, is documented, and is green; the four guards run loud.
- D-B, D-D, D-F, D-H closed. All migrations applied + ledgered + types regenerated in both repos.

## Surfaces

DB: `platform.entity_types` / `association_types` / `rag.*` + `docproc.*` triggers; migrations.
matrx-frontend: `scripts/` (matrix + guards) + `package.json` wiring; native viewer read paths if
one needs the grant branch. aidream: `aidream/api/routers/page_extraction.py`, predicate
reconciliation notes.

## Dependencies / contracts

Consumes the frozen kernel + edge dictionary (README §2). **You own all `rag.*`/`docproc.*`
trigger DDL this wave** — P1's ownership rehome lives in the `add_member` Python path, so
coordinate only if you change that trigger's semantics. Independent of P1–P3; Convergence A uses
your matrix as its audit tool.

## Verification

The matrix script IS the verification — run it before and after every change. Any change to the
kernel or an RLS policy gets an adversarial review pass (minimum two independent refuters) before
it is applied: this is the security spine, and the 2026-07-23 audit found a real judge/RLS
contradiction that no existing check would have caught.
