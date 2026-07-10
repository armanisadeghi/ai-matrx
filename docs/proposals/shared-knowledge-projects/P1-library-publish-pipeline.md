# P1 — Library Publish Pipeline (aidream-heavy, cross-repo)

## Objective

Make "add a document to the shared library" a productized, system-owned, one-click lifecycle
instead of a hand-run script. Today the canonical AMA Guides content was ingested by
`scripts/ingest_ama_guides_library.py` under Arman's personal user, its `files.files` row still
lives in his personal workspace org, and its 2,733 chunks have `owner_id = Arman` — so
entitlement is only *mostly* grant-driven, and no admin can repeat the process without a
terminal. This project makes library content true system property, created through an API the
admin console (P2) can call.

## Scope

**In:**
1. **Admin ingest endpoint** — `POST /rag/library/stores/{store_id}/ingest` (aidream): accepts
   `{file_id, profile?}` (file already uploaded via the canonical files flow), super-admin
   gated, runs the existing-but-unused system-owner path (`library.py: ingest_library_pdf` /
   `_system_owner_uuid`) with the library profile (`run_ner=False, cleanup=False`), adds the
   store member (triggers then mirror edges), streams progress per the stream-everything
   mandate. Publish the route signature as a stub on day 1 (contract for P2).
2. **Ownership rehome** — on member-add to a `kind='library'` store (or grant publish over one):
   set `files.files.organization_id` → Matrx Library org (`system_orgs.key='library'`), keep
   `created_by` as contributor attribution. Implement at the spine (DB trigger on
   `rag.data_store_members` or inside `add_member`), not per-route. Gate on decision #2 in the
   README — if PENDING when you start, build it behind a flag and ask.
3. **Repair existing data** — re-own AMA: chunks `owner_id` → system owner; file org → Matrx
   Library; verify entitlement still passes for the grant user and that Arman's access now
   flows from super-admin/library membership, not ownership.
4. **Non-file member ingest parity** — `ingest_source` for `note|transcript|scraped|research`
   into a library store must also produce system-owned chunks (same profile switches).
5. Loud recovery: publishing/ingesting into a library store while any invariant is broken
   (missing library org, non-uuid source, owner drift) must scream, not silently degrade.

**Out:** admin UI (P2 builds it against your stub), discovery UX (P3), new edge kinds (P4),
billing/entitlements (Wave 2).

## Deliverables / DoD

- Endpoint live on prod; a super-admin can ingest a fresh PDF into a library store via curl and
  the result is: system-owned chunks (`owner_id = system`), file org = Matrx Library, store
  member row, association edges present, grant reader can read everything, non-entitled user
  cannot, contributor keeps attribution.
- AMA data repaired and re-verified (search + open + download for the C&R grant user).
- `pnpm check:migrations` green; any new migration applied + ledgered + types regenerated
  (`pnpm db-types` / `python db/generate.py`).
- FEATURE.md (rag) + aidream docs updated; deploy performed or explicitly flagged.

## Surfaces

aidream: `aidream/api/routers/rag.py`, `aidream/services/rag/library.py` (currently unused —
this is your core), `library_grants.py`, `packages/matrx-rag/matrx_rag/data_stores.py`
(`add_member`), `scripts/ingest_ama_guides_library.py` (retire or demote to a wrapper).
DB: trigger/migration for rehome; repair script for AMA rows. FE: none (P2 owns UI).

## Dependencies / contracts

Consumes frozen judge + grant predicates (README §2). Publishes the admin-ingest contract day 1.
Coordinate with P4 only if you need a new association role (register the rule first).

## Verification

Prod (or local-against-prod-DB during downtime) e2e: fresh PDF → ingest → publish → JWT-based
curl matrix (grant reader 200s on download/pages/chunks/extractions; stranger 403/404; writes
403). Adversarial re-audit before closing: one agent tries to break ownership/entitlement
assumptions (e.g., contributor retains write via created_by? rehome fires on non-library
stores?).
