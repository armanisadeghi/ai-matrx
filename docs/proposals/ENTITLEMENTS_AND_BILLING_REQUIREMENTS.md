# Entitlements, Billing & Conversion Funnel — Requirements

**Status:** proposal / not started · **Owner:** TBD (dedicated workstream) · **Created:** 2026-06-29

> This is a **forked workstream**, deliberately separated from the Education Hub build so it can be solidified on its own. The Education Hub (and every other feature) only ships **display-only** funnel markers today; this system is the real enforcement + billing layer the whole platform will adopt. A separate agent should own this end to end. Do not bolt billing logic into individual features — build the shared system described here and have features consume it.

## Goal

From day one, every surface is built to funnel toward conversion **without being annoying** — generous free tier, clear value, gentle nudges. The platform must be able to:

1. **Control what is free vs. paid** per capability, centrally and changeably (no hardcoded gates scattered in features).
2. **Offer trials** (time-boxed) and track their lifecycle.
3. **Meter usage** of expensive actions (AI generations, tutor turns, uploads) and **enforce** caps.
4. **Process payments** and manage subscriptions (Stripe).
5. **Track all of it in the database** as the source of truth (it is not, today).

## Current state (verified 2026-06-29)

**Mostly absent — this is greenfield.**

- **Stripe: dead.** Env vars live in `.env.dead`; no `stripe`/`@stripe/*` import, no checkout, no webhooks anywhere.
- **Plans: client-only marketing.** `features/pricing/data.ts` defines 8 plans + a hardcoded 14-day trial; UI nudges exist (`features/pricing/components/nudges/*`, `UpgradeModal`, `UsageLimitDialog`). **None is backed by the DB.**
- **What DOES exist (operational, not commercial):**
  - `public.account_tiers` — tier definitions with storage/upload/rate-limit quotas; `user_account.tier_id` assigns one tier per user (admin-assigned).
  - `public.user_usage_summary` — 6h/24h rolling request/token/**cost (millicents)** telemetry; `ai_model_pricing` defines per-model rates. **Cost is calculated, never charged.**
  - `public.user_storage_usage` + RPCs `check_upload_quota`, `check_rate_limit`, `check_guest_execution_limit` — enforce **file/rate** limits only.
- **Missing entirely:** `subscriptions`, `products`/`prices`, `billing_customers`, `payment_methods`, `invoices`, `entitlements`/`feature_flags`, `usage_credits`/ledger, `trial_ends_at` / `plan_id` / `subscription_status` on `users`/`organizations`. No plan-based feature gating, no paywall logic, no credit deduction.

## Requirements

### Data (DB is the source of truth)
- **Products & prices** — catalog of what's sold (mirror Stripe products/prices); monthly + annual.
- **Subscriptions** — customer ↔ plan ↔ status (`active`/`trialing`/`past_due`/`canceled`) with `trial_ends_at`, `current_period_end`; on user AND organization (seat-based for orgs).
- **Entitlements** — the resolved truth: "does this actor have capability X / how much of metered Y remains." A central resolver (RPC or service), not per-feature checks. Reuse the `iam.has_access` philosophy (one resolver, RLS-backed).
- **Usage metering → enforcement** — extend the existing usage telemetry into enforced caps (monthly AI-action budgets that reset). Optional credit ledger if pay-per-use is wanted.
- **Stripe integration** — checkout sessions, customer portal, webhooks (`app/api/stripe/webhook` — webhooks are a legitimate Next.js API-route use). Webhook → DB subscription state.

### Funnel model (grounded in June-2026 competitor research)
- **Keep all discovery/content pages free + crawlable** (the SEO acquisition layer). Never gate the page.
- **Meter the AI, not the core.** Follow **Knowt's generous model over StudyFetch's stingy one**: unlimited free core study (review/test/match, own flashcards); cap only expensive AI actions per month. **Place the cap AFTER the aha-moment** (users are ~3.5× more likely to convert at a meaningful cap than an early one).
- **Two paywall surfaces:** (1) an **in-context upgrade prompt** fired the moment a free user hits the cap or a Pro-only mode (where conversion happens), and (2) a `/pricing` comparison page (the closer) using cumulative **"Everything in Free, plus:"** framing.
- **Labels:** short tier badge ("Pro"/"Plus") with a Lucide icon (Crown/Sparkles/Lock) — **no emoji** (enterprise UI rule). Reserve blur-overlay + "Unlock" only for premium answer content.
- **Optional:** Course-Hero-style **contribution unlock** (earn AI credits by contributing quality study sets) — relieves the paywall and feeds the content library.

### Consumption contract (how features plug in)
- A single hook/selector — e.g. `useEntitlement(capability)` / `selectEntitlement` — returns `{ allowed, remaining, tier, reason }`. Features render gates/nudges from this; they never read plan tables directly.
- The existing display-only markers become real: `features/education` `AccessTierBadge` (`free`/`trial`/`premium` on every `AxisEntry`/`EduToolEntry`) and `AuthedWorkspaceCTA` are the seams the funnel must wire into. `features/pricing` nudges become entitlement-driven.

## Out of scope here
Per-feature UI polish (each feature owns its own gate presentation, fed by the shared resolver). This doc owns the shared data model, resolver, Stripe wiring, and funnel mechanics.

## References
- Competitor funnel research (Quizlet/Course Hero/Chegg/Khan/Brainscape/Knowt/StudyFetch) — summarized above.
- Education Hub consumer: [`features/education/FEATURE.md`](../../features/education/FEATURE.md).
- Existing pricing UI to repurpose: `features/pricing/`.
