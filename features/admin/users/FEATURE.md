# FEATURE.md — Users & Access administration

**Status:** `stable`
**Tier:** `1`
**Last updated:** `2026-08-20`

---

## Purpose

`/administration/users` is the super-admin control plane for accounts and the
access relationships around them. It brings the reciprocal user ↔ organization
views into the same route-tabbed hub as preferences, admin levels, invitations,
entitlements, acquisition, usage, email, and announcements.

The organization surface is a projection over the canonical IAM model. It does
not own or duplicate organization or membership data.

---

## Entry points

- `app/(admin)/administration/users/layout.tsx` — shared tabbed shell; inherits the super-admin gate from the admin layout.
- `app/(admin)/administration/users/page.tsx` — complete account roster, including each user's active organization memberships.
- `app/(admin)/administration/users/organizations/page.tsx` — reciprocal organization/member directory and management surface.
- `app/(admin)/administration/users/acquisition/page.tsx` — visitor → guest → account acquisition cohort, first-touch provenance, AI activity, and stored cost.
- `features/admin/users/components/AccountsTableClient.tsx` — account table and user-focused organization deep links; reads `?user=<id>` to focus one account.
- `features/admin/users/components/AdminUserRef.tsx` — **THE door for a user.** The name links to the account; the chevron menu carries every per-user destination. Used by all 12 surfaces that name a user.
- `features/admin/users/components/OrganizationsAdminClient.tsx` — organization list, member list, user focus, and membership controls.
- `app/api/admin/users/route.ts` — server-only auth roster plus profile, admin-level, and organization projections.
- `app/api/admin/users/organizations/route.ts` — super-admin-only directory and membership mutation endpoint.
- `app/api/admin/users/acquisition/route.ts` — super-admin projection joining auth users, guest-registry provenance, and the canonical usage rollup.
- `app/api/admin/users/acquisition/[rowId]/route.ts` — per-identity owned-observability join over the HTTP ledger, runtime spine, Error Inspector/server incidents, and AI Dream logs.
- `features/admin/users/server/organizationMembershipAdmin.ts` — shared server projection and audited mutation caller.

---

## Data model

- `iam.organizations` is the organization authority.
- `iam.memberships` is the membership authority. Organization memberships use `container_type='organization'`, `container_id=organization_id`, and roles `owner | admin | member`.
- `iam.organization_member` is the active, soft-delete-aware read view used by the admin projection because the base membership table is intentionally not exposed to the Data API.
- `iam.org_admin_audit` records super-admin membership mutations.
- `auth.users` and `users.profiles` supply account identity and display fields.
- `auth.users.is_anonymous` is the guest authority. A UUID-looking label is never used to infer status.
- Supabase Auth `created_at` and `is_anonymous` flow through `mapUserData` into volatile `userAuth`; the Error Inspector derives first-seven-day capture eligibility locally with no query or stored flag.
- `public.guest_executions` owns first-party visitor continuity, first/last execution, conversion, IP/user-agent, and `metadata.acquisition` first touch.
- `public.record_acquisition_first_touch` atomically creates or enriches that row. It preserves the first observed request while linking the browser's guest ID and eventual account ID.
- `chat.admin_user_usage_rollup` supplies stored all-time AI requests, last activity, cost, and — since migration `0433` — `by_origin`, that spend split by the witnessed trust axis `chat.user_request.origin_class` (`human | client_auto | api | child_agent | workflow | scheduled | system | unknown`). The classes are derived server-side from what the platform observed, never from what a caller claims about itself; the vocabulary is defined in aidream `packages/matrx-connect/matrx_connect/context/provenance.py`.
- `features/admin/users/lib/usageOrigins.ts` is the ONE coercion for that `by_origin` payload — the generated RPC type only promises `Json`, and both the usage route and the acquisition route read it through this normalizer so neither surface invents its own shape.
- `lib/usage/originClass.ts` owns the shared short labels and stable per-class colors for every admin usage surface, so a class keeps its color between this table and the cx-dashboard Usage tab. The sentence-form labels in `features/ai-work/conversations/presentation.ts` are deliberately separate: "Started by a person" reads well beside one conversation, not inside an eight-entry legend.

No new table or Redux slice is owned by this feature.

### Acquisition visibility

`/administration/users/acquisition` is the canonical answer to who arrived,
whether the identity is only a visitor, an anonymous guest, a permanent
account, or a converted guest, where the browser was first observed, whether
the user-agent is automated, and what that identity has cost. The timeframe is
a **cohort-created/converted filter**; cost remains all-time stored cost for
each identity so a cohort's full exposure is visible.

Historical landing pages were never retained. Those rows say **Historical — not
collected**. A missing referrer on a captured request says **Direct / browser
withheld** instead. The collector never backfills a guess from an AI surface,
UUID, or latest page.

Proxy issues the first-party `matrx_acquisition_visitor` cookie and queues the
first host, path, sanitized referrer, UTM fields, request headers, IP, and client
classification with `NextFetchEvent.waitUntil`. The database is never on the
visitor's response path. Browser enrichment later adds timezone, language,
screen, and the existing guest ID through the same atomic function. Email,
promoted-guest, and OAuth signup paths link the visitor record to the permanent
account with `after`, even when the visitor never ran AI.

