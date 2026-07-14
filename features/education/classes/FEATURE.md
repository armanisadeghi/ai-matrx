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

## Why it reuses, not forks

- **Scope CRUD:** consumes the canonical `createScopeType` / `createScope` / `updateScope` / `deleteScope` / `fetchScopeTypes` / `fetchScopes` thunks + selectors (`selectScopeTypesByOrg`, `selectScopesByType`, `selectScopeBySlugOrId`). No new scope service, no new RPCs.
- **Tagging (Surface B):** `ClassPicker` is a thin wrapper over `EntityScopeTagger` locked to the Class scope type. It writes LOCAL scope tags only — **never** `appContextSlice` (the load-bearing scopes invariant). Making a class the ambient "I'm working on this now" context is the `ActiveScopePicker`'s job, reached through the global scope picker — not this feature.
- **Aggregation + attach:** `useContainerLinks` (read/attach/detach) + `UniversalAssociationPicker` (the hub's "Add content" flow, targeting the class scope as a container).
- **Routing map:** `features/education/data/entityRoutes.ts` is the ONE education token→route/label/icon map; `convert/lineage.ts` was repointed onto it (killed a duplicated `switch`).

## Entry points

- **Routes** (`app/(core)/education/classes/`): `/` (`ClassesHome` — list-first) · `/[classId]` (`ClassHubView` — the course workspace; `classId` = scope id OR slug).
- **Tool registry:** `EDU_TOOLS` entry `classes` (`features/education/data/tools.ts`) → surfaces on the `/education` tool grid.
- **Feature dir** (`features/education/classes/`):
  - `constants.ts` — reserved slug + seed labels + content tokens + settings keys.
  - `types.ts` — `StudyClass` / `ClassSettings` / `ClassExamDate` / `ClassContentItem`.
  - `settings.ts` — pure parse/serialize between `scope.settings` and `ClassSettings` (+ `scopeToClass`, `nextExamDate`, `daysUntil`).
  - `hooks/useClasses.ts` — ensure-type + list + create/update/delete.
  - `hooks/useClassContent.ts` — hub aggregation over `useContainerLinks`.
  - `components/` — `ClassesHome`, `ClassHubView`, `ClassFormDialog` (create+edit), `ClassPicker` (artifact-side tagger), `AddClassContentSheet`.
- **Demonstrated propagation surface:** `ClassPicker` mounted in `features/flashcards/components/set-detail/SetDetailView.tsx` (owner-only) — tag a deck to a class from the deck page.

## Product decisions (made per the spec's "make the reasonable choice + flag it" mandate)

These filled genuine open product questions. **Flagged for Arman** — reasonable defaults, easily changed:

1. **Classes live in the student's personal org.** A class is personal. Shared/teacher classes → a shared org later (Convergence C). *(Forward path, not built.)*
2. **Teacher vs student semantics: student-centric only.** Per the spec, teacher-side controls + assignment distribution are OUT (Convergence C). A class is owned by the student who created it.
3. **A student can delete/leave their own class.** It's their scope: delete removes the container + its tags only — the underlying decks/quizzes/notes/media are never deleted (association removal, not content deletion). Copy in the confirm dialog says so. (Soft `archived` flag in settings also exists for hide-without-delete.)
4. **Classmates / invite flow: OUT.** No roster, no invites in this item (spec defers class social rooms + LMS roster to later waves). Forward path: share the class scope via `iam.permissions` + roster via `iam.memberships`; teacher = a role on the membership.
5. **Exam dates live in scope settings and deep-link to the planner** (`/education/planner?examBy=…&for=…`). Full automatic planner-read of a class's exam calendar is a **follow-up** (the planner currently takes an exam window as form input).

## Known gaps / follow-ups

- **`EntityScopeTagger` legacy-union cast.** The tagger's `entityType` prop is still typed on the legacy `EntityType` union (no `fc_set`/`assessment`/`study_media`), which is mid-convergence onto `EntityTypeToken`. `ClassPicker` types on the correct `EntityTypeToken` and casts at the single tagger boundary (commented). Runtime is correct (associations FK-validate the token). Widening `EntityScopeTagger` itself is the real fix — deferred (scopes core is owned elsewhere).
- **Planner auto-read of class exam dates** (see decision 5).
- **Class-filtered views inside each tool's list page** (spec IN-scope reach): the tagging + hub read loop is complete; per-tool list filters are the natural next increment.

## Change log

- **2026-07-14** — Created. W2 Per-Class Hub shipped: scopes-native class model (class=scope, exam dates=scope.settings, content↔class=platform.associations), `/education/classes` + `/education/classes/[classId]`, `ClassPicker` wired into flashcard SetDetailView, `classes` tool + admin-map registration, canonical `data/entityRoutes.ts` (lineage.ts repointed onto it). Zero DDL.
