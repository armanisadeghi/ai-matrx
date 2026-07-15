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
| Verifiable **parental consent BEFORE** data collection / AI use for under-13 | `edu_coppa_gate()` blocks under-13 AI until an **active guardian link** exists; reuses the guardian-consent system (`features/education/family`). Block is a clear "a parent must approve" dialog → `/education/family`. Wired on the Study Kit front door. | **[CODE ◐]** — gate primitive done; **wire `useAiComplianceGate` on the remaining AI entries** (list in `features/education/compliance/FEATURE.md`). |
| **Verifiable** consent *method* (credit-card / gov-ID / signed form — COPPA §312.5) | Our "guardian approves from their own account" is consent capture, not a legally *verifiable* method. | **[LEGAL]** + **[DECISION]** — pick the verification method; code hooks into the same guardian link. |
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
- Age band captured + declarable; COPPA gate RPC (`edu_coppa_gate`) blocking under-13 AI behind an active guardian link (reuses the guardian system).
- Full study-data **export** (whole spine) + gated, auditable, **reversible-window delete/restore**; "Your data & privacy" surface.
- Email-enumeration oracle closed + consent-request rate limit (D52).
- Data-rights audit ledger.

**Code follow-ups ◐ (named, not blocked on legal):**
- Wire `useAiComplianceGate` on the remaining education AI entry points (list in `features/education/compliance/FEATURE.md`).
- Schedule the hard-purge cron (aidream) for data soft-deleted > 30 days.
- Verify no ad/analytics SDK reaches the education bundle; inventory analytics for minors.

**Needs Arman / legal:**
- Verifiable parental-consent *method* (COPPA §312.5) + age-change re-consent policy.
- Privacy policy + DPA/DUA templates + data-safety/nutrition labels + sub-processor list + breach commitment.
- Distribution decisions (App Store/Play/ChromeOS, district SSO, subdomain/brand separation).
