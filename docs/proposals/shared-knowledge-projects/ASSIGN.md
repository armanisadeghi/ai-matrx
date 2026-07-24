# Assignment prompts — Shared Knowledge fleet

**Status 2026-07-23: all four unassigned, all four re-verified against live state.** Paste one
block per fresh agent session. Priority order is P3 → P2 → P4 → P1; they are parallel-safe (see
the file-ownership map in `README.md` §2).

| Project | Priority | Status | Owner | Day-1 obligation |
|---|---|---|---|---|
| P3 discovery & opt-in | 1 | **IN PROGRESS 2026-07-23** | Fable session (orchestrator) | publish `library_grant_provenance` signature |
| P2 admin issuance console | 2 | **IN PROGRESS 2026-07-23** | Fable session (subagent) | — (consumes P1 + P3 stubs) |
| P4 cascade generalization + guards | 3 | **IN PROGRESS 2026-07-23** | Fable session (subagent) | — |
| P1 library publish pipeline | 4 | **IN PROGRESS 2026-07-23** | Fable session (subagent) | publish ingest endpoint signature |

**All four decisions are ANSWERED (2026-07-23)** — see the handoff § Decisions and README §2
settled contract rows. Executors implement the settled answers; nothing is behind a flag.

**Every prompt below assumes the agent reads, in order:**
`docs/handoffs/shared-knowledge-access.md` → `docs/proposals/shared-knowledge-projects/README.md`
→ its own brief.

---

## P3 — Discovery & Opt-in (start here)

> You own **P3 — Discovery & Opt-in** for AI Matrx Shared Knowledge Resources. Read, in order: `/Users/armanisadeghi/code/matrx-frontend/docs/handoffs/shared-knowledge-access.md` (Arman's vision, verbatim, plus the open decisions), then `docs/proposals/shared-knowledge-projects/README.md` (verified status + frozen contracts + file-ownership map), then `docs/proposals/shared-knowledge-projects/P3-discovery-and-optin.md` (your brief). Context in one line: orgs that opted into an industry have full read access to its shared libraries, but two hardening passes closed every listing surface to them, so the only way to find entitled content is one unlabeled pane on `/rag` — you are building the discovery surface that was supposed to exist. Publish the `library_grant_provenance` RPC signature first; P2 consumes it. Verify with two accounts (entitled + non-entitled control) in a real browser, not mocks. Follow CLAUDE.md; apply migrations live via Supabase MCP + ledger them; work on main with small commits staging only your files; groom the handoff before you finish.

## P2 — Admin Issuance Console

> You own **P2 — Shared Knowledge Admin Console** for AI Matrx. Read, in order: `/Users/armanisadeghi/code/matrx-frontend/docs/handoffs/shared-knowledge-access.md`, then `docs/proposals/shared-knowledge-projects/README.md`, then `docs/proposals/shared-knowledge-projects/P2-admin-issuance-console.md`. Context in one line: the database can express every kind of knowledge issuance and the UI can express almost none — no organization-audience grant, no industry create/rename (`upsertIndustry` is exported with zero callers), no way to answer "why does this org see this document?" — and Arman has explicitly asked for that admin interface. You also own resolving the two-gate fork on "who may list a store's grants" (README D-C / handoff Decision 2) into ONE rule. Extend the existing hooks and industry service; never fork them, never invent a new admin gate or grant primitive. Live browser verification as admin@admin.com with screenshots, plus a negative test proving the DB refuses a non-super-admin. Follow CLAUDE.md; migrations applied + ledgered; groom the handoff before you finish.

## P4 — Cascade Generalization + Guardrails

> You own **P4 — Cascade Generalization + Guardrails** for AI Matrx Shared Knowledge. Read, in order: `/Users/armanisadeghi/code/matrx-frontend/docs/handoffs/shared-knowledge-access.md`, then `docs/proposals/shared-knowledge-projects/README.md`, then `docs/proposals/shared-knowledge-projects/P4-cascade-generalization-guardrails.md`. Context in one line: the access cascade is prod-proven for PDFs but `source_kind='cld_file'` is hard-coded in every sync trigger, so a library of notes or transcripts conveys nothing — and there is no guard that would catch it, which is how a judge/RLS contradiction on `rag.data_stores` survived undetected until 2026-07-23. Generalize the cascade to every member kind, close the listed defects, and build the acceptance-matrix script plus four drift guards so this failure class goes extinct. Use a NON-admin entitled test user; admin@admin.com is a super_admin and will mask grant-path failures. This is the security spine: adversarially review (two independent refuters) any kernel or RLS change before applying. Register association rules BEFORE writing edges. Migrations applied + ledgered + types regenerated in both repos; groom the handoff before you finish.

## P1 — Library Publish Pipeline

> You own **P1 — Library Publish Pipeline** for AI Matrx Shared Knowledge (aidream-heavy, cross-repo). Read, in order: `/Users/armanisadeghi/code/matrx-frontend/docs/handoffs/shared-knowledge-access.md`, then `docs/proposals/shared-knowledge-projects/README.md`, then `docs/proposals/shared-knowledge-projects/P1-library-publish-pipeline.md`. Context in one line: the only shared-knowledge document in existence was ingested by a one-off script under Arman's personal account — the file still sits in his personal org and all 2,733 chunks are owned by him — and there is no admin surface to add a second document, even though the correct system-owner ingest path already exists and is only reachable from a workflow node. Publish the ingest endpoint signature on day 1 (P2 builds its UI against it), then make publishing a product and repair the AMA data. Coordinate with `docs/handoffs/ama-g5-spine-consolidation.md`, which owns that same document's content quality. Do not add `rag.*`/`docproc.*` triggers — that is P4's this wave; put the ownership rehome in the `add_member` Python path. Migrations applied + ledgered + types regenerated both repos; deploy aidream or flag it explicitly; groom the handoff before you finish.
