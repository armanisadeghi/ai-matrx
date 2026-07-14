# FEATURE.md — `education/family` (Parent / Guardian dashboard)

**Status:** `live`
**Tier:** `2` — a study-hub sub-feature
**Route:** `/education/family` (+ `/education/family/[studentId]`)
**Last updated:** `2026-07-14`
**Vision:** [`app/(core)/education/VISION-education-hub.md`](../../../app/(core)/education/VISION-education-hub.md) §14 + "Features Coming Soon — Parent and guardian dashboard (K-8)"; §16 Progress Analytics.

---

## Purpose

Let a **guardian** follow a **linked student's** study progress — study time, mastery %,
weak areas, trends, streaks, and pre/post learning gain — **read-only and
privacy-respecting**. A guardian only ever sees a student who **granted them access**.

This is deliberately a **read-only consumer of the P5 analytics + learning-gain
surfaces**, not a second analytics engine. The exact same
[`StudyAnalyticsView`](../study/analytics/components/StudyAnalyticsView.tsx) the self
dashboard (`/education/progress`) renders is fed a linked student's spine data.

---

## The privacy model (the whole point)

- **A guardian can NEVER self-grant.** Read access is conferred ONLY by a link the
  **student** created or approved.
- **Two consent paths:**
  1. **Student grants directly** — `guardian_grant(email)` → an `active` link immediately.
  2. **Guardian requests** — `guardian_request_student(email)` → a `pending` link that
     confers **nothing** until the student calls `guardian_respond(guardian, true)`.
- **Only `status = 'active'` confers access.** `pending` / `revoked` never do.
- **Either side can revoke** (`guardian_unlink`) at any time.
- **Defence in depth:** the `[studentId]` Server Component 404s unless an active
  guardian link exists (`guardian_list_links`), AND every client read RPC re-checks the
  active link server-side (`guardian_assert_access`). RLS on the study spine
  (`created_by = auth.uid()`) never grants cross-user reads, so the `guardian_*`
  SECURITY DEFINER RPCs are the **only** guardian read path.

---

## Data model

**Table** `education.guardian_link` (`migrations/edu_guardian_link.sql`) — a genuinely
new entity (a consent relationship with its own lifecycle), NOT a row in the
resource-scoped `permissions` system (there is no physical "all my study data" resource
to point a grant at). Columns: `guardian_user_id`, `student_user_id`,
`status` (`pending|active|revoked`), `relationship`, `requested_by` (`student|guardian`),
`created_by`, timestamps. `unique(guardian_user_id, student_user_id)`; RLS: each party
SELECTs only their own rows; **all writes go through the RPCs** (no write policies).

**RPCs (public schema, all SECURITY DEFINER):**
- Consent — `guardian_grant(email, relationship?)`, `guardian_request_student(email, relationship?)`,
  `guardian_respond(guardian_user_id, approve)`, `guardian_unlink(guardian_user_id, student_user_id)`.
- Listing — `guardian_list_links()` (every link the caller is in, with computed `role` +
  counterpart identity), `guardian_can_view(student_id)`.
- Gated reads (each `perform guardian_assert_access(student_id)` first) —
  `guardian_student_mastery`, `guardian_student_attempts(_, since)`,
  `guardian_student_sessions`, `guardian_student_streak`, `guardian_student_gain`,
  `guardian_student_card_topics(_, card_ids)`. Each returns the SETOF the matching
  `education.*` table (typed rows in the generated types).

---

## Entry points

**Routes** (`app/(core)/education/family/`)
- `page.tsx` — server shell → `FamilyDashboard` (list-first hub).
- `[studentId]/page.tsx` — server-gated read-only detail → `StudentProgressView`. noindex.
- No `loading.tsx` — the segment has a `notFound()`-capable `[studentId]` child, so a
  segment loading boundary would recreate the education soft-404 (see `library/loading.tsx`).

**Feature** (`features/education/family/`)
- `familyService.ts` — typed client wrappers over every `guardian_*` RPC (`StudyResult<T>`).
- `useGuardianStudents.ts` — loads + buckets links (students / sent / inbox) + mutations.
- `useGuardianStudentAnalytics.ts` — fetches a student's spine via `familyService` and
  folds it with the SHARED `computeAnalytics` + `buildGainReport`.
- `components/FamilyDashboard.tsx` — the hub (guardian roster, request-access, consent
  inbox, student-side grant).
- `components/StudentProgressView.tsx` — read-only `StudyAnalyticsView` for one student.
- `types.ts` — row types derived from the generated types.

---

## Reuse ledger (what this consumes, never forks)

- **`StudyAnalyticsView`** — extracted from `StudyAnalyticsDashboard` in this change so the
  self + guardian dashboards share one presentational surface. `readOnly` strips CTAs.
- **`computeAnalytics`** (`study/analytics/computeAnalytics.ts`) — the same pure spine→analytics fold.
- **`buildGainReport`** (`study/learning-gain/learningGainService.ts`) — extracted here so the
  learning-gain contract is computed in exactly one place (self + guardian).
- **`StudyTrends`** — rendered inside `StudyAnalyticsView`, unchanged.
- **Study-spine row types** (`study/types.ts`) + `serviceError.fail` + `StudyResult<T>`.

## Invariants

- **Never read another user's spine directly.** Cross-user reads go through the gated
  `guardian_*` RPCs only. No `.schema("education").from(...)` for a student's rows.
- **Consent-first.** A guardian request is inert until the student approves. Never add a
  path that grants access without a student action.
- **Read-only.** The guardian view mutates nothing on the student's data — `StudyAnalyticsView`
  is passed `readOnly` and no write RPC targets student study rows.

## Change log

- `2026-07-14` — Feature created. `education.guardian_link` + `guardian_*` RPCs
  (`migrations/edu_guardian_link.sql`, applied live + ledger). Extracted `StudyAnalyticsView`
  (pure) from `StudyAnalyticsDashboard` and `buildGainReport` from `learningGainService` for
  reuse. New `/education/family` (+ `[studentId]`) routes, `family` tool (live) in `tools.ts`,
  admin-map + component entries. Verified live: guardian sees a granted student's real metrics;
  a non-granted student is blocked (42501).
