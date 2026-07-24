# P1 — Library Publish Pipeline (aidream-heavy, cross-repo) — **PRIORITY 4**

> Read [`README.md`](README.md) and the [handoff](../../handoffs/shared-knowledge-access.md)
> first. Status: **NOT STARTED** as of 2026-07-23.

## Objective

Nothing is broken for users here, which is why this is last — but it is the reason the library
cannot grow. The only shared-knowledge document in existence was ingested by a one-off script
under Arman's personal account: the AMA Guides PDF still lives in **Arman Sadeghi's Workspace**
and all 2,733 of its chunks are still `owner_id = Arman`, so "the industry owns this resource" is
true in intent and false in data. There is no admin surface to add a second document. The
system-owner ingest path already exists and is correct
(`packages/matrx-rag/matrx_rag/library.py` — `ingest_library_pdf`, `_system_owner_uuid`) and is
reachable only from a workflow node and a script. This project turns publishing into a product.

## Scope

**In:**

1. **Admin ingest endpoint — publish the signature on day 1** (P2 builds its UI against it):
   `POST /rag/library/stores/{store_id}/ingest` `{file_id, profile?}`. Super-admin gated, adds
   the store member (triggers mirror the edges), and streams progress per the stream-everything
   mandate.

   ⚠️ **You are writing a new entry point — the existing one does not fit, so read this before
   you start.** `matrx_rag.library.ingest_library_pdf(...)` takes a **`local_path` on the API
   host's filesystem**, not a `file_id`, and *creates* a new `files.files` row; it has **no**
   `run_ner` or `cleanup` parameters (those live on `ingest_library_doc` and
   `matrx_rag/ingestion.py::ingest_source` respectively). Calling it as-described will
   `TypeError`. What you want to reuse: `_system_owner_uuid(organization_id)` for ownership, the
   PDF pipeline (`ingest_pdf`) for the work, and the library profile
   **`run_ner=False` + `cleanup=False`** threaded through the path that actually accepts them.
   Both flags matter: the per-page cleanup agent chokes on chart/table pages and once ran two
   hours producing zero chunks. Verify each signature in the source before wiring.
2. **Ownership rehome (Decision 3, handoff).** On member-add to a `kind='library'` store: move
   `files.files.organization_id` to the Matrx Library org and set the system owner, keeping the
   contributor recorded as author. Implement in the `add_member` Python path — the one choke
   point every caller shares. **Not a DB trigger:** all `rag.*`/`docproc.*` trigger DDL is P4's
   this wave. If Decision 3 is unanswered when you start, build it behind a flag and flag it.
3. **Repair the existing data.** Re-own AMA: chunks `owner_id` → system owner (they are already
   correctly org-stamped to the library), file org → Matrx Library. Then re-verify that the
   entitled reader still passes the full matrix and that Arman's own access now flows from
   super-admin / library membership rather than ownership. Coordinate with
   `docs/handoffs/ama-g5-spine-consolidation.md` — that handoff owns AMA *content* quality
   (derivations, clean-stage) on the same document; do not run its stages, and do not let your
   re-own break its `owner_id`-keyed queries without updating them.
4. **Non-file ingest parity.** `ingest_source` for `note|transcript|scraped|research` into a
   library store must also produce system-owned chunks. **Your DoD stops at system-owned chunks +
   search visibility** — a grant reader *opening* non-file members needs association edges that
   do not exist yet (P4's D-A). Do not chase the open path.
5. **Build/version endpoint (D-G).** aidream has no way to answer "what commit is prod?" — the
   2026-07-23 audit had to fingerprint `/openapi.json` against git history to prove a deploy.
   Add a cheap `/health`-adjacent endpoint reporting the git SHA + build time. Small, and it
   ends a recurring class of "is it deployed?" uncertainty.
6. **Loud recovery.** Ingesting or publishing into a library store with a broken invariant
   (missing library org, non-uuid source, owner drift) screams; never silently degrades.

**Out:** admin UI (P2 builds it against your stub), discovery (P3), new edge kinds (P4),
billing/entitlements (Wave 2).

## Deliverables / DoD

- A super-admin can ingest a fresh PDF into a library store via the endpoint and the result is:
  system-owned chunks, file org = Matrx Library, store member row, association edges present,
  entitled reader reads everything, control user reads nothing, contributor keeps attribution.
- AMA data repaired and re-verified against the matrix (or P4's script if it has landed).
- Prod reports its build SHA.
- `pnpm check:migrations` green; migrations applied + ledgered; types regenerated both repos
  (`pnpm db-types` / `python db/generate.py`); aidream deployed or the need explicitly flagged.

## Surfaces

aidream: `aidream/api/routers/rag.py` · `packages/matrx-rag/matrx_rag/library.py` (the real
module — `aidream/services/rag/library.py` is only a re-export shim) ·
`packages/matrx-rag/matrx_rag/data_stores.py` (`add_member`) · `aidream/services/rag/browse.py`
(`add_user_data_store_member`, `publish_data_store_grant`) · `aidream/services/rag/library_guard.py`
· `aidream/api/routers/health.py` · `scripts/ingest_ama_guides_library.py` (demote to a wrapper).
DB: repair migration/script for the AMA rows.

## Dependencies / contracts

Consumes the frozen kernel + grant predicates. **Publishes the ingest contract day 1.** Owns no
FE. Coordinate with P4 before touching any `rag.*` trigger.

## Verification

End-to-end on prod (or local against the prod DB): fresh PDF → ingest → publish → the full
entitled/control curl matrix (entitled 200s on download/pages/chunks/extractions; control
403/404; writes 403 for both). Adversarial pass before closing: does the rehome fire on
non-library stores? does the contributor silently retain write via `created_by`? does the re-own
break any `owner_id`-keyed query, including the AMA content handoff's?
