# FEATURE.md — `education/family` (Parent / Guardian dashboard)

**Status:** `live` · **Tier:** 2 · **Routes:** `/education/family`, `/education/family/[studentId]` (noindex, server-gated)
Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/education/child-safety/STATE.md — read it before touching this feature in ANY repo (COPPA consent rules, methods, open items).

## What it is

A guardian follows a linked student's progress read-only, and a parent completes verifiable consent for an under-13. The detail view is the SAME `StudyAnalyticsView` the self dashboard renders, fed by `useGuardianStudentAnalytics` through the shared `computeAnalytics` + `buildGainReport` — never a second analytics engine. `/education/family` has no `loading.tsx`: its `[studentId]` child can `notFound()`, and a segment loading boundary would recreate the education soft-404.

## Where it lives

`features/education/family/` (`familyService.ts` wraps every `guardian_*` RPC; `useGuardianStudents.ts`; `components/`: `FamilyDashboard`, `StudentProgressView`, `GuardianConsentVerifyDialog`, `StudentAgeBandControl`). Verification plumbing lives under `../compliance/consent/` (`consentVerificationService.ts` starts card verification; `verificationSync.ts` is the webhook confirm). Server pieces: `app/api/education/coppa-verification/route.ts` (guardian-authenticated checkout-session route) and the Stripe webhook branch. DB: `education.guardian_link` (`migrations/edu_guardian_link.sql`, `edu_guardian_verifiable_consent.sql`, `edu_guardian_link_d52_enumeration_ratelimit.sql`, `edu_guardian_confirm_verification_audits_itself.sql`); the `guardian_*` SECURITY DEFINER RPCs are the only cross-user read path (RLS on the study spine is `created_by = auth.uid()`).

## Invariants

- **Consent-first, never self-granted.** A guardian request (`guardian_request_student`) is inert until the student responds; only `status='active'` confers read access; either side may revoke (`guardian_unlink`). Never add a path that grants access without a student action.
- **Cross-user reads go through the gated RPCs only** (each calls `guardian_assert_access` first); the `[studentId]` Server Component also 404s without an active link. Never `.schema("education").from(...)` another user's rows. The guardian view mutates nothing.
- **A guardian must be an adult** (child-safety STATE rule 4) and verified consent means `status='active' AND verified_at IS NOT NULL`.
- **A child never self-verifies.** `guardian_confirm_verification` is `service_role`-only; callers are the signature-verified Stripe webhook (card) and secret-token admin routes (signed form). Never add an `authenticated`/`anon` grant. The parent's post-Checkout redirect is cosmetic; the webhook is the truth.
- **Every verification audits itself** in the same transaction as the link update (one append-only `education.data_rights_event` row: `action='guardian_consent_verified'`, `user_id` = the student, `detail` with link/guardian/method/`verification_ref`/`actor` (NULL on the normal service path — that is the evidence no user session did it)/`prior_*`/`re_verification`). A rejected call (`22023` bad method, `P0002` non-active link) writes nothing. Any new path that sets `verified_at` audits too or does not ship. This is not an immutable consent ledger; whether COPPA requires one is a counsel question in the STATE.
- **Verification resets on re-consent.** `guardian_grant` clears `verified_at`/`consent_method`/`verification_ref` when it re-establishes a non-active link; a revoked-then-regranted consent re-earns verification.
- **No email-enumeration oracle.** `guardian_grant` / `guardian_request_student` return an identical neutral jsonb whatever the email resolves to; the only errors are own-email and the per-requester rate limit (`check_file_rate_limit` bucket `edu_guardian_consent`, 8/min). UI copy stays neutral; never reintroduce "No account found".
- **One Stripe webhook, separated flows.** COPPA verification branches on `metadata.purpose='coppa_verification'` first; class purchases key on `metadata.kind`, subscriptions on `session.subscription`. Never route by `session.mode` alone (COPPA and class both use `mode:'payment'`).
- **Card method** = $0.50 manual-capture Checkout, authorization proves an adult cardholder, voided at once; non-production requires `STRIPE_TEST_MODE_SECRET_KEY` and never substitutes the live account. Signed form is a scaffold and gov-ID/KBA a disabled stub; method choice and vendor are Arman's (STATE).
- `guardian_unlink` clears the verification columns and writes no ledger row (open item in the STATE).
- Vocabulary of `education.data_rights_event.action` is defined once, in `aidream/aidream/services/education_data_rights/FEATURE.md`.
