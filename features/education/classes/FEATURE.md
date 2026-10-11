# Education Hub — Per-Class Hub (FEATURE.md)

**Status:** live · **Tier:** 2 · **Routes:** `/education/classes` (`ClassesHome`), `/education/classes/[classId]` (`ClassHubView`; id = scope id or slug), `/education/classes/join?code=` (`JoinClassView`), `/education/classes/[classId]/tests/[testId]`, `/invitations/class/accept/[token]`
Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/education/classes-and-creators/STATE.md — read it before touching this feature in ANY repo (product rules, paid-class and Stripe Connect status, `learn.aimatrx.com`). Also `common-docs/systems/education/STATE.md` rules 17-18. Agent-facing contract for the surfaces: `features/surfaces/guides/education-classes.md`. This feature invents NO scope semantics — read [`features/scopes/FEATURE.md`](../../scopes/FEATURE.md) first.

## What it is

A course workspace per class: decks, quizzes, notes, media, files, units, tests and exam dates in one place, plus (for teachers) a roster, join code, assignments and per-class progress. Zero education tables — a class is a scope.

## The model (all existing primitives)

| Concept | Built on |
|---|---|
| Class | a `context.scopes` row under the per-org "Class" scope type (reserved slug `class`; found by slug, never label); package `Scope` from `@ai-matrx/records/scopes` |
| Class metadata (teacher, term, period, exam dates, `access_mode`, `price_cents`, `join_code`, `archived`) | the scope's `settings` JSONB, parsed in `settings.ts` |
| Content in a class | a `platform.associations` edge `content → ('scope', classId)`; the hub reads incoming edges (`useContainerLinks`) and lists EVERY incoming token; routing/labels come from `features/education/data/entityRoutes.ts` |
| Unit (part of a class) | a scope under the "Unit" type (`class-part`) + `scope → scope` edge role `part_of`; content is filed in a unit by a second edge BESIDE the class edge, so the class view always lists everything and a unit is a filter (`?unit=<id>`). `classParts.ts`, `hooks/useClassParts.ts` |
| Test (quiz/midterm/final) | a scope under the "Test" type (`class-test`) + `part_of` edge to the class with `metadata {kind:"test", date}` + `covers` edges to units; an optional date also lands in the planner as an `education.study_goal`. `classTests.ts`, `useClassTests.ts`, `useClassTestMaterial.ts` |
| Roster | `iam.memberships` on the class scope (`role` owner/member; `status` active/pending/entitled) |
| Assignment | an association edge `deck/assessment → class scope`, `role='assignment'`, metadata `{due_date, assigned_at, assigned_by}`; assignable tokens `ASSIGNABLE_TOKENS` mirror the DB guard `_edu_is_assignable_token` |

`appContextSlice` is never written here: `ClassPicker` wraps `EntityScopeTagger` locked to the Class type and writes LOCAL tags only; the ambient "working on this class" context is the global `ActiveScopePicker`'s job. A class lives in an organization like any record; privacy comes from its own access mode and roster, never its organization (access ladder).

## Rules and invariants

- **Access modes** (`settings.access_mode`, missing = `closed`): `open` (publicly listed, instant join, anon-readable scope), `closed` (request then owner approval), `paid` (join needs a purchase-conferred grant). A join code admits open AND closed classes (the teacher's distribution is the approval) and NEVER bypasses payment. An accepted email invite is an ACTIVE membership in any mode (invites are minted only by owner/org admin; for paid classes it is a deliberate comp).
- **Paid enrolment is never a client call.** Stripe Checkout (`POST /api/stripe/class-checkout`, Connect destination charge); the webhook confers via `edu_class_confer_purchase` and a refund via `edu_class_revoke_purchase`, both `service_role`-only. Price is `settings.price_cents` read server-side. The grant is a membership row, not a `billing.capability`. Mechanism: `features/entitlements/FEATURE.md` § Creator payouts; status: the classes-and-creators STATE.
- **The `edu_class_*` RPCs are the contract** (`service.ts` is the one typed wrapper; migrations `edu_class_membership_access_model.sql`, `edu_class_assignments_analytics.sql`, `edu_class_invites_and_join_codes.sql`, `edu_assignment_confers_read*.sql`). The RPC's owner/role check is the boundary, never a client `isOwner`; the hub gates owner controls on `access.state.isOwner` (the `edu_class_state` answer), because `useClasses()` returns every readable Class scope in the org, not only the caller's.
- **Roster emails are owner-only** (`edu_class_roster` nulls `email` for non-owners; everyone gets `display_name`).
- **Completion and scores are derived live** from the study spine (`_edu_resource_progress`), never stored; no teacher-entered grades (STATE rule 18). A teacher reads a member's data ONLY scoped to this class's assignments and only for an ACTIVE member (enrolment = consent to that, nothing wider) — tighter than the guardian model, which is why the per-student drill-in does not reuse `StudyAnalyticsView`.
- **Assignment confers read** through ONE additive viewer-only branch in `iam.has_access` (`public._edu_can_read_via_assignment`): active member + `role='assignment'` edge only; live-evaluated, so unassigning or leaving revokes it; `fc_card` inherits from its deck; `assoc_members_visible` also honors it so cross-organization assigned decks load their cards. A plain content tag confers nothing. `context.scopes` SELECT RLS is open-class OR org access OR active member (`public._edu_is_scope_member`); writes are RPC-only.
- **Members see units** (read-only chips, `?unit=`); editing stays with whoever can edit the class. Removing content from a unit archives that edge; removing from the class archives the class edge and every unit edge (`assoc_remove` tombstones).
- **Deleting a class archives it** (restorable); underlying decks/quizzes/notes/media are never deleted — only the container and its tags.
- **"Add sources"** (`AddClassSourcesDialog`, THE Source input) files each Source through `POST /sources/{id}/keep` with the class and selected unit as `attach_to` (`sourceFilingTargets` in `classParts.ts`); non-Source records go through the association door like "Add content". A class test's **Make a practice test** (`MakePracticeTestButton`) uses the units' deduped material through the one question generator (`../assessment/FEATURE.md`).
- Copy-link buttons that fail fall back to `ClipboardFallbackDialog`, never a bare toast.

## Where it lives

`features/education/classes/`: `service.ts`, `settings.ts`, `constants.ts`, `types.ts`, `hooks/` (`useClasses`, `useClassContent`, `useClassAccess`, `useClassRoster`, `useMyClasses`, `useClassAssignments`, `useClassProgress`, `useClassInvites`, `useClassParts`, `useClassTests`, `useClassTestMaterial`), `components/`, agent writes in `classAgentWrites.ts` / `classHubAgentWrites.ts` and scopes in `classesSurfaceScope.ts` / `classHubSurfaceScope.ts`. Surfaces: `matrx-user/education-classes`, `matrx-user/education-class` (manifests in `features/surfaces/manifests/`). Registered as the `classes` entry in `features/education/data/tools.ts` and the education admin map. `ClassPicker` is mounted on flashcard `SetDetailView` (owner-only). Invites ride the canonical `iam.invitations` system (`features/organizations/service/invitationsService`), email via `/api/education/class-invite`; no second invitation system.

## Open

- Planner auto-read of a class's exam dates (the planner takes an exam window as form input today); per-tool list filters by class.
- `EntityScopeTagger`'s `entityType` is typed on the legacy union; `ClassPicker` casts at that one boundary until the tagger itself is widened.
