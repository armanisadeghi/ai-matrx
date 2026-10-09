# Education Hub — Per-Class Hub (FEATURE.md)

**Status:** live · **Tier:** 2 (Education Hub tool) · **Spec:** [`STATE.md`](../../../../common-docs/systems/education/STATE.md) · **Vision:** [`VISION-education-hub.md`](../../../app/(core)/education/VISION-education-hub.md) · **Last updated:** 2026-07-14

> 🔴 The binding spec is `W2-class-hub.md`. This file documents only HOW the Per-Class Hub is built. Drift → the spec wins; report it. **This feature invents NO new scope semantics** — read [`features/scopes/FEATURE.md`](../../scopes/FEATURE.md) before touching it.

## Purpose

A course-scoped workspace: one hub per class the student takes ("AP Bio, Period 3, Ms. Rivera", "ECON 201"), gathering that class's decks, quizzes, notes, media, files, and exam dates in one place. Every study artifact becomes class-taggable; the hub aggregates everything tagged to the class.

## The model — scopes-native, ZERO new tables

This is the "massive win" from the spec: a class hub is **not a new data model**. It is composed entirely from primitives that already exist.

| Concept | Built on | Notes |
|---|---|---|
| **A class** | a **scope** (`context.scopes` row) under a per-user **"Class" scope type** (`slug='class'`) in an organization, like any other record (see "Where a class lives" below) | Created on demand via the canonical `create_scope_type` / `create_scope` RPCs (the legacy scope thunks in `features/agent-context/redux/scope`). The scope type is identified by its stable reserved slug, never by label. |
| **Class metadata** (teacher, term, period, **exam dates**) | the scope's **`settings` JSONB** | Parsed/serialized in `settings.ts`. No columns, no table. |
| **Content ↔ class** | a **`platform.associations`** edge `source=(token,id) → target=('scope', classId)` | The exact scope-tag edge. Written by `EntityScopeTagger` / the association picker; read as the class scope's INCOMING edges. |
| **Hub aggregation** | `useContainerLinks({ containerType: 'scope', containerId })` + `useEntityTitles` | The same edge War Room / org-home cards read. Grouped + routed by `data/entityRoutes.ts`. |
| **A part of a class** (unit, lesson, section) | a **scope** under the per-org **"Unit" scope type** (`slug='class-part'`, label renameable) + a `scope → scope` edge **role `part_of`** (part → class) | Data Doctrine R7: a tree is a self-relation, never `parent_scope_id` (dead, 0 rows). Registry rows `scope→scope` + its record-store twin `scope→record`, both `container_side='target'` since 2026-10-05 (whoever can see the class sees its units and what is filed in them; editing stays with whoever can edit the class). `classParts.ts` + `hooks/useClassParts.ts`. |
| **Content ↔ part** | a plain `content → part scope` edge, written BESIDE the `content → class` edge | So the class view always lists everything; a part is a filter (`?unit=<id>`). Removing from a part archives only that edge; removing from the class archives the class edge and every part edge for it (`assoc_remove` tombstones — archive, never destroy). |
| **A test of a class** (quiz, midterm, final) | a **scope** under the per-org **"Test" scope type** (`slug='class-test'`, label renameable) + a `scope → scope` edge **role `part_of`** to the class carrying `metadata {kind:"test", date}` (so a test is never mistaken for a unit, in the owner's org or a member's) + `covers` edges (role `covers`) test → each covered unit. An optional date also lands in the planner as an `education.study_goal` (metadata `{testId, classId}`). | `classTests.ts` (pure rules) + `hooks/useClassTests.ts` (writes) + `hooks/useClassTestMaterial.ts` (the test's combined, deduped material). `classPartIds` skips test edges; `classContentLinks` still drops every `scope` edge, so units and tests are never content. No registry change: `scope→scope` accepts any role. |
| **Access gating** | scope RLS + per-item `useAccess` | A non-owner resolves the class scope to nothing (RLS) → not-found; tagged items they can't access don't resolve. No bespoke gate. |
| **Access mode** (open/closed/paid) | the scope's **`settings.access_mode`** | `open`/`closed`/`paid`. Read/written via `settings.ts` + the `edu_class_set_access` RPC. Missing → `closed` (private personal classes). |
| **Roster** (owner + students) | **`iam.memberships`** on the class scope (`container_type='scope'`) | `role` = `owner`/`member`; `status` = `active`/`pending`/`entitled`. NO new roster table. |

## Membership + access model (Convergence C — the creator/teacher foundation)

> Binding design: [`STATE.md` §2.4 — the creator north star](../../../../common-docs/systems/education/STATE.md). A class is ALREADY a scope; this layer EXTENDS it with who-can-join + a roster. Scopes-native, reuse-first: the roster is `iam.memberships`, NOT a bespoke table.

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
| `edu_class_confer_purchase(p_class, p_user)` | **service_role ONLY** | The REAL paid gate. Confers a full `active` enrolment after a Stripe payment. EXECUTE revoked from anon+authenticated — the Stripe webhook (admin client) is the ONLY caller. A client can NEVER self-grant paid access. |
| `edu_class_revoke_purchase(p_class, p_user)` | **service_role ONLY** | Refund/chargeback → soft-removes the buyer's membership (access vanishes). |
| `edu_class_set_access(p_class, mode)` | owner | sets `settings.access_mode` + ensures the owner membership row. |

> **Paid enrolment is NOT an RPC the client calls.** It goes through **Stripe Checkout** (`POST /api/stripe/class-checkout` → a Connect **destination charge**); `checkout.session.completed` (webhook) confers the enrolment via `edu_class_confer_purchase`. The old client-callable `edu_class_purchase` STUB is **deleted** (the security review flagged it as bypassable). Price is `scope.settings.price_cents`, read authoritatively server-side. See `features/entitlements/FEATURE.md` §Creator payouts.
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

> Binding design: [`STATE.md` §2.4 — the creator north star](../../../../common-docs/systems/education/STATE.md) — the "professional teacher" workflow. Built on the LIVE roster/access model above. Scopes-native + reuse-first: **NO new table.**

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

## Invites + join codes (WP6 — "a teacher gets students in under a minute")

> Program home: `/Users/armanisadeghi/code/common-docs/systems/education/` (WP6). Built 2026-08-18. Three lanes, ALL on canonical primitives — no new table, no second invitation system.

| Lane | Mechanism |
|---|---|
| **Join code / link** | `scope.settings.join_code` (6 chars, game_room alphabet). Owner lifecycle via `edu_class_join_code(p_class, 'get'\|'rotate'\|'disable')`; student preview via `edu_class_by_code(p_code)`; join via `edu_class_join_by_code(p_code)`. **A code admits open AND closed classes directly** (distributing it IS the teacher's approval — Google Classroom semantics); **it never bypasses payment** (paid → `needs_purchase` unless already `entitled`). Rotate/disable kill the old code instantly. Join page: `/education/classes/join?code=…` (`JoinClassView`). |
| **Email invite** | The canonical `iam.invitations` system (`inv_*` RPCs via `features/organizations/service/invitationsService` — the sole chokepoint). `migrations/edu_class_invites_and_join_codes.sql` extended the core ADDITIVELY for `target_type='scope'`: `iam._container_authz` gained a scope branch (manager = scope creator or org admin), `inv_create` accepts scope targets (**member role only**), `inv_get_by_token` resolves the class name. `inv_accept` already writes the exact `iam.memberships` row the roster reads — **an accepted invite is an ACTIVE membership regardless of access mode** (the owner's invite is itself the approval; for paid classes it is a deliberate comp, since only the owner/org-admin can mint invites). Accept page: `/invitations/class/accept/[token]` (bounces anon through auth via `loginHref` — survives signup; token matches on the invited email). Email via Resend: `/api/education/class-invite` (org-invite twin; `inv_get_managed` proves manager access; `emailTemplates.classInvitation`). Email failure never fails the invite row. |
| **CSV / roster import** | Same sheet: paste or upload ANY roster export (CSV/TSV/text) — `extractEmails` pulls every address regardless of format; teacher reviews the parsed list, then each address becomes one canonical invitation. |

FE: `InviteStudentsSheet` (mounted in `ClassRosterPanel`, owner-only "Invite students" button + empty-state CTA) · `useClassInvites` (code lifecycle + invite list/send/revoke/resend + `extractEmails`) · service wrappers `getJoinCode`/`rotateJoinCode`/`disableJoinCode`/`getClassByCode`/`joinClassByCode`/`classJoinUrl`/`classInviteAcceptUrl`/`sendClassInviteEmail`.

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

2. **Teacher vs student semantics.** The original W2 hub was student-centric; **Convergence C added the creator/teacher layer** — a class now has an access mode + a roster, the owner (creator) manages members. **Assignment distribution + class analytics are BUILT** (see "Teacher tools" below). Manual grading / gradebook overrides remain OUT (later waves — completion/scores are derived from the study spine, not teacher-entered).
3. **A student can delete/leave their own class.** It's their scope: delete removes the container + its tags only — the underlying decks/quizzes/notes/media are never deleted (association removal, not content deletion). Copy in the confirm dialog says so. (Soft `archived` flag in settings also exists for hide-without-delete.)
4. **Roster + access model: BUILT (Convergence C).** Roster = `iam.memberships` on the class scope; access mode (open/closed/paid) in `scope.settings`; the `edu_class_*` RPC family is the join/enroll contract. See "Membership + access model" above.
5. **Paid access grant = an `active` membership row conferred by the WEBHOOK, NOT a `billing.capability`.** Billing capabilities are global-per-user metered caps; a class purchase is a per-(user,class) grant they cannot express. The grant lives on the roster (reuse-first). **Real money movement is LIVE (Stripe Connect Express):** a student buys via Stripe Checkout (destination charge, 20% platform fee / 80% creator), and `checkout.session.completed` confers the enrolment through the service_role-only `edu_class_confer_purchase`. Paying IS enrolling (conferred `active`, not the intermediate `entitled` the owner-comp path uses). The old client-callable purchase stub is deleted. Price is set in the class form and stored in `scope.settings.price_cents`. Blocked only on Arman enabling Connect on the Stripe account (see `features/entitlements/FEATURE.md`).
6. **Where a class lives.** In an organization, like any other record. Under the access-ladder law (`common-docs/policies/access-ladder.md`) organizations are equal and anyone may be invited into any organization, so a class's privacy never comes from its organization: closed/paid classes are protected by the class's own access mode and roster (RLS proven: a genuine non-member sees only `open` classes).
5. **Exam dates live in scope settings and deep-link to the planner** (`/education/planner?examBy=…&for=…`). Full automatic planner-read of a class's exam calendar is a **follow-up** (the planner currently takes an exam window as form input).

## Known gaps / follow-ups

- **`EntityScopeTagger` legacy-union cast.** The tagger's `entityType` prop is still typed on the legacy `EntityType` union (no `fc_set`/`assessment`/`study_media`), which is mid-convergence onto `EntityTypeToken`. `ClassPicker` types on the correct `EntityTypeToken` and casts at the single tagger boundary (commented). Runtime is correct (associations FK-validate the token). Widening `EntityScopeTagger` itself is the real fix — deferred (scopes core is owned elsewhere).
- **Planner auto-read of class exam dates** (see decision 5).
- **Class-filtered views inside each tool's list page** (spec IN-scope reach): the tagging + hub read loop is complete; per-tool list filters are the natural next increment.

## Change log

- **2026-10-05 (members see units)** — Arman "units yes": anyone who can see a class sees its units
  and what is filed in them; editing stays with whoever can edit the class. `MemberClassView` shows
  the unit chips + `?unit=` filter read-only (`ClassPartChips`, `useSelectedClassPart` and
  `groupsInPart` shared with the owner hub). Live DB: `scope→scope`/`scope→record` rules
  `container_side='target'` + reachability refreshed for existing `part_of` edges;
  `assoc_for_entity`/`assoc_for_targets` let an active class member read the class's and its units'
  edges (`public._edu_scope_member_reads_edges`); record-store scopes resolve their organization in
  `private.association_container_organization_id`, `platform.entity_organization_id`,
  `public._library_entity_owner` (Add content had failed for every new class with "access-conveying
  container has no organization"). Test: `__tests__/classParts.test.ts` (unit filter).

- **2026-10-02 (keep adding + parts of a class)** — After a class exists the owner keeps adding to it
  and files things into its parts. `ClassStudyContent` replaces the hub's inline "Study content":
  **Add sources** (`AddClassSourcesDialog` — THE Source input, Use existing + Add new, no `attachTo`; filed on Add, see 2026-10-03)
  files every picked Source under the class (and the selected unit) through `content.attach` /
  `associationsService`; **Add content** (the association picker) does the same for decks, quizzes,
  notes, media; a row of unit chips (All · Unit 1 · … · + Unit, rename/remove in the selected
  unit's menu; `?unit=<id>` so each unit has a link); every row has a units menu (file into / out
  of parts) and a remove button (archive). `useClassContent` now lists EVERY incoming token (a web
  page or transcript added as a source used to vanish — only five education tokens were read) and
  never shows a registry edge label ("about") as a title (`titleHintFromEdgeLabel`). DB: two
  `platform.association_types` rows (`scope→scope`, `scope→record`), proven on the clone then
  applied live 2026-10-02; `@ai-matrx/associations` 0.13.137 carries them. Test:
  `__tests__/classParts.test.ts` (13). Verified on the clone preview as admin@admin.com, 1440 and
  375: two units created, a paste + web page + transcript + file added into Unit 1, a deck into
  Unit 2 via Add content, filed across units, taken out of a unit, removed from the class, renamed.
  (Members now see units: 2026-10-05 entry.)
- **2026-10-03 (Add sources files through the server door again)** — aidream `5d3458e7da` made
  scope endpoints resolve through the record store (the engine refused every scope after
  `b9cf9424d7`). "Add sources" files each picked Source (`processed_document`) through
  `POST /sources/{id}/keep` with the class and the selected part as `attach_to` — both edges in one
  server write (`sourceFilingTargets` in `classParts.ts`); a picked non-Source record (note, file,
  transcript row) is filed through the association door like "Add content".

- **2026-09-28 (cross-org assignment: card-membership edges now honor the assignment grant)** —
  Fixed the narrow gap flagged in the entry just below ("a deck attached from a DIFFERENT
  organization... showed 'No cards to study' for the student"). Root cause was NOT the student's
  active organization (that entry's own diagnosis was wrong — corrected here): the study session
  reads cards through the card-MEMBERSHIP EDGES (`platform.associations_live`, `fc_card`→`fc_set`,
  `role='member'`) via `public.assoc_members_visible`, and DD-205 (2026-09-14) requires
  `iam.org_readable(a.organization_id, ...)` on the edge itself in addition to both ends being
  independently readable. `_edu_can_read_via_assignment` already made the `fc_set` and every
  `fc_card` readable to an active class member regardless of organization (proven live: `fc_set`
  1/1, `fc_card` 4/4, `fc_detail` 2/2, rolled-back JWT impersonation) — but the edge's own org
  tenancy check still required org MEMBERSHIP, so `assoc_members_visible` returned 0 edges and
  `getSetWithCards` returned `cards: []`, regardless of which organization the student had active.
  This is exactly the access-ladder violation the law forbids ("access NEVER depends on the active
  org"; "locking people out is a bug", `common-docs/policies/access-ladder.md`). Fix
  (`migrations/edu_assignment_confers_read_association_edges.sql`, applied live + ledgered):
  `assoc_members_visible` now admits an edge when `iam.org_readable(...)` OR the edge's target is
  covered by an active assignment grant (`public._edu_can_read_via_assignment`) — additive, narrow
  (a plain org member with no assignment is unaffected; DD-195's per-edge `assoc_side_readable`
  check on the revealed row is untouched). Also checked: quizzes/practice tests never route through
  association edges for item reads (`assessment_item` is read directly by `assessment_id`, gated by
  `iam.accessible_entity_ids` → `has_access_for_base` → the same `_edu_can_read_via_assignment`
  branch), so they never had this class of bug. **Verified live end to end**, two real accounts,
  disposable "Agent Test Cross-Org Class" (open) in admin's Workspace: a deck and a quiz owned by
  Meridian Payroll (an organization test@test.com does not belong to) were assigned to the class;
  test@test.com (active org: Alex Hart's Workspace — neither the class's nor the deck's org) joined
  by code, studied the deck (cards loaded and graded, no "No cards to study"), and took the quiz
  (2/2 answered, both graded correct). Teacher's Class progress grid showed 100% completion on both
  assignments. Cleanup: membership removed (`edu_class_remove`), class archived
  (`settings.archived=true`).
- **2026-09-28 (teacher↔student journey adversarial test)** — Full two-account journey run live
  (admin@admin.com teacher, test@test.com student, two isolated browser sessions): create class
  (open) → attach deck → assign with due date → invite via join code → student joins → studies →
  teacher sees roster + completion → student leaves → teacher sees them gone; closed access
  (request → approve) also run end to end. Found and fixed a real permission-gating defect in
  `ClassHubView.tsx`: `if (cls)` treated ANY class visible in `useClasses()`'s org-wide Class-type
  scope list as proof of ownership and rendered the full owner hub (Edit/Archive/Invite/Assign/Add
  content/Class progress) for it — but `useClasses()` returns every "Class" scope readable in the
  active organization, not just the caller's own, so a co-member of the SAME organization (a
  student who happens to share an org with the teacher, e.g. by picking that org to study under)
  got the owner's full management controls on a class they don't own, and simultaneously lost their
  own `ClassAccessPanel`/"Leave" control entirely (fell into the owner branch, which has none).
  Fixed by gating on `access.state?.isOwner` (the `edu_class_state` RPC's own answer) in addition to
  `cls`'s presence; a non-owner now correctly falls through to `MemberClassView`. Verified live:
  before the fix the student's class page showed `Assign`/`Add content` buttons and an erroring
  "Class progress" panel with no way to leave; after the fix (server picked it up on save, no
  restart needed) the same URL renders the proper member view (roster read-only, "Assigned to you",
  Leave). Also hit and worked around (not a `ClassHubView` bug): a deck attached from a DIFFERENT
  organization than the class's own org showed "No cards to study" for the student — the
  assignment-confers-read branch makes the SET readable, but the student's active study org must
  match the deck's owning org for the study session to load the cards; noted as a narrow gap, not
  fixed (normal usage — teacher assigns their own org's content — is unaffected).
- **wave 4b adversarial proof, 2026-09-28** — Both agent surfaces on `agent-test-chemistry` proven
  live on production with real agent runs: a read ("What is assigned in this class and what study
  content is attached?" → correctly named "AP Chemistry Nomenclature: the Absolute Core" and
  `old-handbook.epub`) and a full write round-trip through `update_class` — renamed the class
  description to "Agent-probed description" (approved on screen, confirmed live in
  `context.scopes.description` via SQL), then a second agent run cleared it back, confirmed live
  again. `new_class_draft` (My Classes' write target for the New class dialog) was flagged by
  `check:surface-write-handlers` as unhandled; it is real and registered — the handler lives in
  `ClassFormDialog.tsx`, which receives `agentSurfaceName` as a JSX prop from `ClassesHome`, and
  the AST resolver can't trace a prop across the component boundary. Annotated with the documented
  `surface-write-handlers-surface` escape hatch instead of leaving a false finding
  (`features/education/classes/components/ClassFormDialog.tsx`).
- **2026-09-27 (agent surface)** — `/education/classes/[classId]` is now its own agent surface, `matrx-user/education-class` (label "Class Hub"; manifest `features/surfaces/manifests/education-class.manifest.ts`, scope `classHubSurfaceScope.ts`). Before, the route fell through to the generic `/education` hub surface and an agent there could not see the class. `view` (owner / member / loading / needs_workspace / unavailable) decides which values are present; owner view carries details, exam dates, roster, assignments, class progress and study content; member view carries the active roster, `my_assignments` and study content. Five owner-only write targets through the page's own hooks, validated before the approval card by `classHubAgentWrites.ts` (tested): `update_class` (reuses My Classes' `parseUpdateClassesValue`), `attach_content`/`detach_content` (`useClassContent`), `assign_resources`/`unassign_resources` (`useClassAssignments`). Roster, progress-grid and assigned-to-you reads moved up into the hub (panels take them as optional props) so the panels and the scope read the same rows once; the progress grid re-reads when the assignment count changes (replaces the remount-by-key). `/education/classes/join` stays on the education hub surface.

- **2026-09-27 (wave-3 page pass)** — `/education/classes`, `/education/classes/[classId]` (owner + member views), `/education/classes/join` — type: list / single-record / small action. Fixed real defects found live/in code: (1) **the class hub's "Delete class" hard-deleted** (via `delete_scope`, no restore surface anywhere) — the platform rule is archive-and-restorable from a page a person is looking at, and the surface manifest's own doc already steered AGENT writes to `update_classes {archived:true}` for exactly this reason while the PERSON's own trash-icon button still called the hard path; now it archives (`settings.archived=true`) via the same `updateClass` write, relabeled "Archive class" with an `Archive` icon. (2) **archived classes were invisible with no restore path** — `useClasses().archived` was already computed but never rendered; `ClassesHome` now shows them in an `ArchivedDisclosure` (the canonical archived-items-law control) with a one-click Restore. (3) **four content-navigation controls were `<button onClick={() => router.push(...)}>` instead of real links** (`ClassHubView`'s `ContentGroups`, `AssignedToYouPanel`'s Study/Review, `ClassAssignmentsPanel`'s open-resource icon) — no cmd/middle-click, no new tab, no crawl; now real `<Link>`s. (4) **the class hub ([classId], both owner and member views) and the join page had no page-header identity at all** — no `EducationToolHeader`, so the shell header never named the class (or "Join a class") the way every other education record page does (`KitHub` precedent) — added, including to every load/gate branch so the header never blanks between them. (5) Join page repeated its title in the header AND a body `<h1>` — removed the body `<h1>` (core rule: the title stands alone). (6) None of the three routes' interactive roots carried `matrx-touch-targets` (the sibling flashcards/study-guides pages already page-passed do) — added to each route's content root. Verified live where the shared preview server allowed it; see the task report for exactly what render layer this covers.
  - **Left open (bigger than one page pass):** the class hub ([classId]) has NO registered agent surface at all (no manifest, no context menu, no declared values/write targets) — an agent on that page cannot see the roster, assignments, exam dates, or content, or edit/archive the class it's looking at, even though the list page (`matrx-user/education-classes`) has a mature ~900-line one. Building it to the same standard is its own scoped task, not a page-polish addition — flagged for a dedicated follow-up.
- **2026-09-27 (wave-2 adversarial retest)** — "Copy join link" (and Copy join code / Copy invite
  link) in `InviteStudentsSheet` dead-ended on a bare `toast.error("Could not copy the join link.")`
  when `navigator.clipboard.writeText` throws (blocked permission, non-HTTPS iframe, older browser) —
  banned per the platform's own clipboard-failure contract. Now opens the shared
  `ClipboardFallbackDialog` (a selectable field with the value, pre-selected, plus a retry Copy
  button) instead of just failing silently past the toast.
- **2026-09-27** — Wave-2 phone pass: verified the class hub, its three docked `MatrxDynamicPanelHost` panels (Add content / Assign / Invite students), and the "Add files" window on a 390×844 phone (Playwright, real data on `agent-test-chemistry`) — all full-width, scroll clean, search inputs stay 16px (no iOS zoom), close reachable. Fixed one real phone bug found in the pass: `AccessModeBadge` (the class hub header's Open/Closed/Paid pill) had no `shrink-0`/`whitespace-nowrap`, so on a narrow header its flex sibling shrank it and "Closed" wrapped mid-word ("Clos ed"); now pinned to its content width on every caller (hub header, `ClassesHome` rows, `ClassAccessPanel`).
- **2026-09-27** — `create_/update_/delete_classes` and `new_class_draft` refusals now list EVERY problem at once, numbered (bad fields first, then repeats, existing names, unknown ids), through `collectProblems` in `../aidream/apps/shared/chat/src/surfaces/runtime/collection-write-targets.ts` (Arman ruling 2026-09-27).
- **2026-08-22** — **Assignment loop proven live with real accounts — and three blockers found + fixed on the way.** Teacher (test@test.com) assigned `biology-cells` to Biology 101; student (admin@admin.com) saw it under "Assigned to you", studied 2 cards; teacher's progress grid showed `in_progress · 2/2 · 100%` (first assignment edge ever in the live DB). Fixed: (1) **every class-hub write was refused** — `platform.association_types` registry guard (landed after the hub shipped) had no `fc_set|assessment|study_media → scope` rows → `edu_class_assign` / "Add content" / `ClassPicker` all failed "Unknown association type" (`migrations/edu_class_association_types_register.sql`, mirrors the existing `note|file → scope` rows: `container_side='target'`, `conveys_max='viewer'`); (2) **assigned titles rendered "Untitled Flashcard Set" for students** — `reference_search_candidates` (the title resolver behind `useEntityTitles`) filtered by-id lookups with the owner-or-org ENUMERATION predicate; the by-id path now gates on `iam.has_access(token,id,'viewer')` like the `file` branch already did (`migrations/reference_candidates_by_id_uses_has_access.sql`; student resolves, outsider refused, search unchanged); (3) **a member opening the class by SLUG dead-ended** — `ClassHubView` resolved slugs only over the owner's `useClasses`; joined classes (`useMyClasses`) are now the slug fallback. **Gradebook ruled (D-WP6-5):** no teacher-entered grades at launch; the derived grid is the gradebook and says so in one line. **LMS seam designed** (`common-docs/systems/education/LMS_SEAM.md`) — integrations stay post-launch.
- **2026-08-18** — **Invites + join codes (education-platform WP6).** `migrations/edu_class_invites_and_join_codes.sql` (applied live + ledgered): additive scope-target support in the canonical invitation core (`iam._container_authz` scope branch, `inv_create` scope whitelist w/ member-only guard, `inv_get_by_token` class name) + join-code RPC family (`edu_class_join_code` owner get/rotate/disable, `edu_class_by_code` signed-in preview, `edu_class_join_by_code` — admits open+closed, paid → needs_purchase). Verified by JWT impersonation: owner-only code manage, non-owner/member cannot invite, scope invites member-only, tokens email-bound, rotate/disable kill old codes, accept → active membership, roster shows joined students; org/project invite paths regression-checked. FE: `InviteStudentsSheet` (code+link / multi-email / roster-file import), `useClassInvites`, `JoinClassView` + `/education/classes/join`, `/invitations/class/accept/[token]` (auth-destination preserved for signup), `/api/education/class-invite` + `emailTemplates.classInvitation`. `pnpm db-types` regenerated.
- **2026-07-15** — **Convergence C: REAL creator payouts (Stripe Connect Express)** (`migrations/stripe_connect_creator_payouts.sql`, applied live + ledgered). Replaced the bypassable `edu_class_purchase` STUB (deleted) with a real money-movement path: a paid class is bought via Stripe Checkout as a Connect **destination charge** (`POST /api/stripe/class-checkout`; 20% platform application_fee / 80% creator transfer, config in `lib/stripe/connect.ts`); `checkout.session.completed` (webhook) confers the enrolment via the **service_role-only** `edu_class_confer_purchase` — the paid gate is now **webhook-only** (EXECUTE revoked from anon+authenticated; verified). Refund/chargeback (`charge.refunded`/`charge.dispute.created`) → `edu_class_revoke_purchase` soft-removes access. Price lives in `scope.settings.price_cents` (added to the class form; read authoritatively server-side). FE: `ClassAccessPanel` + creator `EnrollButton` now start real checkout ("Enroll — $X"); `useClassAccess.startCheckout`; `service.startClassCheckout`. Verified live (Supabase MCP): confer → `active` member (grant_source=stripe_purchase); revoke → soft-removed; webhook-only grant confirmed (authenticated cannot execute). **Blocked on Arman:** Connect not yet enabled on the Stripe account + `STRIPE_WEBHOOK_SECRET` unset — see `features/entitlements/FEATURE.md` §Creator payouts.
- **2026-07-14** — **Assignment CONFERS read visibility** (`migrations/edu_assignment_confers_read.sql`, applied live + ledgered). Closes the flagged gap: an ACTIVE member of a class can now READ a resource assigned to it (deck/quiz), so a teacher can assign a **private** deck/quiz and enrolled students open+study it. **Mechanism (Option B, chosen over a permissions grant because `iam.permissions` targets a user/org — not a scope — and scope→content conveyance is role-blind + shared-core):** ONE additive VIEWER-only branch in `iam.has_access` gated on `public._edu_can_read_via_assignment(token,id)` (SECURITY DEFINER; `role='assignment'` edge to a scope the caller actively belongs to; `fc_card` inherits via its parent-deck edge). `has_access` is the single choke point every read path funnels through (base-table RLS + `assoc_members_visible` card loader + `useEntityTitles`), so one branch fixes title resolution AND the study-deck card load. Live-evaluated ⇒ self-revoking on unassign / leave / removal; viewer-only; monotonic; anon-safe. FE: `AssignedToYouPanel` "Study" now deep-links via new `studyHref` on the education `entityRoutes` map (`educationEntityStudyHref`) → `/education/flashcards/[id]/study` (deck) or `/education/quizzes/[id]` (quiz); titles resolve for free (the row read is now permitted). Verified live (Supabase MCP, JWT-impersonation): active member reads assigned private deck (deck row + both cards + card edges + title); NEGATIVES denied — non-member and a member of a DIFFERENT class (deck not assigned there) read nothing; unassign → member loses read; leave/removal (membership inactive) → member loses read even with the edge present. `pnpm db-types` regenerated.
- **2026-07-14** — **Convergence C: teacher tools — assignments + class analytics** (`migrations/edu_class_assignments_analytics.sql`, applied live + ledgered). An assignment = a `platform.associations` edge (`role='assignment'`, due-date metadata); NO new table. Completion/scores DERIVED from the study spine (never stored). Five SECURITY DEFINER RPCs — `edu_class_assign`/`_unassign` (owner), `edu_class_assignments` (owner/member — the member's org-gate-bypassing read path), `edu_class_student_progress` (owner-any-member/self, active-member-only), `edu_class_progress_overview` (owner grid+rollup) — each re-checks the caller's role (mirrors `edu_class_roster` + `guardian_assert_access`). Consent basis: enrolment = consenting to the teacher seeing your progress on THIS class's assignments, and nothing else. FE: `service.ts` wrappers + `useClassAssignments`/`useClassProgress` + `ClassAssignmentsPanel`/`AssignResourceSheet`/`ClassProgressPanel`/`AssignedToYouPanel`/`assignmentDisplay`; wired into `ClassHubView` (owner body + member view); `ContainerLink.role` added so `useClassContent` excludes assignment edges. Verified live (JWT-impersonation, Supabase MCP): owner assigns → member sees it → member completes (75%, 3/4) → owner grid + `edu_class_student_progress` show completed+75%; NEGATIVES all denied — member reads owner grid (42501), member assigns (42501), non-member reads assignments/progress/grid (42501), owner reads a non-member's progress (42501 "not an active member"). `pnpm db-types` regenerated.
- **2026-07-14** — **Convergence C: class membership + access model** (`migrations/edu_class_membership_access_model.sql`, applied live + ledgered). access_mode (open/closed/paid) in `scope.settings`; roster on `iam.memberships` (owner/member; active/pending/entitled); the published `edu_class_*` RPC family (join/request/approve/leave/remove/roster/grant/purchase/set-access/state/my-classes — the contract the creator landing page consumes); `context.scopes` SELECT RLS extended additively (open→public read, active member→read, via the `_edu_is_scope_member` SECURITY DEFINER helper); paid gate = `class_access` grant as an `entitled` membership + a purchase STUB (real Stripe Connect PENDING Arman). FE: `service.ts` + `useClassAccess`/`useClassRoster`/`useMyClasses` + `AccessModeBadge`/`AccessModeField`/`ClassAccessPanel`/`ClassRosterPanel`; ClassFormDialog access-mode picker; ClassHubView owner-hub + member-view + roster; ClassesHome access badges + Joined-classes section. Verified live (open→instant join; closed→request→approve; paid→needs_purchase→grant→enrol; RLS non-member sees only open). `pnpm db-types` regenerated.
- **2026-07-14** — Created. W2 Per-Class Hub shipped: scopes-native class model (class=scope, exam dates=scope.settings, content↔class=platform.associations), `/education/classes` + `/education/classes/[classId]`, `ClassPicker` wired into flashcard SetDetailView, `classes` tool + admin-map registration, canonical `data/entityRoutes.ts` (lineage.ts repointed onto it). Zero DDL.

- `2026-10-09` — claude: **Tests (living-kit W5, class side).** Class hub "Tests" row (New test: name, units covered, optional date; edit/remove for the owner, read-only list for members). Test page `/education/classes/[classId]/tests/[testId]`: covered units, everything filed in them (the shared `groupsInPart` over the union of the units), the practice tests filed under it, **Make a practice test** (owner: sources = every file / source document / note in the covered units, deduped, on the one Source input → `generateQuestionsFromSources` → `assessmentService.createWithItems` kind `practice_test`, filed under the test and the class; tab-bound run, entitlement + COPPA gates) and **Study** (`/tests/[testId]/study`: `useWeakAreaDrill({deckIds})` over every deck of the covered units; session `source_set_id` null, `source_query {test, units, decks}`). Tests: `__tests__/classTests.test.ts`, `flashcards/data/__tests__/weak-area-drill-test-decks.test.tsx`. Open: a member seat was not walked (no member in the walked class); the date is edited by re-filing the edge (no separate editor).
