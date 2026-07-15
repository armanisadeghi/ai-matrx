# Education Hub — Per-Class Hub (FEATURE.md)

**Status:** live · **Tier:** 2 (Education Hub tool) · **Spec:** [`W2-class-hub.md`](../../../docs/proposals/education-projects/W2-class-hub.md) · **Vision:** [`VISION-education-hub.md`](../../../app/(core)/education/VISION-education-hub.md) · **Last updated:** 2026-07-14

> 🔴 The binding spec is `W2-class-hub.md`. This file documents only HOW the Per-Class Hub is built. Drift → the spec wins; report it. **This feature invents NO new scope semantics** — read [`features/scopes/FEATURE.md`](../../scopes/FEATURE.md) before touching it.

## Purpose

A course-scoped workspace: one hub per class the student takes ("AP Bio, Period 3, Ms. Rivera", "ECON 201"), gathering that class's decks, quizzes, notes, media, files, and exam dates in one place. Every study artifact becomes class-taggable; the hub aggregates everything tagged to the class.

## The model — scopes-native, ZERO new tables

This is the "massive win" from the spec: a class hub is **not a new data model**. It is composed entirely from primitives that already exist.

| Concept | Built on | Notes |
|---|---|---|
| **A class** | a **scope** (`context.scopes` row) under a per-user **"Class" scope type** (`slug='class'`) in the student's **personal org** | Created on demand via the canonical `create_scope_type` / `create_scope` RPCs (the legacy scope thunks in `features/agent-context/redux/scope`). The scope type is identified by its stable reserved slug, never by label. |
| **Class metadata** (teacher, term, period, **exam dates**) | the scope's **`settings` JSONB** | Parsed/serialized in `settings.ts`. No columns, no table. |
| **Content ↔ class** | a **`platform.associations`** edge `source=(token,id) → target=('scope', classId)` | The exact scope-tag edge. Written by `EntityScopeTagger` / the association picker; read as the class scope's INCOMING edges. |
| **Hub aggregation** | `useContainerLinks({ containerType: 'scope', containerId })` + `useEntityTitles` | The same edge War Room / org-home cards read. Grouped + routed by `data/entityRoutes.ts`. |
| **Access gating** | scope RLS + per-item `useAccess` | A non-owner resolves the class scope to nothing (RLS) → not-found; tagged items they can't access don't resolve. No bespoke gate. |
| **Access mode** (open/closed/paid) | the scope's **`settings.access_mode`** | `open`/`closed`/`paid`. Read/written via `settings.ts` + the `edu_class_set_access` RPC. Missing → `closed` (private personal classes). |
| **Roster** (owner + students) | **`iam.memberships`** on the class scope (`container_type='scope'`) | `role` = `owner`/`member`; `status` = `active`/`pending`/`entitled`. NO new roster table. |

## Membership + access model (Convergence C — the creator/teacher foundation)

> Binding design: [`CONVERGENCE_C_CREATORS.md`](../../../docs/proposals/education-projects/CONVERGENCE_C_CREATORS.md). A class is ALREADY a scope; this layer EXTENDS it with who-can-join + a roster. Scopes-native, reuse-first: the roster is `iam.memberships`, NOT a bespoke table.

**Access mode** (`scope.settings.access_mode`):
- **open** — publicly listed + anyone joins instantly. `context.scopes` RLS lets ANYONE (incl. anon) read an open class scope → landing-page/public listing.
- **closed** — not publicly listed; join by request → owner-approve. A non-member cannot read the class scope (RLS).
- **paid** — join gated by a **class_access grant** a purchase confers. Free/preview content stays open; enrolment does not.