The **Journey** door joins `public.api_request_log` (nearly every AI Dream HTTP
request; health/liveness exclusions are deliberate), `runtime.global_request`
and `runtime.global_execution` (runtime-admitted work, nested status, meters,
and cost), `public.system_error` (AI Dream 5xx plus persisted frontend captures),
and attributed `public.app_log` warnings/errors. It states an engagement verdict,
feature usage, failures, runtime work/cost, and the request-ID chronology. The
Journey door opens the canonical non-blocking `SidePanelSurface`; secondary
telemetry failures appear as source warnings without hiding successfully loaded
history. Localhost and loopback referrers are visibly classified as local/agent
testing, not ordinary acquired traffic. Headline people, account, conversion,
and cost totals exclude local/agent traffic and bots; the table retains both for
diagnosis.

### Deferred observability

**Do not query Vercel or Supabase platform logs from this surface.** They remain
incident-investigation tools, not the acquisition source of truth. A future
project may ingest Vercel function failures and Supabase API/Auth/Postgres gateway
events only after defining retention, user/request correlation, privacy, and
cost. The owned ledgers above remain the canonical everyday view.

---

## Key flows

### User → organizations

1. The account roster loads the full auth roster and canonical organization directory on the server.
2. Each user row shows its organization names and count.
3. The Organizations action opens `/administration/users/organizations?user=<id>`.
4. The organization list narrows to that user's memberships while the selected organization still shows its complete member roster.

### Organization → users

1. The Organizations tab lists every shared, personal, and system organization, including organizations with zero memberships; each row carries the canonical 2–3 letter abbreviation from `iam.organizations`.
2. Selecting an organization shows every active member with role and join date.
3. A member action pivots back to every organization for that user.

### Manage membership

1. The API route verifies `requireSuperAdmin()` for every method.
2. The server calls `public.admin_manage_organization_membership` through the authenticated session so `auth.uid()` remains the acting administrator.
3. The database function validates the action and role, locks the organization's active memberships, protects the last owner, constrains personal-organization repair to restoring the creator or removing legacy extra members, performs canonical add/reactivate, role change, or soft removal, and writes `iam.org_admin_audit`.
4. The client reloads both reciprocal projections after success.

---

## Invariants & gotchas

- Never create an admin-only organization or membership table. Extend the canonical IAM projection.
- The browser never receives a secret key and never writes `iam.memberships` directly.
- Super-admin is verified at both the API boundary and the database mutation boundary.
- Personal organizations are visible but constrained to repair operations: restore the creator as owner or remove legacy extra members. `personal` means one individual's space, not a small shared organization.
- An organization cannot lose or demote its last owner.
- Removal is a soft delete. Re-adding the same user reactivates the canonical membership row.
- Account and organization screens link to the same Organizations tab; do not build separate per-user and per-organization membership managers.
- **A user is named through `AdminUserRef`, never a bare `<span>` or uuid.** There is still no canonical `/users/<id>` route and no `user` token in the entity registry, so `EntityRef` has nothing to resolve — `AdminUserRef` is the stand-in that declares the per-user destination set exactly once. Consume it; do not hand-roll a link list beside it. When a canonical user route exists, one edit there lights up every surface.
- **A door is only added after reading the target route and confirming it consumes the param.** Both `?user=` destinations added on 2026-08-09 were previously broken promises: Accounts read no param at all, and the Accounts row menu advertised an "Admin level" filter that `…/users/admins` silently ignored. A link to a route that ignores its param is worse than no link, because it looks like it worked.
- The name is a real anchor, not a click handler, so middle-click and cmd-click work. Where a user's name genuinely cannot be an anchor (inside a `<label>` or a button that means something else), render `AdminUserDoorControls` as a sibling instead — an anchor nested in interactive content is invalid DOM. All 12 call sites were verified clear on 2026-08-09.
- **Never put `href` on a `MatrxDataTable` column whose cell renders `AdminUserRef`.** A column declaring `href` makes the table wrap the whole cell in a `<Link>` (`MatrxDataTable.tsx`), which would nest the name's anchor inside another anchor. Every current user column renders its own cell and declares no `href`; that is deliberate, not an oversight. Row-click navigation is safe alongside it — the table already ignores clicks originating inside an `<a>`.
- **Guest, visitor, account, and converted are distinct states.** Visitor means a fingerprint observed before an auth identity exists; guest means `auth.users.is_anonymous=true`; converted means a guest-registry lineage now points at a permanent account.
- **First-touch association is not conversion.** Signup and OAuth attach `guest_executions.metadata.acquisition_user_id`; only guest promotion writes `converted_at` / `converted_to_user_id`.
- **Acquisition data is first observed, never reconstructed.** Preserve the first metadata object and show unknown for older rows. A later page is not a landing page.
- **Local/agent and bot traffic stays visible but never inflates headline acquisition totals.** Classify localhost and loopback from either landing host or referrer.

---

## Doctrine compliance

**Searches performed**

