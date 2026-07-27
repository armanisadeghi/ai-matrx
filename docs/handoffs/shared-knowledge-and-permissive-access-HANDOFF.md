---
status: active
updated: 2026-07-27
repos: [matrx-frontend, aidream, common-docs]
audience: a successor (junior dev + coding agent) with ZERO prior context
supersedes_status_of: docs/handoffs/shared-knowledge-access.md (that file is the terse status log; THIS is the full package)
---

# Handoff — Shared Knowledge Resources + Permissive Access

You are picking up two intertwined threads with no access to the people or conversation that
produced them. This document is self-contained: read it top to bottom and you can continue.

- **Thread 1 — Shared Knowledge Resources:** Matrx curates industry knowledge once and issues
  read access to whole audiences (an industry, an org, everyone).
- **Thread 2 — Permissive Access:** a deliberate, owner-directed swing away from over-restrictive
  security toward "permissive by default for everything that is not personal."

They meet at one place: the **platform access spine** (`platform.associations` →
`platform.reachability` → `iam.has_access_for`). Learn the spine and both threads make sense.

---

## 1. THE VISION (authoritative)

### 1.1 Original vision — Shared Knowledge Resources

Matrx curates **system-owned** industry knowledge **once** (the canonical seed is the *AMA Guides
5th Edition*, a workers-comp reference PDF) and **issues READ to whole audiences** — an industry,
an organization, or everyone — through **one grant primitive** (`rag.data_store_grants`). Key
rules:

- **A grant on a container confers read on *everything inside it*:** source file bytes, OCR/clean
  text, pages, page images, chunks, derivations, extractions. No per-feature exceptions.
- **Access rides the platform spine**, never bespoke security. `platform.associations` (edges) →
  `platform.reachability` (materialized closure) → `iam.has_access_for` (the ONE resolver).