**Roster** = `iam.memberships` (`container_type='scope'`, `container_id=classId`): `role` owner|member, `status` active|pending|entitled. The **class_access grant is an `entitled` membership row** — NOT a `billing.capability` (those are GLOBAL-per-user and can't express a per-class purchase). `edu_class_join` flips `entitled` → `active`.

### The published RPC contract (`edu_class_*` — SECURITY DEFINER, role-gated)

Consumed by the class hub AND the creator landing page. TS wrappers: [`service.ts`](./service.ts). Migration: [`migrations/edu_class_membership_access_model.sql`](../../../migrations/edu_class_membership_access_model.sql).

| RPC | Who | Returns / effect |
|---|---|---|
| `edu_class_state(p_class)` | anon (open) / any | `{access_mode, is_owner, my_role, my_status, member_count, pending_count, …}` — the Join button's truth. Non-member of a non-open class → not-found (no leak). |
| `edu_class_join(p_class)` | authed | open→`joined`; closed→`needs_request`; paid→`needs_purchase` (or `joined` if holding the grant); owner/member→`already_member`. |
| `edu_class_request(p_class)` | authed | closed→`pending` (open/paid delegate to join). |
| `edu_class_approve(p_class, p_user)` | owner | pending→active (`approved`). |
| `edu_class_leave(p_class)` | member | soft-removes own membership (`left`). |
| `edu_class_remove(p_class, p_user)` | owner | removes a member / declines a request (`removed`). |
| `edu_class_roster(p_class)` | owner (all) / member (active) | `[{user_id, email, display_name, role, status, created_at}]`. **`email` is owner-only** — nulled for non-owner callers so peers never see each other's addresses (D56, school-safe); everyone gets non-PII `display_name`. Self-heals the owner membership. |
| `edu_class_grant(p_class, p_user)` | owner | comps the paid grant → `entitled`. |
| `edu_class_purchase(p_class)` | authed | **STUB** — confers the caller the paid grant (`entitled`). Real Stripe Connect payouts PENDING (Arman). |
| `edu_class_set_access(p_class, mode)` | owner | sets `settings.access_mode` + ensures the owner membership row. |
| `edu_my_classes()` | authed | classes the caller joined/requested (cross-org; the owner's org-scoped scope read never surfaces a class in the teacher's org). |

**Teacher tools — assignments + analytics** (`migrations/edu_class_assignments_analytics.sql`):

| RPC | Who | Returns / effect |
|---|---|---|
| `edu_class_assign(p_class, p_token, p_resource, p_due)` | owner | upserts an `assignment`-role association edge (resource → class scope) + due-date metadata. `p_token` ∈ `fc_set`\|`assessment`. |
| `edu_class_unassign(p_class, p_token, p_resource)` | owner | deletes the assignment edge. |
| `edu_class_assignments(p_class)` | owner / active member | `[{token, resource_id, due_date, assigned_at, assigned_by}]`. The **member's** read path (assoc_for_entity is org-gated → an enrolled student in the teacher's org reads NOTHING there; this membership-gated RPC is how they see assigned content). |
| `edu_class_student_progress(p_class, p_user)` | owner (any member) / self | `[{token, resource_id, due_date, status, score_pct, attempts, correct, last_activity}]` — one member's completion of THIS class's assignments, DERIVED from the study spine. `p_user` must be an ACTIVE member (owner can't fish arbitrary users). |
| `edu_class_progress_overview(p_class)` | owner | `{assignments, students:[{user_id, email, name, cells}]}` — the roster × assignment grid + rollup. |

**RLS** (`context.scopes` SELECT, extended additively): `has_org_access` OR `access_mode='open'` OR active membership (via the SECURITY DEFINER `public._edu_is_scope_member` helper — the `authenticated` role has NO base grant on `iam.memberships`, so a direct subquery would 42501). Writes stay RPC-only; the RPC's owner/role check is the boundary, never the client `isOwner`.

## Teacher tools — assignments + class analytics (Convergence C)

> Binding design: [`CONVERGENCE_C_CREATORS.md`](../../../docs/proposals/education-projects/CONVERGENCE_C_CREATORS.md) — the "professional teacher" workflow. Built on the LIVE roster/access model above. Scopes-native + reuse-first: **NO new table.**

**An assignment is a `platform.associations` edge** — `source=(fc_set|assessment) → target=('scope', classId)`, **`role='assignment'`**, `metadata={due_date, assigned_at, assigned_by}`. It reuses the ONE association system; `role='assignment'` distinguishes it from a plain content-tag edge (`role=null`), so `useClassContent` excludes assignment edges (via `ContainerLink.role`, added to the primitive) — an assigned deck never double-lists as generic tagged content. Assignable tokens = `fc_set` (deck) + `assessment` (quiz/practice-test), the study-spine-backed completable resources (`ASSIGNABLE_TOKENS`; kept in sync with the DB `_edu_is_assignable_token` guard).

**Completion + scores are DERIVED from the shared study spine, never stored.** `_edu_resource_progress(token, resource, user)` (internal, definer, not granted) computes `{status: not_started|in_progress|completed, score_pct, attempts, correct, last_activity}` per (resource, user): a **deck** from `study_session`(`source_set_id`)+`study_attempt`; an **assessment** from the latest `assessment_result`. A member records completion the normal way (studyService/`study_record_attempt`) and the teacher reads it back — one canonical write path, no duplicate tracking.

### Privacy — the class-scoped consent boundary (mirrors the guardian gated-read model)

A class **owner** may read a member's study data **ONLY** scoped to THIS class's assignments, and **ONLY** for an **active member** — never the student's wider spine, never a non-member, never for a non-owner caller. **Consent basis:** enrolling in a class = consenting to the teacher seeing your progress on that class's assigned material (and nothing else). Every read RPC re-checks the caller's owner/member role server-side (RLS on the spine is `created_by=auth.uid()`, so these SECURITY DEFINER RPCs are the ONLY cross-user read path — exactly like `guardian_assert_access`). This is **tighter** than the guardian model (a guardian sees the whole spine; a teacher sees only class assignments).

**Why NOT reuse `StudyAnalyticsView` for the teacher's per-student drill-in** (a deliberate divergence, privacy-first): that view needs the student's full `item_mastery`/`attempts`/`sessions`, and deck-scoped mastery isn't derivable (an `fc_card` has no `set_id` — cards↔decks is itself an association graph). Feeding it would require either the whole spine (violates the class-scoped consent) or the card↔set graph (out of scope). So the drill-in shows **class-scoped per-assignment completion** (status/score/attempts/due/last-activity) via the shared `assignmentDisplay` primitives. `StudyAnalyticsView` reuse stays correct where there's no cross-user boundary: the student's OWN `/education/progress` and the guardian dashboard.

**Assignment CONFERS read visibility (closed 2026-07-14).** An active member of a class can READ a resource assigned to it — for as long as BOTH the assignment edge exists AND they are an active member. So a teacher can assign a **private** deck/quiz and enrolled students can open+study it: the title resolves (no more "Untitled …") and the "Study" link deep-links into `/education/flashcards/[id]/study` (deck) or `/education/quizzes/[id]` (quiz). See "Assignment-confers-read visibility" below. The member's own content hub is still empty for a teacher-org class (`assoc_for_entity` is org-gated) — assignments remain the member's real content channel.

### Assignment-confers-read visibility (the RLS reach)

**Migration:** [`migrations/edu_assignment_confers_read.sql`](../../../migrations/edu_assignment_confers_read.sql). **Mechanism = one additive VIEWER-only branch in `iam.has_access`** — NOT a per-table RLS OR, and NOT an `iam.permissions` grant.

Why not a permissions grant to the scope (the "Option A" instinct): `iam.permissions` grants target a **user or an org** — there is no "grant to a scope." Scope membership only confers resource access through the **role-blind** conveyance/reachability core, which would over-convey EVERY scope-tagged item (plain `role=null` tags too), not just assignments, and requires touching shared conveyance machinery. So instead:

- `public._edu_can_read_via_assignment(p_type, p_id)` (SECURITY DEFINER, granted `anon`+`authenticated` — same definer-probe pattern as `_edu_is_scope_member`, because `authenticated` has no base grant on `iam.memberships` and `platform.associations` SELECT is org-gated) returns true iff `(p_type,p_id)` has a `role='assignment'` edge to a class scope the caller is an **ACTIVE** member of. `fc_card` inherits: a card is readable when its parent deck (`fc_card --member--> fc_set`) is assigned (`fc_card` has no `set_id` — the deck link is itself an edge).
- `iam.has_access` gains one branch — `IF p_required='viewer' AND public._edu_can_read_via_assignment(p_type,p_id) THEN RETURN true` — placed after the direct-membership check. **It is the single choke point:** every read path (base-table RLS on `fc_set`/`fc_card`/`fc_detail`/`assessment`/`assessment_item`, the card-membership loader `assoc_members_visible`, the `useEntityTitles` row read) resolves through `has_access`, so ONE branch fixes all of them — OR-ing into each table policy would have missed `assoc_members_visible` and loaded an empty study deck. `assessment_item` is a composition component → `has_access` resolves it to its parent `assessment` before the branch runs; `assessment`/`fc_set` match directly.

Least-privilege + self-revoking: **viewer only** (never editor/admin — the branch is `p_required='viewer'`-gated), **active membership only**, **`role='assignment'` edges only** (a plain content tag confers nothing), **live-evaluated** (no materialized per-member grants) so access vanishes the instant `edu_class_unassign` deletes the edge OR `edu_class_leave`/`edu_class_remove` deactivates the membership — nothing to clean up, nothing to leak. The change to `has_access` is **monotonic** (only ever returns true earlier; never denies a prior access) and **anon-safe** (`auth.uid()` NULL → membership join empty → false).

## Why it reuses, not forks

- **Scope CRUD:** consumes the canonical `createScopeType` / `createScope` / `updateScope` / `deleteScope` / `fetchScopeTypes` / `fetchScopes` thunks + selectors (`selectScopeTypesByOrg`, `selectScopesByType`, `selectScopeBySlugOrId`). No new scope service, no new RPCs.
- **Tagging (Surface B):** `ClassPicker` is a thin wrapper over `EntityScopeTagger` locked to the Class scope type. It writes LOCAL scope tags only — **never** `appContextSlice` (the load-bearing scopes invariant). Making a class the ambient "I'm working on this now" context is the `ActiveScopePicker`'s job, reached through the global scope picker — not this feature.
- **Aggregation + attach:** `useContainerLinks` (read/attach/detach) + `UniversalAssociationPicker` (the hub's "Add content" flow, targeting the class scope as a container).
- **Routing map:** `features/education/data/entityRoutes.ts` is the ONE education token→route/label/icon map; `convert/lineage.ts` was repointed onto it (killed a duplicated `switch`).

## Entry points

- **Routes** (`app/(core)/education/classes/`): `/` (`ClassesHome` — list-first) · `/[classId]` (`ClassHubView` — the course workspace; `classId` = scope id OR slug).
- **Tool registry:** `EDU_TOOLS` entry `classes` (`features/education/data/tools.ts`) → surfaces on the `/education` tool grid.
- **Feature dir** (`features/education/classes/`):
  - `constants.ts` — reserved slug + seed labels + content tokens + settings keys + `ACCESS_MODES` presentation metadata.
  - `types.ts` — `StudyClass` / `ClassSettings` / `ClassExamDate` / `ClassContentItem` + the access model (`AccessMode`, `ClassAccessState`, `ClassRosterMember`, `MyClass`, `ClassJoinResult`).
  - `settings.ts` — pure parse/serialize between `scope.settings` and `ClassSettings` (+ `scopeToClass`, `nextExamDate`, `daysUntil`, `parseAccessMode`).
  - `service.ts` — the ONE typed wrapper over the `edu_class_*` contract (join/request/approve/leave/remove/roster/grant/purchase/set-access/state/my-classes).
  - `hooks/useClasses.ts` — ensure-type + list + create/update/delete (create ensures the owner membership via `edu_class_set_access`).
  - `hooks/useClassContent.ts` — hub aggregation over `useContainerLinks`.
  - `hooks/useClassAccess.ts` — the Join/Request/Enroll state + actions (state + join/request/leave/purchase).
  - `hooks/useClassRoster.ts` — owner roster + approve/remove/grant.
  - `hooks/useMyClasses.ts` — classes the caller joined (cross-org).
  - `hooks/useClassAssignments.ts` — assignment list (titles via `useEntityTitles`) + owner assign/unassign/set-due.
  - `hooks/useClassProgress.ts` — `useClassProgressOverview` (owner grid) + `useMyClassProgress` (a member's own completion).
  - `components/` — `ClassesHome`, `ClassHubView` (owner hub + member view), `ClassFormDialog` (create+edit, incl. access-mode picker), `ClassPicker`, `AddClassContentSheet`, `AccessModeBadge`, `AccessModeField`, `ClassAccessPanel` (join/request/enroll + paid gate), `ClassRosterPanel` (roster management), `ClassAssignmentsPanel` + `AssignResourceSheet` (owner assign/remove + due dates), `ClassProgressPanel` (roster × assignment grid + rollup + per-student drill), `AssignedToYouPanel` (member's assignments + own status), `assignmentDisplay.tsx` (shared status/score/due primitives).
- **Demonstrated propagation surface:** `ClassPicker` mounted in `features/flashcards/components/set-detail/SetDetailView.tsx` (owner-only) — tag a deck to a class from the deck page.

## Product decisions (made per the spec's "make the reasonable choice + flag it" mandate)

These filled genuine open product questions. **Flagged for Arman** — reasonable defaults, easily changed:

1. **Classes live in the student's personal org.** A class is personal. Shared/teacher classes → a shared org later (Convergence C). *(Forward path, not built.)*
2. **Teacher vs student semantics.** The original W2 hub was student-centric; **Convergence C added the creator/teacher layer** — a class now has an access mode + a roster, the owner (creator) manages members. **Assignment distribution + class analytics are BUILT** (see "Teacher tools" below). Manual grading / gradebook overrides remain OUT (later waves — completion/scores are derived from the study spine, not teacher-entered).
3. **A student can delete/leave their own class.** It's their scope: delete removes the container + its tags only — the underlying decks/quizzes/notes/media are never deleted (association removal, not content deletion). Copy in the confirm dialog says so. (Soft `archived` flag in settings also exists for hide-without-delete.)
4. **Roster + access model: BUILT (Convergence C).** Roster = `iam.memberships` on the class scope; access mode (open/closed/paid) in `scope.settings`; the `edu_class_*` RPC family is the join/enroll contract. See "Membership + access model" above.
5. **Paid access grant = an `entitled` membership row, NOT a `billing.capability`.** Billing capabilities are global-per-user metered caps; a class purchase is a per-(user,class) grant they cannot express. The grant lives on the roster table (reuse-first). **Real money movement (Stripe Connect payouts + revenue share) is PENDING (Arman)** — `edu_class_purchase` is a STUB that confers the grant directly so the gate + enrol flow is fully exercisable today.
6. **Classes still live in the creator's personal org.** In production a personal org is single-member, so closed/paid classes are naturally private (only the owner has org access; students read via their active membership). RLS proven: a genuine non-member sees only `open` classes.
5. **Exam dates live in scope settings and deep-link to the planner** (`/education/planner?examBy=…&for=…`). Full automatic planner-read of a class's exam calendar is a **follow-up** (the planner currently takes an exam window as form input).

## Known gaps / follow-ups

- **`EntityScopeTagger` legacy-union cast.** The tagger's `entityType` prop is still typed on the legacy `EntityType` union (no `fc_set`/`assessment`/`study_media`), which is mid-convergence onto `EntityTypeToken`. `ClassPicker` types on the correct `EntityTypeToken` and casts at the single tagger boundary (commented). Runtime is correct (associations FK-validate the token). Widening `EntityScopeTagger` itself is the real fix — deferred (scopes core is owned elsewhere).
- **Planner auto-read of class exam dates** (see decision 5).
- **Class-filtered views inside each tool's list page** (spec IN-scope reach): the tagging + hub read loop is complete; per-tool list filters are the natural next increment.

## Change log

- **2026-07-14** — **Assignment CONFERS read visibility** (`migrations/edu_assignment_confers_read.sql`, applied live + ledgered). Closes the flagged gap: an ACTIVE member of a class can now READ a resource assigned to it (deck/quiz), so a teacher can assign a **private** deck/quiz and enrolled students open+study it. **Mechanism (Option B, chosen over a permissions grant because `iam.permissions` targets a user/org — not a scope — and scope→content conveyance is role-blind + shared-core):** ONE additive VIEWER-only branch in `iam.has_access` gated on `public._edu_can_read_via_assignment(token,id)` (SECURITY DEFINER; `role='assignment'` edge to a scope the caller actively belongs to; `fc_card` inherits via its parent-deck edge). `has_access` is the single choke point every read path funnels through (base-table RLS + `assoc_members_visible` card loader + `useEntityTitles`), so one branch fixes title resolution AND the study-deck card load. Live-evaluated ⇒ self-revoking on unassign / leave / removal; viewer-only; monotonic; anon-safe. FE: `AssignedToYouPanel` "Study" now deep-links via new `studyHref` on the education `entityRoutes` map (`educationEntityStudyHref`) → `/education/flashcards/[id]/study` (deck) or `/education/quizzes/[id]` (quiz); titles resolve for free (the row read is now permitted). Verified live (Supabase MCP, JWT-impersonation): active member reads assigned private deck (deck row + both cards + card edges + title); NEGATIVES denied — non-member and a member of a DIFFERENT class (deck not assigned there) read nothing; unassign → member loses read; leave/removal (membership inactive) → member loses read even with the edge present. `pnpm db-types` regenerated.
- **2026-07-14** — **Convergence C: teacher tools — assignments + class analytics** (`migrations/edu_class_assignments_analytics.sql`, applied live + ledgered). An assignment = a `platform.associations` edge (`role='assignment'`, due-date metadata); NO new table. Completion/scores DERIVED from the study spine (never stored). Five SECURITY DEFINER RPCs — `edu_class_assign`/`_unassign` (owner), `edu_class_assignments` (owner/member — the member's org-gate-bypassing read path), `edu_class_student_progress` (owner-any-member/self, active-member-only), `edu_class_progress_overview` (owner grid+rollup) — each re-checks the caller's role (mirrors `edu_class_roster` + `guardian_assert_access`). Consent basis: enrolment = consenting to the teacher seeing your progress on THIS class's assignments, and nothing else. FE: `service.ts` wrappers + `useClassAssignments`/`useClassProgress` + `ClassAssignmentsPanel`/`AssignResourceSheet`/`ClassProgressPanel`/`AssignedToYouPanel`/`assignmentDisplay`; wired into `ClassHubView` (owner body + member view); `ContainerLink.role` added so `useClassContent` excludes assignment edges. Verified live (JWT-impersonation, Supabase MCP): owner assigns → member sees it → member completes (75%, 3/4) → owner grid + `edu_class_student_progress` show completed+75%; NEGATIVES all denied — member reads owner grid (42501), member assigns (42501), non-member reads assignments/progress/grid (42501), owner reads a non-member's progress (42501 "not an active member"). `pnpm db-types` regenerated.
- **2026-07-14** — **Convergence C: class membership + access model** (`migrations/edu_class_membership_access_model.sql`, applied live + ledgered). access_mode (open/closed/paid) in `scope.settings`; roster on `iam.memberships` (owner/member; active/pending/entitled); the published `edu_class_*` RPC family (join/request/approve/leave/remove/roster/grant/purchase/set-access/state/my-classes — the contract the creator landing page consumes); `context.scopes` SELECT RLS extended additively (open→public read, active member→read, via the `_edu_is_scope_member` SECURITY DEFINER helper); paid gate = `class_access` grant as an `entitled` membership + a purchase STUB (real Stripe Connect PENDING Arman). FE: `service.ts` + `useClassAccess`/`useClassRoster`/`useMyClasses` + `AccessModeBadge`/`AccessModeField`/`ClassAccessPanel`/`ClassRosterPanel`; ClassFormDialog access-mode picker; ClassHubView owner-hub + member-view + roster; ClassesHome access badges + Joined-classes section. Verified live (open→instant join; closed→request→approve; paid→needs_purchase→grant→enrol; RLS non-member sees only open). `pnpm db-types` regenerated.
- **2026-07-14** — Created. W2 Per-Class Hub shipped: scopes-native class model (class=scope, exam dates=scope.settings, content↔class=platform.associations), `/education/classes` + `/education/classes/[classId]`, `ClassPicker` wired into flashcard SetDetailView, `classes` tool + admin-map registration, canonical `data/entityRoutes.ts` (lineage.ts repointed onto it). Zero DDL.
