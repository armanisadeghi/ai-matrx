# FEATURE.md — `education/family` (Parent / Guardian dashboard)

**Status:** `live`
**Tier:** `2` — a study-hub sub-feature
**Route:** `/education/family` (+ `/education/family/[studentId]`)
**Last updated:** `2026-07-15`
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
`created_by`, timestamps, plus the **verifiable-consent columns**
`consent_method` (`card|signed_form|vendor_id`), `verified_at`, `verification_ref`
(`migrations/edu_guardian_verifiable_consent.sql`). `unique(guardian_user_id,
student_user_id)`; RLS: each party SELECTs only their own rows; **all writes go through
the RPCs** (no write policies). The row IS the auditable consent record (who = guardian,
method, when = `verified_at`, ref = `verification_ref`; revoke = `status=revoked` +
`revoked_at`).

**RPCs (public schema, all SECURITY DEFINER):**
- Consent — `guardian_grant(email, relationship?)`, `guardian_request_student(email, relationship?)`,
  `guardian_respond(guardian_user_id, approve)`, `guardian_unlink(guardian_user_id, student_user_id)`.
  `guardian_grant` **resets** `verified_at`/`consent_method`/`verification_ref` when it
  re-establishes a non-active link (a revoked→re-granted consent needs FRESH verification).
- Verify — `guardian_confirm_verification(link_id, method, ref)` — **service_role ONLY**
  (revoked from anon+authenticated). The one server-side verified-write path; called by
  the Stripe webhook (card) and secret-token admin routes (signed form). A child can never
  reach it.
- Listing — `guardian_list_links()` (every link the caller is in, with computed `role` +
  counterpart identity + `verified_at` + `consent_method` + `student_age_band` so the
  guardian UI knows which under-13 children still need verification), `guardian_can_view(student_id)`.
- Gated reads (each `perform guardian_assert_access(student_id)` first) —
  `guardian_student_mastery`, `guardian_student_attempts(_, since)`,
  `guardian_student_sessions`, `guardian_student_streak`, `guardian_student_gain`,
  `guardian_student_card_topics(_, card_ids)`. Each returns the SETOF the matching
  `education.*` table (typed rows in the generated types).

---

## Verifiable parental consent (COPPA §312.5)

Consent capture ("a parent said yes" = an active link) is NOT the same as *verifiable*
consent. COPPA requires an operator to verify the consenting party is an adult (credit-card
transaction, signed form, or gov-ID/KBA) **before** an under-13's data is collected. This
is built ON the same `guardian_link` — verification is columns on the link, never a forked
consent table.

**The flow:** under-13 (or a guardian request) → an active link → the guardian picks a
verification method → completes it → a SERVICE path stamps `verified_at` → `edu_coppa_gate`
(`features/education/compliance`) flips the child to allowed. Revoke re-blocks.

**Methods** (`GuardianConsentVerifyDialog`):
- **(a) Card — LIVE (self-serve).** A $0.50 Stripe Checkout in **manual-capture** mode: a
  successful authorization proves an adult cardholder, and we **void it immediately** (cancel
  the PaymentIntent) so $0 ever settles. Route `POST /api/education/coppa-verification`
  (guardian-auth'd, validates an active link) creates the session; the **Stripe webhook**
  (`app/api/stripe/webhook` → `consent/verificationSync.confirmCoppaVerification`) voids the
  auth and marks the link verified. Reuses the existing `lib/stripe/server` client +
  `billing.customer` mapping; kept in files SEPARATE from subscription checkout + creator
  payouts. Uses Stripe TEST keys in dev (`STRIPE_TEST_MODE_SECRET_KEY`).
- **(b) Signed form — scaffold.** A parent downloads/e-signs a consent form and uploads it;
  an admin reviews and confirms via `guardian_confirm_verification(link, 'signed_form', file_id)`
  (secret-token admin route + the service RPC). The dialog option + method are wired; the
  upload + admin-review UI is the remaining build (runbook).
- **(c) Government ID / KBA — stub.** A vendor (e.g. Persona, Stripe Identity, Veratad,
  PRIVO) verifies identity. Dialog option present + disabled; **vendor is Arman's decision**
  (runbook `docs/proposals/education-projects/COPPA_VERIFIABLE_CONSENT_RUNBOOK.md`).

**A child can NEVER self-verify.** `guardian_confirm_verification` is `service_role`-only; the
only callers are the signature-verified Stripe webhook and secret-token admin routes — never
the browser. The parent's post-Checkout redirect is cosmetic; the webhook is the source of truth.

**Coordination (aidream server enforcement):** aidream's `enforce_education_coppa` reads
`edu_coppa_gate`, whose `ai_allowed` now requires a VERIFIED link for under-13 — so a verified
`guardian_link` is exactly what flips the SERVER gate to allow. If aidream ever reads
`guardian_link` directly, "verified" = `status='active' AND verified_at IS NOT NULL`.

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
  inbox, student-side grant). Under-13 links show a "Verify consent" CTA + "Consent
  verified" badge + revoke; reads `?consent=` on return from Stripe.