- Routes/components: `administration/users`, `OrganizationManagement`, `OrganizationList`, `OrganizationCard`.
- Data/services: `iam.organizations`, `iam.memberships`, `organization_member`, `membershipsService`, `mbr_*`, `org_admin_*`.
- Shared UI: `MatrxDataTable`, `SearchableSelect`, shared confirmation dialog, shadcn dialog/select/badge/button primitives.

**Primitives reused or extended**

- Extended the existing Users & Access tab shell and account roster.
- Reused `MatrxDataTable` for both reciprocal lists and `SearchableSelect` for existing-account lookup.
- Reused the canonical IAM organization/membership rows, active-membership view, soft-delete lifecycle, role vocabulary, and admin audit table.
- Introduced one narrowly scoped database function because existing `mbr_*` operations are organization-access scoped and cannot safely provide a global super-admin control plane.

---

## Change log

- `2026-08-20` — Moved first touch to zero-blocking Proxy capture backed by atomic `record_acquisition_first_touch`, adopted the server visitor ID for new guest AI use, linked email/OAuth accounts without requiring an AI execution, separated historical gaps from direct/withheld referrers, and excluded localhost/agent and bot rows from headline acquisition and cost totals while retaining them for diagnosis.
- `2026-08-19` — Reused the already-fetched Supabase Auth creation timestamp and anonymous flag in Redux so guests and first-seven-day accounts retain all frontend diagnostic tiers without a database boolean, expiry job, or additional query.
- `2026-08-19` — Replaced the blocking Journey sheet with the canonical non-blocking Matrx side panel, stopped row-click propagation, preserved partial journey history when secondary telemetry is unavailable, and marked localhost/loopback referrers as local/agent testing.
- `2026-08-21` — Usage & Cost is now splittable by ORIGIN. `chat.admin_user_usage_rollup` gained an additive `by_origin` jsonb column (aidream migration `0433`), and the table gained an "Origin mix" bar per user, a sortable "Top origin" column, a view-wide origin legend above the table, and the split in the Copy-for-AI payload. Every pre-existing column is untouched — the additive contract was verified by diffing the RPC's output before and after the swap. The same migration added a matching `by_origin` key to `chat.cx_usage_analytics` for the cx-dashboard Usage tab. Note that `unknown` dominates historically: it is the pre-provenance backfill value plus spine requests with no `chat.user_request` twin, reported honestly rather than guessed at.
- `2026-08-19` — Added the per-identity Journey panel: feature usage, owned AI Dream HTTP requests, runtime request/execution and cost, frontend/server errors, server warning/error context, a dropoff verdict, and a chronological forensic trail. External Vercel/Supabase log ingestion is explicitly deferred.
- `2026-08-19` — Added User Acquisition: real guest/account/conversion state, bot/browser classification, created/first/last activity, first-touch page/referrer/UTM context, IP/client details, and canonical all-time stored LLM cost. Reused `guest_executions`, `auth.users`, `AdminUserRef`, and `admin_user_usage_rollup`; no new table.
- `2026-08-13` — The Accounts roster is now agent-READABLE: `AccountsTableClient` mounts a `SurfaceRuntimeProvider` for `matrx-admin/users` and emits 20 surface values through the new builder `features/admin/users/lib/admin-users-scope.ts`. Two behavioural notes for anyone editing this file. **(1) `MatrxDataTable` is now in `controlled-local` mode** — search, column filters, sort and page live in `queryState` here, not inside the table (the table still does the filtering). That is what lets the page report how many accounts match the admin's live query; `visible_user_count` is computed by calling the table's own `filterAndSortRows`, so it cannot drift from what the table renders. Keep it that way rather than counting rows by hand. **(2) `getScope` must stay SYNCHRONOUS** — the Surface Context window polls it every 400ms while open, so a fetching emitter would hammer `/api/admin/users` behind an idle debug panel; every emitted value is a derivation over state this component has already rendered. Privacy posture is deliberate and documented in the manifest header: roster-wide values are counts only, `roster_sample` is capped at 10 and carries **no email addresses**, and only the account focused via `?user=` ships admin-relevant fields. **No agent write targets, by design** — admin level, magic links, password resets, email/DM sending and the onboarding toggle are all permissions / credentials / outbound communication and stay human; the ruling is argued in full in `admin-users.manifest.ts`.
- `2026-08-09` — No Dead Ends sweep: a named user is now reachable. Accounts and `…/users/admins` both honour `?user=<id>`, and `AdminUserRef` makes the name itself a link (Door #1) with "Account" and "Admin level" joining its menu. Closes FOUND_DEFECTS D138's most-hit symptom; a canonical `/users/<id>` route and a `user` registry token remain open.
- `2026-08-08` — Codex: made the shared Users & Access shell a deliberate two-row mobile header with an independently scrollable, touch-safe tab rail; added accessible navigation/back labels so child admin routes no longer inherit the prior title/tab overlap.
- `2026-07-23` — Codex: organization projections and the directory table now include the canonical compact abbreviation alongside name and slug.
- `2026-07-22` — Codex: added the reciprocal user ↔ organization admin directory, inline account membership visibility, guarded membership management, and audited super-admin database mutation path.
