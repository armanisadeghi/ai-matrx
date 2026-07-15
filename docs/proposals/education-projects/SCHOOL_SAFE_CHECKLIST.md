# SCHOOL-SAFE REVIEW-READINESS CHECKLIST — AI Matrx Education Hub

> **Purpose:** enumerate what Apple / Google education review, ChromeOS, and district IT
> typically require to allow an app on school-managed devices, and record **OUR posture per
> item** — so we're never surprise-banned, and so Arman sees exactly what's **code-done** vs
> **needs-legal/policy**.
>
> **Scope note:** this file covers **code affordances**. The legal/policy TEXT (privacy policy,
> DUA/DPA templates, COPPA verifiable-consent method, ToS) is **Arman/legal**, not built here.
> Each row is tagged: **[CODE ✅]** done in code · **[CODE ◐]** partial / primitive built, rollout
> pending · **[LEGAL]** Arman/legal owns · **[DECISION]** product/infra decision for Arman.
>
> **Last updated:** 2026-07-15.

---

## Legend

| Tag | Meaning |
|---|---|
| **[CODE ✅]** | Built and verified in this repo. |
| **[CODE ◐]** | Primitive built; broader rollout or a follow-up is pending (named inline). |
| **[LEGAL]** | Owned by Arman/legal — code cannot satisfy it. |
| **[DECISION]** | Needs a product/infra call from Arman before code proceeds. |

---

## 1. Children's privacy — COPPA (under-13) & FERPA (student records)