- `components/StudentProgressView.tsx` — read-only `StudyAnalyticsView` for one student.
- `components/GuardianConsentVerifyDialog.tsx` — the verifiable-consent method chooser.
- `../compliance/consent/consentVerificationService.ts` — client wrapper that starts card
  verification (POSTs the route, redirects to Stripe). *(Lives under `compliance/` — COPPA
  verifiable consent is a compliance concern operating on the family link.)*
- `../compliance/consent/verificationSync.ts` — server-side webhook confirm
  (`confirmCoppaVerification`): void the auth + `guardian_confirm_verification`.
- `app/api/education/coppa-verification/route.ts` — the guardian-auth'd checkout-session route.
- `types.ts` — row types derived from the generated types; `needsConsentVerification(link)`
  + `consentMethodLabel(method)` helpers.

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
- **No email-enumeration oracle (D52).** `guardian_grant` / `guardian_request_student` return
  an IDENTICAL neutral jsonb (`{status:'granted'|'sent'}`) whether or not the target email
  resolves to an account — never confirm existence via a response or error. The only errors
  either raises are the caller's OWN-email case and the per-requester rate-limit block
  (`public.check_file_rate_limit`, bucket `edu_guardian_consent`, 8/min), both existence-blind.
  Never re-introduce a "No account found"-style branch. UI copy stays neutral
  ("If an account with that email exists…").
- **Read-only.** The guardian view mutates nothing on the student's data — `StudyAnalyticsView`
  is passed `readOnly` and no write RPC targets student study rows.
- **A child never self-verifies.** `guardian_confirm_verification` is `service_role`-only.
  Verification is confirmed server-side (Stripe webhook / secret-token admin route) from a
  successful real transaction — never a client claim, never the parent's redirect. Never add
  an authenticated/anon grant on that RPC.
- **Verification resets on re-consent.** A revoked→re-granted link is a NEW consent and must
  re-earn verification — `guardian_grant` clears `verified_at`/`consent_method`/`verification_ref`
  unless the link was already active. Never carry an old verification across a revoke.
- **One Stripe webhook, separated flows.** COPPA verification branches on
  `metadata.purpose='coppa_verification'` FIRST in the shared webhook; class purchases key on
  `metadata.kind`, subscriptions on `session.subscription`. Never route by `session.mode` alone
  (COPPA + class both use `mode:'payment'`).

## Change log

- `2026-07-15` — **Verifiable parental consent (COPPA §312.5)** built on the guardian system.
  Added verification columns to `guardian_link` (`consent_method`/`verified_at`/`verification_ref`)
  + `guardian_confirm_verification` (service-only) + verification signals on `guardian_list_links`
  + `guardian_grant` verification-reset; `edu_coppa_gate` now unblocks an under-13 only on a
  VERIFIED link (`migrations/edu_guardian_verifiable_consent.sql`, applied + ledgered + types
  regenerated). Card method LIVE end-to-end (`POST /api/education/coppa-verification` →
  $0.50 auth-and-void Stripe Checkout → webhook `confirmCoppaVerification`); signed-form scaffolded;
  gov-ID vendor stubbed. `GuardianConsentVerifyDialog` + verify/verified/revoke UI on the dashboard;
  child sees "waiting for a parent to verify". **Live-verified** (Supabase MCP + real Stripe TEST
  webhook, signed): block → card-verify (PI authorized → voided, $0 settled) → allow → revoke →
  block; route returns a real `cs_test_` session. Arman runbook:
  `docs/proposals/education-projects/COPPA_VERIFIABLE_CONSENT_RUNBOOK.md`.
- `2026-07-15` — **D52 fix (school-safe hardening).** Closed the email-enumeration oracle in
  `guardian_grant` / `guardian_request_student` (identical neutral jsonb response regardless of
  email existence) + added a per-requester consent-request rate limit (8/min via
  `check_file_rate_limit`). `migrations/edu_guardian_link_d52_enumeration_ratelimit.sql`
  (applied + ledgered). Service now returns `GuardianConsentResult`; UI copy made neutral.
  The active guardian link is also the COPPA unblock signal for under-13 accounts — see
  `features/education/compliance/`.
- `2026-07-14` — Feature created. `education.guardian_link` + `guardian_*` RPCs
  (`migrations/edu_guardian_link.sql`, applied live + ledger). Extracted `StudyAnalyticsView`
  (pure) from `StudyAnalyticsDashboard` and `buildGainReport` from `learningGainService` for
  reuse. New `/education/family` (+ `[studentId]`) routes, `family` tool (live) in `tools.ts`,
  admin-map + component entries. Verified live: guardian sees a granted student's real metrics;
  a non-granted student is blocked (42501).
