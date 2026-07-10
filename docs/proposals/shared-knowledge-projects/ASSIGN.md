# Assignment prompts — Shared Knowledge fleet

Paste one block per fresh agent session. Track state here.

| Project | Status | Session/owner | Notes |
|---|---|---|---|
| P1 publish pipeline | UNASSIGNED | — | day-1 duty: publish ingest-endpoint stub |
| P2 admin console | UNASSIGNED | — | can start immediately against the stub |
| P3 discovery/opt-in | UNASSIGNED | — | item 1 shape gated on decision #1 |
| P4 generalization + guardrails | UNASSIGNED | — | matrix script feeds Convergence A |

---

## P1

> Read `/Users/armanisadeghi/code/matrx-frontend/docs/proposals/shared-knowledge-projects/README.md` (the master plan — status audit, contracts, decisions), then your brief `P1-library-publish-pipeline.md` in the same folder. You own the Library Publish Pipeline end to end (aidream + DB + data repair). Publish the admin-ingest endpoint stub signature first (P2 builds against it). Follow both repos' CLAUDE.md; migrations are applied live via Supabase MCP + ledgered, never file-only. Work on main, small commits, stage only your files. When done: prod-verify per the brief's matrix, update FEATURE.md docs, groom the master plan's status table.

## P2

> Read `/Users/armanisadeghi/code/matrx-frontend/docs/proposals/shared-knowledge-projects/README.md`, then `P2-admin-issuance-console.md`. You own the Shared Knowledge Admin Console: `/administration/shared-knowledge` (industry CRUD, org assignment, grants publish incl. the missing organization audience, ingest UI against P1's stub, access explorer) plus the `/rag/admin` FeatureAdminMap. Extend `features/industries` + `useDataStoreGrants`; never invent new grant/mutation paths or admin gates. Live browser verification with screenshots as admin@admin.com; update FEATURE.md docs; groom the master plan table.

## P3

> Read `/Users/armanisadeghi/code/matrx-frontend/docs/proposals/shared-knowledge-projects/README.md`, then `P3-discovery-and-optin.md`. You own tenant-side Discovery & Opt-in: org-settings entitlement surface, `/rag/library-catalog` route, provenance chips ("via ca-workers-comp") across hit cards / source inspector / store badges, and entitled empty states. Check the master plan §4 decision #1 before building the industry-join piece — if still PENDING, build "request to join" and flag it. Read-side only; no new mutation paths. Two-account browser verification; update FEATURE.md docs; groom the master plan table.

## P4

> Read `/Users/armanisadeghi/code/matrx-frontend/docs/proposals/shared-knowledge-projects/README.md`, then `P4-cascade-generalization-guardrails.md`. You own Cascade Generalization + Guardrails: non-cld_file store members (note/transcript/scraped/research) join the association cascade with viewer conveyance; remaining file-baby tables pass the grant-reader matrix; build the reusable acceptance-matrix script and the loud drift guards (edge-coverage + dead-policy detectors); perf-check `iam.has_access` under RLS. This is the security spine — adversarial review before applying any judge/RLS change; register association rules BEFORE writing edges. Migrations applied + ledgered + types regenerated in both repos; groom the master plan table.