- **Grants issue `viewer` only; curation (write) stays with owner/curator.**
- **The cascade law** (owner's words): *"If I give you access to my war room thread, you get
  instant access to all the stuff inside unless I specifically mark something as not accessible.
  If I give you read access, you get read to everything; if I give you write access, you get write
  to everything."* Whatever level you grant cascades; library grants happen to only ever issue
  viewer.
- **Hierarchy ruling:** the **data store sits above the file** (a file is not the top of the
  tree). The owner accepted this deliberately — do not relitigate.
- **Two things the owner explicitly said were missing:** (a) a **FE admin interface** to manage
  and issue the industry knowledge we have; (b) **easy ways for users/orgs to find and opt into**
  those resources.

**Why:** one canonical curation + one issuance primitive means the library scales to many
industries and audiences without new code each time. The whole point is reuse: curate once, issue
to millions.

### 1.2 Refinements the owner introduced along the way (each called out so none is lost)

1. **Four issuance decisions settled:**
   - *Industry self-join:* **keep self-serve** — any org admin may join their org to any industry
     (that is how an org gains an industry's libraries). Make it *legible*, never lock it down.
   - *Ownership rehome on publish:* when a file is added to a shared library, **move it to the
     Matrx Library org** with a system owner, keeping the contributor recorded as author.
   - *Paid actions:* **reads cascade** (anyone who can view a doc sees its extractions), but
     **anything that spends money (embeddings) stays owner/curator only.**
   - *Grant-list visibility:* originally "super-admin + owner" — **later overridden** (see #2).

2. **Admin gating is too tight (mid-engagement):** *"System admins and super admins are no
   different for this... agents keep making everything super-admin gated, which is a problem
   because then we have to make random admins into super admins."* → every shared-knowledge
   issuance/admin gate lowered to **any admin**, and the entire `/administration` tree lowered
   from super-admin to any-admin.

3. **THE GOVERNING PHILOSOPHY (final, and it generalizes beyond shared knowledge):**
   > *"Our security processes have become so pathetic that it's crushing our system. Users can't
   > do their work — everywhere they go there are four thousand blocks. Back the f*** off anywhere
   > we can, be much more permissive, especially within an organization and when it's not
   > PERSONAL. Massively differentiate PERSONAL from NOT-personal. Tasks, projects, files — most
   > of those are not personal. A chat a user has with an agent potentially IS personal. When a
   > user adds something to an organization/project/task/war room, just push that access down so
   > they don't hit errors inside. Focus on accessibility, not locking people down like this is
   > Fort Knox."*

   **The axis is PERSONAL vs NOT-PERSONAL.** Non-personal content (tasks, projects, files,
   documents, data stores, war rooms) within an org must be **permissive** — container membership
   pushes full access (read **and edit**, at the member's level) down to everything inside.
   Personal content (a user's agent chat) stays private via the `personal`/`private` **visibility
   flag** and conveys only when explicitly shared.

4. **Projects/tasks/war-rooms convey full access to their contents at the member's level** —
   this is the concrete application of #3.

**Why (the through-line):** four years unlaunched, partly from complexity and over-guarding. The
house doctrine (`CLAUDE.md` "THE PRIME RULE") is that over-tightening is itself a defect —
"blocked legitimate users are as serious a bug as intruders." The only thing that genuinely needs
guarding is **personal** data; everything else inside an org is collaborative and should flow.

---

## 2. CURRENT STATE (gap analysis, 2026-07-27)

### 2.1 DONE — complete and verified live

| Area | What | Proof / location |
|---|---|---|
| Access spine + cascade | Grant → reachability → `iam.has_access_for` judge, prod-proven for the AMA PDF tree | spine probe returns `t,f,t,f` for the entitled reader; `pnpm check:access-matrix` = 42/42 GREEN |
| P1 — publish pipeline | Real streamed ingest endpoint `POST /rag/library/stores/{id}/ingest`; ownership rehome in `add_member`; AMA data repaired (file + 2,733 chunks system-owned) | aidream `packages/matrx-rag/matrx_rag/{library,data_stores,ingestion}.py`, `api/routers/rag.py`; DB migration `0235`. **Deployed to prod.** |
| P2 — admin console | `/administration/shared-knowledge` (industries CRUD, publish/revoke all 3 audiences, ingest, access explorer); `/rag/admin` map | `features/admin/shared-knowledge/**`, `app/(admin)/administration/shared-knowledge/` |
| P3 — discovery | `/rag/library-catalog` route, entitlement + provenance chips, org-settings opt-in legibility, entitled empty states | `features/rag/components/library-catalog/**`, `app/(core)/rag/library-catalog/`, `features/industries/components/OrgIndustriesSection.tsx` |
| P4 — cascade + guards | Registry-driven member→edge sync (note/transcript/code_file); baby-table grant reads; spend gates; acceptance matrix + 4 drift guards | `scripts/access-matrix/**`, migrations `library_cascade_generalize_member_kinds.sql` et al. |
| Provenance | `public.library_grant_provenance(_batch)` (caller-scoped) + catalog `entitled_via` columns | `migrations/library_provenance_and_catalog_entitlement.sql` |
| Any-admin gating | Issuance choke point `_library_assert_super_admin` → `_library_assert_admin` (any admin); read RPCs + aidream endpoints; `/administration` layout | `migrations/library_issuance_any_admin_gate.sql`, aidream `api/routers/rag.py`, `app/(admin)/layout.tsx` |
| Industry soft-delete | `industry_set_active` RPC + console Archive/Restore | `migrations/industry_set_active_rpc.sql`, `features/industries/service.ts`, `IndustriesTab.tsx` |
| Project/task/war-room conveyance | `file/data_store/working_document/processed_document → project/task/war_room` convey **editor**; `task→project` transitivity; war-room tiles | `migrations/project_task_warroom_convey_contents.sql` — verified: project editor-member gets editor on an attached file, unattached file denied |
| Version endpoint (D-G) | `GET /health/version` reads Coolify `SOURCE_COMMIT` at runtime | aidream `api/routers/health.py` |
| Security fixes | D89 (members-rich denied grant readers), a cross-user entitlement oracle, a service-role regression | `migrations/data_store_members_rich_grant_reader.sql`, `library_grant_predicate_actor_guard_and_service_role.sql` |

### 2.2 PARTIAL — started, specific remainder

- **Project/task/war-room conveyance is registered but inert until the product writes the edges.**
  The `association_types` **rules** exist (so conveyance is *correct when an edge exists*), but
  **zero `platform.associations` edges** of these kinds exist today, because the product attaches
  files to **folders** (`file.parent_folder_id`), not projects, and no `folder→project` link
  exists. **Remaining:** decide/verify how files & documents actually get attached to a project in
  the product, and make that attach path write a `platform.associations` edge (source=item,
  target=project/task, `role` per the edge). Until then a project member still won't see a file
  "in" the project — because nothing records that it *is* in the project.
- **`/health/version` reports `"unknown"` on prod** until the **next aidream deploy** ships the
  `SOURCE_COMMIT` fix (the code is committed, not yet deployed).
- **Convergence A (full-lifecycle clickthrough on prod):** create industry → ingest a fresh doc
  via admin UI → publish → org opts in → member finds/reads it + sees provenance. Every step is
  individually verified; the **single end-to-end run with a brand-new document and a fresh org**
  has not been executed.
- **Non-file library members (note/transcript) open-path:** proven at the RLS/row level, but no
  real notes/transcript library exists to click-test in a native viewer.

### 2.3 NOT STARTED — vision calls for it, untouched

- **The permissive-access sweep beyond shared-knowledge + project/task.** Philosophy #3 is a
  mandate to audit and relax over-restrictive gates **app-wide** (any non-personal, in-org
  surface). Only shared-knowledge and project/task/war-room conveyance have been addressed. A
  systematic pass over other features' list/read gates has **not** begun.
- **Wave 2 shared-knowledge:** industry marketing/taste pages + SEO, industry→scope-template
  seeding, per-industry tooling, entitlement/billing on premium stores, non-file library content
  UX.

### 2.4 KNOWN ISSUES / RISKS (a successor MUST know these)

- **D92 — 38 pre-existing dead RLS policies** (privilege-gap class) surfaced by the new
  `pnpm check:access-drift` guard. Reproduce the exact list with that guard. In `FOUND_DEFECTS.md`.
- **D93 — `rag.kg_chunks` denies non-entitled users by statement-timeout** (per-row
  `SECURITY DEFINER` predicate over 2,733 rows). Entitled path is fast; the *deny* path is slow.
  Perf, not correctness.
- **D94 — `docproc.page_extraction_jobs.project_id` FK** is a forbidden-pattern tagging FK (not
  used for auth). Fix-on-sight per `CLAUDE.md`, but out of scope so far.
- **Association path does not re-check item visibility; the FK path does.** Harmless **today**
  (files/notes default `internal`; a live probe found **zero** personal items conveying anywhere).
  If you ever want a personal-marked file dropped into a shared project to *also* stay shielded,
  it's a one-line kernel guard (`v_vis >= 'internal'` on the reachability loop in
  `iam.has_access_for_base`). Deliberately **not** done — it's restrictive, unrequested, and there
  is nothing to fix yet.
- **`industry_curator_grant` is now any-admin** → a write-escalation path (curator ⇒ library-doc
  write) is open to *any* admin tier including `developer`. This is per owner directive; every
  call is audit-logged (`public.library_audit_log`).
- **Industries have no hard delete** — only soft-delete via `is_active` (`industry_set_active`).
  Intentional (orgs and grants reference them).

---

## 3. ARCHITECTURE / ORIENTATION

### 3.1 The one mental model

**One database** (Supabase project `txzxabzwovsujtloxrus`). The React client
(`matrx-frontend`) reads/writes it **directly** via `supabase-js` + `SECURITY DEFINER` RPCs. The
Python brain (`aidream`, `https://server.app.matrxserver.com`) does compute/AI/file-bytes only —
**never a DB gateway.** Full doctrine: `/Users/armanisadeghi/code/CLAUDE.md`.

### 3.2 The access spine (learn this first — everything hangs off it)

```
platform.associations        one row = a link (source → target). NOT an access grant by itself.
        │
platform.association_types    the edge VOCABULARY: per (source_type,target_type) it declares
        │                     container_side (which side is the container) + conveys_max
        │                     (viewer|editor — the ceiling access can convey down to).
        ▼
platform.reachability         materialized container→item closure (depth ≤ 8, LEAST-of-chain).
        │                     Recomputed automatically by a trigger whenever association_types or
        │                     associations change. No manual backfill.
        ▼
iam.has_access_for(user,type,id,level)      THE resolver. Wrappers: iam.has_access (auth.uid),
        │                                   iam.has_access_as (service-role). Dispatches to
        ▼                                   iam.has_access_for_base.
iam.has_access_for_base       owner → org-admin(viewer) → visibility → system-org global →
                              explicit iam.permissions → iam.memberships → edu-assignment →
                              REACHABILITY LOOP (container membership conveys to items) →
                              FK-containment walk (parent_id FKs, gated on item visibility>=internal).
```

**Two containment paths, and the key subtlety:**
- **FK-containment** (e.g. `task.project_id`, `conversation.project_id`) — resolver walks these,
  **gated on the item's own `visibility >= internal`.** *This gate IS the personal valve:* a
  `personal`-visibility chat attached to a project does **not** convey. This is why chats are
  already safe.
- **Association/reachability** (e.g. `note→project`, and the new `file→project`) — resolver grants
  based on **container membership** and does **not** re-check the item's visibility. Fine today
  because these item types default to `internal`.

Visibility ladder: `personal < internal < link < public`. Org work defaults `internal`;
chats/DMs default `personal`.

### 3.3 Shared-knowledge specifics

- **Grant primitive:** `rag.data_store_grants`; mutated ONLY via `rag.library_grant_publish` /
  `_revoke` (never a raw insert). Audiences: `industry` | `organization` | `global`.
- **Grant predicate:** `public.user_can_read_data_store_via_grant(user,store)` — the canonical
  audience reader. Never fork a second one.
- **Issuance gate:** `public._library_assert_admin(actor)` — the single choke point (any admin).
- **Catalog:** `rag.fn_list_library_catalog` returns per-caller `entitled_via`
  (`organization|industry|global|null`) + industry label. FE consumes it in
  `features/rag/hooks/useLibraryCatalog.ts`.
- **Provenance:** `public.library_grant_provenance(_batch)` — caller-scoped, powers the "via
  California Workers' Compensation" chips.
- **Live IDs (for probes):** AMA file `e9868104-e276-4cdb-97a4-b948a13eb135` · root processed doc
  `f3cf55a1-19b1-4d2e-a95c-fb7c449f9eb2` · AMA-G5 store `0158e878-1bab-4c91-9597-da4e8951c2a7` ·
  industry `ca-workers-comp` `dfdff5a8-5b5d-40ef-92e3-b335e13c21c8` · Matrx Library org
  `5e44ec19-3965-4b12-91b2-b2bdb2712abc`.
- **Test identities** (use the right one or you prove nothing):
  - Clean entitled reader (NOT admin — the identity that actually proves the grant path):
    `elliesadeghijd@gmail.com` = `77c6af70-a35e-4724-a304-64a0dd789674`.
  - Non-entitled control (must be denied everything): `asadeghi415@students.fairmontschools.com`
    = `929274b1-a889-41ee-8a7f-dbaec7b0ee54`.
  - Developer-tier admin (proves any-admin gates): `arman26@gmail.com`
    = `7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf`. **NOT a valid non-admin control.**
  - Browser super-admin: `admin@admin.com` / `Password1234#`.

### 3.4 Where things live

- **FE shared-knowledge:** `features/rag/**` (hooks, `components/library-catalog`,
  `components/data-stores`, `components/hit-card`, `components/source-inspector`),
  `features/industries/**`, `features/admin/shared-knowledge/**`, `app/(core)/rag/**`,
  `app/(admin)/administration/shared-knowledge/`.
- **FE access/admin:** `app/(admin)/layout.tsx` (the any-admin gate),
  `utils/supabase/userSessionData.ts` (`checkIsUserAdmin` / `checkIsSuperAdmin`).
- **DB migrations (this engagement):** `migrations/library_provenance_and_catalog_entitlement.sql`,
  `library_issuance_any_admin_gate.sql`, `industry_set_active_rpc.sql`,
  `data_store_members_rich_grant_reader.sql`,
  `library_grant_predicate_actor_guard_and_service_role.sql`,
  `project_task_warroom_convey_contents.sql`, and P4's
  `library_cascade_generalize_member_kinds.sql` et al.
- **aidream:** `api/routers/rag.py` (ingest + grants gate), `api/routers/health.py`,
  `packages/matrx-rag/matrx_rag/{library,data_stores,ingestion}.py`, `db/migrations/0235*/0236*`.
- **Cross-repo access doctrine (READ THIS):**
  `/Users/armanisadeghi/code/common-docs/systems/access-architecture/FEATURE.md`.
- **Verification:** `scripts/access-matrix/` (`pnpm check:access-matrix`, `pnpm check:access-drift`).
- **Terse status log + open-decision history:** `docs/handoffs/shared-knowledge-access.md`.

---

## 4. NEXT STEPS (prioritized — start at the top)

1. **Make project/task file attachment write an association edge** (closes the biggest PARTIAL).
   Find the product path that "adds a file/document to a project" (or decide it should exist),
   and have it write `platform.associations (source_type='file', source_id=…,
   target_type='project', target_id=…)`. The conveyance rule already exists, so the moment the
   edge lands, a project member gets editor on the file. Verify with the synthetic pattern in §5.
   Repeat for `data_store` / `working_document` / `processed_document` and for `task` / `war_room`.
2. **Redeploy aidream** so `/health/version` reports the real SHA (currently `"unknown"`), and to
   confirm the ingest/gate code is the newest. aidream auto-deploys on push to `main` (Coolify);
   confirm via `GET https://server.app.matrxserver.com/health/version`.
3. **Run Convergence A once, end-to-end, on prod** with a fresh small PDF and a fresh org. This is
   the acceptance test for the whole shared-knowledge feature.
4. **Begin the permissive-access sweep** (Vision #3). Audit over-restrictive gates on non-personal,
   in-org surfaces feature by feature. Use `pnpm check:access-drift` and the access matrix as your
   safety net. The pattern is: identify the block → confirm it's non-personal + in-org → widen via
   the spine (membership/conveyance/visibility), never a new bespoke gate.
5. **Triage D92/D93/D94** (see §2.4). D92 (38 dead policies) is the highest-signal cleanup.
6. **Wave 2** shared-knowledge items only after Convergence A is green.

---

## 5. GOTCHAS & CONTEXT (landmines)

- **The DB is the source of truth, not the `.sql` files.** A migration does nothing until applied
  to Supabase (project `txzxabzwovsujtloxrus`) via the Supabase MCP, ledgered in
  `public._schema_migrations` (**`duration_ms` is NOT NULL — pass `0`**), and types regenerated
  (`pnpm db-types` / aidream `python db/generate.py`). "I wrote the migration" = not started.
- **After ANY access change, run the spine probe and expect `t,f,t,f`:**
  ```sql
  select iam.has_access_as('77c6af70-a35e-4724-a304-64a0dd789674','file','e9868104-e276-4cdb-97a4-b948a13eb135','viewer'),
         iam.has_access_as('77c6af70-a35e-4724-a304-64a0dd789674','file','e9868104-e276-4cdb-97a4-b948a13eb135','editor'),
         public.can_read_processed_document('f3cf55a1-19b1-4d2e-a95c-fb7c449f9eb2','77c6af70-a35e-4724-a304-64a0dd789674'),
         public.can_curate_library_document('f3cf55a1-19b1-4d2e-a95c-fb7c449f9eb2','77c6af70-a35e-4724-a304-64a0dd789674');
  ```
  Then `pnpm check:access-matrix` (expect 42/42). If either changes, you broke something.
- **Prove access changes with a rolled-back synthetic transaction**, not by reasoning. Pattern
  that proved the conveyance: `BEGIN; insert membership; insert association; select
  iam.has_access_for(user,type,id,'editor'); ROLLBACK;`.
- **Never hand-roll an owner/permission ladder.** Everything rides `iam.has_access_for`. New
  SECURITY DEFINER RPCs use `COALESCE(auth.uid(), p_actor)` (session identity wins) and revoke
  anon EXECUTE — this closed a real privilege-escalation (D-I). Copy that shape.
- **`personal`/`private` visibility is the ONLY personal protection you need to preserve.** Do not
  add conveyance for `conversation`/chat into containers — chats stay personal by design.
- **`is_admin()` vs `is_super_admin()`:** shared-knowledge and `/administration` now use **any
  admin** (`is_admin` / `checkIsUserAdmin` / `ctx.is_admin`). Only genuinely protected resources
  (the `admins` table itself, etc.) keep the super-admin bar, and those are DB-gated. Do not
  re-tighten to super-admin out of habit — that habit is exactly what the owner told us to stop.
- **Supabase MCP quirk:** an `execute_sql` with multiple statements returns **only the last**
  result set. Put every value you want to see in ONE `SELECT`.
- **Two Supabase MCP registrations exist** (`mcp__supabase__*` and a UUID-named one). If one
  disconnects/needs re-auth, the other still works.
- **Don't sweep other people's uncommitted work into your commits.** This repo often has parallel
  sessions' dirty files; always `git add <specific paths>`, never `git add -A`. Commit small.
- **Registering an `association_types` rule is forward-looking** — it conveys nothing until real
  `platform.associations` edges of that kind exist. That is the crux of the #1 next step.
- **Ownership column reality:** `files.files` uses `created_by`, not `owner_id`. `rag.kg_chunks`
  uses `owner_id`. Check the actual column before writing a query.

---

*Companion docs: `docs/handoffs/shared-knowledge-access.md` (status log + decision history) ·
`docs/proposals/shared-knowledge-projects/README.md` (P1–P4 contracts) ·
`common-docs/systems/access-architecture/FEATURE.md` (the spine, canonical).*