| Requirement | Our posture | Status |
|---|---|---|
| Capture/represent user age band | `users.profiles.age_band` (`under_13`/`13_17`/`adult`); `edu_set_age_band` RPC; declared on `/education/data` (AgeBandPrivacyCard). | **[CODE ✅]** |
| Verifiable **parental consent BEFORE** data collection / AI use for under-13 (client layer) | `edu_coppa_gate()` blocks under-13 AI until a **VERIFIED guardian link** exists (an active link with `verified_at` set by a verifiable-consent method — a mere active link now yields "waiting for a parent to verify"); reuses the guardian-consent system (`features/education/family`). Block is a clear dialog → `/education/family`. Wired on every education AI-generation entry point (Study Kit, memory, quizzes/practice tests, handwritten grading, spoken practice, audio study, mind maps, convert/note fan-out, tutor); `engage` has no AI trigger to gate. **First fail-closed layer, not the boundary** (see server row below). | **[CODE ✅]** — gate rolled out to all AI entries (list in `features/education/compliance/FEATURE.md`). |
| **Server-side** enforcement at the AI-generation boundary (D57) | aidream independently REFUSES an education generation (`source_feature` `education-*`) for a signed-in under-13 without a **VERIFIED** guardian link (`verified_at` set) — `enforce_education_coppa` in the agent-execution funnel (`prepare_agent_run` / `_prepare_continue_run`), reusing the `edu_coppa_gate` facts via the ORM (matches the verified-consent semantics; active-but-unverified is still refused), failing CLOSED. Closes the client-bypass hole (devtools / direct API). Returns a structured `fatal_error` `error_type="education_coppa_consent_required"` the FE surfaces as the consent-required state. Live-verified vs `edu_coppa_gate()` across all three under-13 states. Contract: `aidream/services/education_compliance/FEATURE.md`. | **[CODE ✅]** — D57 server enforcement done (`age_band` self-declaration + verifiable *method* remain, rows below). |
| **Verifiable** consent *method* (credit-card / gov-ID / signed form — COPPA §312.5) | **Built on the guardian link** (`consent_method`/`verified_at`/`verification_ref` cols). **(a) Card — LIVE:** a $0.50 Stripe auth-and-void (manual capture → void; $0 settles) proves an adult cardholder; guardian starts it from the Family page, the Stripe webhook confirms it server-side (`guardian_confirm_verification`, service-only — a child can never self-verify). **(b) Signed form — scaffold** (option + service RPC wired; upload + admin-review UI pending). **(c) Gov-ID/KBA vendor — stub** (dialog option; vendor pick pending). Live-verified block→verify→allow→revoke→block (Stripe test). | **[CODE ✅]** card path · **[CODE ◐]** signed form · **[DECISION]/[LEGAL]** — Arman picks which method(s) to require + the gov-ID vendor + legal sign-off (runbook `COPPA_VERIFIABLE_CONSENT_RUNBOOK.md`). |
| Age-declaration tamper-resistance (child can't self-flip to "adult") | Band is self-declared via a validated RPC; no re-verification on change. | **[LEGAL]** / **[DECISION]** — policy + optional re-consent-on-change (code can enforce once decided). |
| Student **data export** (FERPA/COPPA data ownership) | `edu_export_study_data()` → full study-spine JSON archive (sessions, attempts, mastery, goals, plans, media, assessments, decks, learn docs, quizzes). Per-deck open-format export (JSON/MD/Anki/CSV) already shipped. UI on `/education/data`. | **[CODE ✅]** |
| Student **data deletion** (right to erasure) | `edu_delete_study_data()` soft-deletes the whole spine; **reversible 30 days** (undo toast + `edu_restore_study_data()`); audited in `education.data_rights_event`. UI on `/education/data` (confirm dialog). | **[CODE ✅]** |
| **Hard purge** after the reversible window | Soft-delete + 30-day window built; the permanent purge job (hard-delete rows soft-deleted > 30d) is a **server cron** (aidream/scheduler), not an authenticated one-click. | **[CODE ◐]** — schedule the purge job (aidream). |
| Data-rights **auditability** | `education.data_rights_event` ledger (export/delete/restore per user, RLS self-read). | **[CODE ✅]** |
| No email-enumeration / account harvesting on the consent flow | D52 fixed: `guardian_grant`/`guardian_request_student` return identical neutral responses regardless of email existence + per-requester rate limit. | **[CODE ✅]** |

## 2. Data minimization & no ad-tech

| Requirement | Our posture | Status |
|---|---|---|
| No third-party **advertising SDKs** / ad networks | None in the education surfaces; product pledge "we never sell your study data or show you ads" is stated on `/education/data`. | **[CODE ✅]** (verify no ad SDK creeps into the bundle) — **[LEGAL]** to assert in policy. |
| No selling / sharing student data with third parties | Same pledge; data stays in our Supabase + aidream. | **[LEGAL]** (contractual assertion). |
| Data minimization (collect only what's needed) | Study spine is task-scoped; no behavioral ad profiling. | **[CODE ✅]** posture — **[LEGAL]** to document. |
| Analytics/telemetry disclosure for minors | Whatever product analytics exist must be disclosed / suppressible for under-13. | **[DECISION]** — inventory analytics; **[LEGAL]** disclosure. |

## 3. Store / OS review (Apple, Google Play, ChromeOS)

| Requirement | Our posture | Status |
|---|---|---|
| Apple **Kids Category / age rating** compliance (no external links/purchases without gate for kids) | Web app today; if shipped via App Store, the under-13 gate + no-ads posture align. | **[DECISION]** (distribution) + **[LEGAL]** (age rating). |
| Google Play **Families / Designed for Families** policy | Same gate + no-ads posture. | **[DECISION]** + **[LEGAL]**. |
| **Privacy nutrition labels** (Apple) / **Data safety form** (Google) | Requires an accurate data-collection inventory. | **[LEGAL]** with a code-provided data inventory (the export archive shows exactly what we store). |
| ChromeOS install / **admin allow-listing** | Standard web app; the domain must be allow-listable and stable. | **[DECISION]** — see subdomain question in CONVERGENCE_C. |
| App must function under a **managed / restricted** account | No dependency on personal Google/Apple sign-in beyond our auth. | **[CODE ✅]** posture — verify SSO options for districts. |

## 4. District IT / procurement

| Requirement | Our posture | Status |
|---|---|---|
| Signed **DPA / DUA** (Data Processing/Use Agreement); many states mandate (e.g. SOPPA, SDPC) | — | **[LEGAL]** — template + signature flow. |
| Published **privacy policy** URL (child-directed) | Route exists under `(public)/legal`; text is legal's. | **[CODE ✅]** surface — **[LEGAL]** text. |
| **SSO** (Google Workspace for Education / Clever / ClassLink) | Supabase auth; district SSO connectors not yet wired. | **[DECISION]** / future build. |
| Data residency / sub-processor list | Supabase (us-west-1) + AWS + aidream. | **[LEGAL]** disclosure. |
| Incident/breach notification commitment | — | **[LEGAL]**. |
| **Data retention & deletion policy** stated | Code enforces 30-day reversible delete + purge; the *stated policy* is legal's. | **[CODE ✅]** mechanism — **[LEGAL]** text. |

---

## Summary — what's code-done vs needs-legal

**Code-done ✅ (this pass):**
- Age band captured + declarable; COPPA gate RPC (`edu_coppa_gate`) blocking under-13 AI behind a **verified** guardian link (reuses the guardian system).
- **Verifiable parental-consent method (COPPA §312.5) card path LIVE** — a $0.50 Stripe auth-and-void proves an adult cardholder; the webhook confirms it server-side (`guardian_confirm_verification`, service-only); the child is unblocked only once the link is verified. Signed-form scaffolded; gov-ID vendor stubbed. Live-verified block→verify→allow→revoke→block (Stripe test).
- `useAiComplianceGate` wired on every education AI-generation entry point (Study Kit, memory, quizzes/practice tests, handwritten grading, spoken practice, audio study, mind maps, convert/note fan-out, tutor) — `engage` confirmed to have no AI trigger. Live-verified (Supabase MCP + Playwright): under-13/no-guardian blocked; adult allowed.
- Full study-data **export** (whole spine) + gated, auditable, **reversible-window delete/restore**; "Your data & privacy" surface.
- Email-enumeration oracle closed + consent-request rate limit (D52).
- Data-rights audit ledger.

**Code follow-ups ◐ (named, not blocked on legal):**
- Signed-form verification: build the parent upload + admin-review UI (the method + service RPC are wired).
- Schedule the hard-purge cron (aidream) for data soft-deleted > 30 days.
- Verify no ad/analytics SDK reaches the education bundle; inventory analytics for minors.
- Tutor gate is session-start-only (composer has no per-send hook) — consider a first-class composer `onSubmit` hook for an exact per-message gate.

**Needs Arman / legal:** (runbook: `COPPA_VERIFIABLE_CONSENT_RUNBOOK.md`)
- Which verifiable method(s) to REQUIRE + the gov-ID/KBA **vendor** pick (card path is built) + legal sign-off; age-change re-consent policy.
- Privacy policy + DPA/DUA templates + data-safety/nutrition labels + sub-processor list + breach commitment.
- Distribution decisions (App Store/Play/ChromeOS, district SSO, subdomain/brand separation).
