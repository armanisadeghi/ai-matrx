# P4 — Cascade Generalization + Guardrails (DB + both repos)

## Objective

The reachability cascade now works for the PDF tree (store → file → processed doc → pages /
images / chunks / extractions). This project makes "access cascades down the knowledge tree"
true for the WHOLE tree and keeps it true: non-file store members, the remaining file babies,
and — most important — automated guards that scream when a new child table or member kind is
added without joining the cascade. This is the class-extinction project: after it, "search
finds it but you can't open it" cannot recur silently anywhere (industries today; org and scope
sharing tomorrow).

## Scope

**In:**
1. **Non-file store members.** `rag.sync_data_store_member_association()` returns early for
   `source_kind <> 'cld_file'` — members of kind `note | transcript | scraped | research |
   code_file` create NO edge, so a library store of notes will not cascade. For each kind:
   confirm the entity token exists (`platform.entity_types`), register `X → data_store`
   association rules (little→big, Conveys viewer — via the Relationship Manager doctrine:
   registry row BEFORE edges), extend the sync trigger + backfill, and verify the content's own
   RLS honors `iam.has_access` for that token. Chunk search for these kinds is already
   grant-aware; the OPEN path (their native viewers: note window, transcript studio, scraper
   view) is what you are wiring — verify each viewer's read path for a grant-only reader.
2. **Remaining file babies.** Audit `files.analysis*`, `files.entities`, `files.structure`,
   `files.pages`, `files.page_annotations`, `files.file_rag_jobs`, `docproc.derive_runs`
   against the grant-reader matrix; add additive grant-aware SELECT (delegating to
   `iam.has_access('file', file_id)` or `can_read_processed_document`) where a Source-Inspector
   or file-detail surface reads them. Pattern reference:
   `migrations/page_extraction_library_grant_read.sql`.
3. **Acceptance harness (the guard).** A repeatable script (`scripts/` in matrx-frontend or
   aidream — your call, one home) that runs the full matrix against live: for a
   parameterized (store, grant-user, stranger) — search hit, file download, doc meta, pages,
   page image, chunks, extractions, each baby table direct read; asserts
   viewer=true/editor=false/stranger=false. Runs post-deploy and in the Convergence-A audit.
4. **Drift guards (loud).**
   - A check (SQL or script, wired like `pnpm check:schema`) that every `association_types`
     rule with `conveys_max` has live edges + reachability rows where its legacy table has
     rows (catches "trigger stopped firing" and "new member kind forgot its edge").
   - A dead-policy detector: RLS policy references a predicate but the role lacks table/column
     SELECT grant (the `processed_documents` near-miss found 2026-07-10 — column grants saved
     it; make the check so the next one isn't luck).
5. **Perf sanity.** `iam.has_access` now runs per-row inside several RLS policies and loops
   reachability containers with per-container EXECUTEs. Measure on realistic volumes (13k
   chunks, 232 reachable files); add indexes (e.g. `platform.reachability (item_type,item_id)`
   — verify existing) or short-circuits if p95 direct-read latency regresses. Don't
   micro-optimize past the measurement.
6. **Security hardening follow-ups** from the adversarial nits: dual read predicates
   (`can_read_processed_document` vs judge) — document the boundary or unify; `document.py`
   org-match trusts `ctx.organization_id` — verify membership server-side; broad
   `WHEN others` swallows in `entity_row_access_attrs` — narrow where safe.

**Out:** publish pipeline (P1), all product UI (P2/P3), org/scope *sharing semantics* changes
(the spine already handles org/scope shares via permissions/reachability; you generalize
children coverage, not sharing policy).

## Deliverables / DoD

- Grant on a store containing a note + transcript + scraped page cascades: entitled reader
  opens each in its native viewer; stranger cannot. Matrix script proves it and is documented.
- Every baby table above either passes the matrix or is explicitly documented as
  not-tenant-readable-by-design in `features/rag/FEATURE.md`.
- Drift guards run loud (red-box style, non-blocking pre-commit / CI-strict like
  `check:migrations`), documented in the guard's own FEATURE/README.
- All migrations applied + ledgered + types regenerated; both repos' docs updated.

## Surfaces

DB: `platform.entity_types` / `association_types` / triggers in `rag.*`, `docproc.*`;
migrations. matrx-frontend: `scripts/` guard + package.json wiring; viewers only if a read path
needs the grant branch (notes window, transcript studio, scraper view read hooks). aidream:
predicate unification notes, `document.py` org check.

## Dependencies / contracts

Consumes frozen judge/predicates and the edge dictionary (README §2); REGISTERS new
association rules before writing edges (auto-orient trigger enforces). Independent of P1–P3;
Convergence A consumes your matrix script as its audit tool.

## Verification

The matrix script IS the verification; run it before and after every change. Adversarial
review pass on any `has_access`/RLS change (this is the security spine — two independent
refuters minimum before applying).
