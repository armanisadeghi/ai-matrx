# COPPA Verifiable Parental Consent — Arman Runbook

> **What this is:** the parts of verifiable parental consent (COPPA §312.5) that only Arman /
> legal can decide or procure. The **code is built and live-verified** (Stripe test); this doc
> is the decision + procurement + legal checklist that turns it on for real families.
>
> **Built (see `features/education/family/FEATURE.md` §Verifiable parental consent):**
> - Verification state on `education.guardian_link` (`consent_method`/`verified_at`/`verification_ref`).
> - **Card method — LIVE end-to-end:** `POST /api/education/coppa-verification` → a $0.50 Stripe
>   Checkout in manual-capture mode (auth) → the Stripe **webhook** voids the auth ($0 settles) and
>   marks the link verified via the service-only `guardian_confirm_verification` RPC. A child can
>   never self-verify.
> - **Signed-form method — scaffolded** (dialog option + service RPC accept `signed_form`).
> - **Gov-ID/KBA vendor — stubbed** (dialog option, disabled).
> - `edu_coppa_gate` unblocks an under-13 only on a **verified** link; aidream's server-side
>   enforcement reads the same gate, so verification enforces on both sides.
> - **Live-verified:** block → card-verify (real PI authorized then voided) → allow → revoke → block.

---

## 1. Legal — which method(s) satisfy your COPPA obligation? *(counsel sign-off)*

COPPA §312.5(b) lists acceptable verifiable methods. The ones we can support:

| Method | FTC basis | Our status | Note |
|---|---|---|---|
| **Monetary transaction** (credit/debit card) | Card transaction that notifies the account holder | **Card path LIVE** | A $0.50 **auth-and-void** notifies via a pending authorization and settles $0. If counsel prefers an actual **charge+refund** (a completed monetary transaction), it's a one-line change (automatic capture + `refunds.create`) — flag it and we'll switch. |
| **Signed consent form** ("print-and-send" / e-sign) | Signed form returned by mail/fax/scan | **Scaffolded** | Needs the **form template** (legal) + a review SLA + the upload/admin-review UI (small build). |
| **Gov-ID / knowledge-based (KBA)** | ID match against a database / KBA | **Stubbed** | Needs a **vendor** (§3). |

**Decisions needed:**
- [ ] Which method(s) do we **offer**, and which is the **default**? (Recommend: card default + signed-form fallback; add vendor later.)
- [ ] Is the **$0.50 auth-and-void** acceptable, or do you want a **charge+refund**? (Both are "monetary transaction"; auth-and-void costs the family nothing.)
- [ ] Consent **scope + retention**: the `guardian_link` row is the consent record (who/method/when/ref). Confirm retention duration + whether we need a separate immutable audit ledger for revoked/re-verified history (currently the row + `revoked_at` capture current state; a `guardian_consent_event` ledger is a small add if legal wants full history).
- [ ] **Age-change re-consent policy:** `age_band` is self-declared; today re-granting consent resets verification, but changing age from under_13→adult isn't re-verified. Decide the policy (code can enforce once decided).

## 2. Stripe — turn on the webhook (the card method depends on it)

The card method is confirmed by the **Stripe webhook**, not the browser redirect. Without a
configured webhook, a parent completes the card step but the link is never marked verified.

- [ ] **Register the webhook endpoint** in the Stripe dashboard → Developers → Webhooks:
      `https://<prod-domain>/api/stripe/webhook`, event **`checkout.session.completed`**
      (the same endpoint already used for subscriptions + class purchases — one endpoint, many events).
- [ ] Set **`STRIPE_WEBHOOK_SECRET`** in the prod env (Vercel) to that endpoint's signing secret.
      *(It is currently unset; the shared webhook can't verify signatures without it.)*
- [ ] **Prod mode decision:** in production the app uses **LIVE** Stripe keys, so the $0.50
      auth-and-void runs on the parent's **real card** (voided immediately, $0 settles). Confirm
      that's intended. Test keys (`STRIPE_TEST_MODE_*`) are already set for dev and take precedence there.
- [ ] Local full E2E (optional):
      `stripe listen --forward-to localhost:3000/api/stripe/webhook` → set the printed
      `whsec_…` as `STRIPE_WEBHOOK_SECRET` → complete a Checkout with test card `4242 4242 4242 4242`.

## 3. Gov-ID / KBA vendor pick *(procurement)*

The dialog has a disabled "Government ID / identity check" option waiting on a vendor. Candidates:

| Vendor | Fit | Notes |
|---|---|---|
| **Stripe Identity** | Easiest — we already use Stripe | Document + selfie; not a COPPA-specific product but usable as ID match. |
| **PRIVO** | COPPA-specialized (FTC-approved Safe Harbor) | Purpose-built for children's consent; strongest compliance story. |
| **Persona** | Flexible KYC/identity | Good API, broad methods. |
| **Veratad / AgeMatch** | Age/identity verification | KBA + ID. |

- [ ] Pick a vendor. When chosen, wiring is small: a route that opens the vendor flow + a webhook/callback that calls `guardian_confirm_verification(link, 'vendor_id', <vendor_ref>)` (the exact same confirm path the card method uses).

## 4. Signed-form finalization *(legal + small build)*

- [ ] Provide the **parental-consent form template** (PDF, legal-owned).
- [ ] Decide the **review SLA** + who reviews (admin role).
- [ ] Then we build: parent upload (reuses `@/features/files`) → records `verification_ref = file_id`, `consent_method='signed_form'`, `verified_at` stays null (pending) → admin review confirms via `guardian_confirm_verification` (secret-token admin route). The gate stays blocked until an admin confirms — a child/guardian self-upload is never auto-verified.

## 5. Contract for the aidream server-enforcement agent

`edu_coppa_gate().ai_allowed` already requires a **verified** link for under-13, so aidream's
`enforce_education_coppa` (which reads the gate) inherits verification automatically. **If aidream
ever reads `education.guardian_link` directly**, "verified consent" = `status='active' AND
verified_at IS NOT NULL` — NOT merely `status='active'`.

---

**Change log**
- `2026-07-15` — Created alongside the built card-verification flow (frontend). Open items are Arman/legal/procurement only.
