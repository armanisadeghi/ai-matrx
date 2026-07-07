# W2 — Per-Class Hub *(WAVE 2 — documented now so it is not forgotten; do NOT assign yet)*

> **Status date:** 2026-07-07 · **Approved by Arman for Wave 2** ("Wave 2 is fine but I still
> want it fully documented — the scopes model here is a massive win"). Trigger to assign: after
> Convergence B (the connected study loop), when the tools this hub composes all exist.
> Source: competitive research §3 (P3-class-hub) + §4 addition 13.

## Objective

A course-scoped workspace: for each class the student takes ("AP Bio, Period 3, Ms. Rivera",
"ECON 201"), one hub holding that class's files, notes, decks, quizzes, generated media, tutor
conversations, exam dates, and (later) classmates/teacher. Every study tool becomes
class-filterable; every generation lands in the right class automatically; the planner reads the
class's exam calendar. The research found this shape (Gizmo/emerging tools) directly matches how
students actually organize their lives — by class — and no incumbent does it well.

## Why this is a scopes-model layup (the "massive win")

The platform's **Scopes system** (`features/scopes/FEATURE.md`) already models exactly this: a
user-authored dimension (`Class`) whose values ("AP Bio") carry context items, with
`ctx_scope_assignments` tagging any entity to a scope value (local context), the
`ActiveScopePicker` making a class the ambient working context (global context), and
`resolve_full_context` delivering it to every agent at invocation. A class hub is therefore NOT
a new data model — it is:

1. A `Class` scope type (seeded per user, user-editable) whose values are the student's courses.
2. Every education artifact (deck, quiz, note, audio, plan goal) taggable to a class via the
   canonical assignment path — most of which the Wave-1 tools already do via associations/scopes.
3. A hub SURFACE per class value: `/education/classes/[classId]` aggregating everything tagged
   to it (the gallery/aggregation problem War Room already solved for sessions).
4. The tutor/planner reading class scope from context — which `resolve_full_context` already
   delivers.

**Design constraint (load-bearing):** class pickers on artifacts write LOCAL context
(`ctx_scope_assignments`), never the global `appContextSlice` — per the Scopes canonical model.
Setting "I'm working on AP Bio right now" is only the ActiveScopePicker's job.

## Scope (draft — re-verify against Wave-1 reality at assignment time)

**IN:** the `Class` scope type + onboarding ("add your classes"); class tagging on every
education artifact (audit what Wave 1 already gives via associations — likely most of it);
the per-class hub surface (files, notes, decks, quizzes, media, tutor threads, exam dates,
upcoming plan items for that class); class-aware defaults (generate while a class is active →
lands in the class); class exam dates feeding `study_goal`/the P5 planner; class-filtered
views in each tool's list page.

**OUT (later waves):** teacher-side controls and assignment distribution (Convergence C);
classmates/shared class rooms (social fan-out); LMS roster sync (LTI/OneRoster).

## Dependencies

Wave 1 complete-ish: the tools exist (P1–P4), the unified dashboard (P5), sharing (P7), and the
converter/kit flows (P4/P9). Scopes system ✅ (already live). Read
`features/scopes/FEATURE.md` + `features/agent-context/FEATURE.md` before designing anything.

## Definition of done (draft)

A student adds three classes, sets one active, uploads a syllabus + notes → everything generated
lands in that class; the class hub shows all of it plus exam dates; the planner schedules around
that class's exam; the tutor answers "what should I focus on for this class?" from class-scoped
context; switching the active class switches all ambient defaults.
