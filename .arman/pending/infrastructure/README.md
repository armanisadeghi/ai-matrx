# Infrastructure Stack — Overview

This folder tracks the full implementation status of the infrastructure services integrated into AI Matrx.

---

## Quick Reference

| Service | Category | Status | Doc |
|---------|----------|--------|-----|
| **Sentry** | Error Monitoring | Code done — needs env vars | [→](./sentry-error-monitoring.md) |
| **React Email** | Email Templates | Code done — preview ready | [→](./react-email.md) |
| **Upstash** | Rate Limiting | Code done — needs env vars | [→](./upstash-rate-limiting.md) |
| **PostHog** | Analytics + Flags | Code done — needs env vars | [→](./posthog-analytics.md) |
| **Axiom** | Logging | Documented — needs setup on both projects | [→](./axiom-logging.md) |
| **Typesense** | Search | Documented — needs Coolify deployment | [→](./typesense-search.md) |
| **Novu** | Multi-Channel Notifications | Documented — future build | [→](./novu-notifications.md) |

---

## Your Todo List

Everything below requires action from you. Code is already written where marked.

### Sentry — Error Monitoring
> Code is live. Credentials in `.env.local`. Add to Vercel to activate.

- [x] Projects created: `ai-matrx-admin` (Next.js) and `matrx-engine` (Python)
- [x] Credentials saved to `.env.local`
- [ ] Add to **Vercel** env vars: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, `NEXT_PUBLIC_SENTRY_ENV`
- [ ] Install Vercel integration in Sentry dashboard (one click → links deploys to releases)
- [ ] Add `SENTRY_DSN` + `SENTRY_ENV` to **Coolify** secrets for `matrx-engine`
- [ ] Install `sentry-sdk[fastapi]` and wire up in `matrx-engine` (see [sentry-error-monitoring.md](./sentry-error-monitoring.md) Part 2)

---

### PostHog — Analytics, Feature Flags, Session Replay
> Code is live. Credentials in `.env.local`. Add to Vercel to activate.

- [x] Project `AI Matrx Admin` created (US Cloud)
- [x] Credentials saved to `.env.local`
- [ ] Add to **Vercel** env vars: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
- [ ] After first deploy, verify pageviews appear in PostHog dashboard
- [ ] Create your first feature flag in PostHog dashboard (key: `beta-features`, start at 0% rollout)

---

### Upstash — Rate Limiting
> Code is live. Credentials in `.env.local`. Add to Vercel to activate.

- [x] Redis database `ai-matrx` created (us-east-1)
- [x] Credentials saved to `.env.local`
- [ ] Add to **Vercel** env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- [ ] Verify rate limiting is working after deploy: hit `/api/public/email` 6 times — 7th should 429

---

### React Email — Email Templates
> Templates are fully built. Preview server is ready.

- [ ] Run `pnpm email` to launch the email preview UI at `localhost:3001`
- [ ] Visually review all templates before they go to users
- [ ] Migrate remaining raw HTML templates in `lib/email/client.ts` → React components (see [react-email.md](./react-email.md) for the full list)
- [ ] Clean up `exportService.ts` `notificationTemplates` object once all are migrated

---

### Axiom — Structured Logging
> Nothing built yet — requires setup in both `ai-matrx-admin` and `matrx-engine`.

- [ ] Sign up at [axiom.co](https://axiom.co) — create dataset `ai-matrx-prod`
- [ ] Follow **Part 1** in [axiom-logging.md](./axiom-logging.md) for Next.js (Vercel Log Drain setup)
- [ ] Follow **Part 2** in [axiom-logging.md](./axiom-logging.md) for Python/FastAPI (`axiom-py` SDK)
- [ ] Add env vars to both Vercel and Coolify: `AXIOM_TOKEN`, `AXIOM_DATASET`

---

### Typesense — Full-Text Search
> Nothing built yet — requires Coolify deployment first.

- [ ] Deploy Typesense Docker service on Coolify (see [typesense-search.md](./typesense-search.md))
- [ ] Generate admin key + search-only key
- [ ] Add env vars to Vercel: `TYPESENSE_HOST`, `TYPESENSE_PORT`, `TYPESENSE_PROTOCOL`, `TYPESENSE_API_KEY`, `NEXT_PUBLIC_TYPESENSE_SEARCH_KEY`
- [ ] Create `lib/typesense/client.ts` (pattern is in the doc)
- [ ] Define schemas for prompts, canvases, notes, organizations
- [ ] Set up Supabase DB webhooks to sync records to Typesense on insert/update/delete

---

### Novu — Multi-Channel Notifications
> Nothing built yet. Revisit when mobile app launches or in-app notification bell is needed.

- [ ] (Future) Decide: Novu Cloud vs self-hosted
- [ ] (Future) Migrate `lib/email/notificationService.ts` to Novu triggers
- [ ] See [novu-notifications.md](./novu-notifications.md) for full migration plan

---

## Environment Variables Checklist

Copy this block into **Vercel → Settings → Environment Variables**. Values already in `.env.local`.

```bash
# Sentry — ✅ ready to paste
NEXT_PUBLIC_SENTRY_DSN=https://578a5e26d139318290c34448fc11f1ef@o4510915110633472.ingest.us.sentry.io/4510915215228928
SENTRY_DSN=https://578a5e26d139318290c34448fc11f1ef@o4510915110633472.ingest.us.sentry.io/4510915215228928
SENTRY_ORG=ai-matrx
SENTRY_PROJECT=ai-matrx-admin
SENTRY_AUTH_TOKEN=<YOUR_SENTRY_AUTH_TOKEN>
NEXT_PUBLIC_SENTRY_ENV=production

# PostHog — ✅ ready to paste
NEXT_PUBLIC_POSTHOG_KEY=phc_hmR5cCQgxaD7Bzff3V8bhkaYty4zW6qY91AJSvdoj6h
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

# Upstash — ✅ ready to paste
UPSTASH_REDIS_REST_URL=https://hot-cow-59579.upstash.io
UPSTASH_REDIS_REST_TOKEN=Aei7AAIncDJmMzQ2NDUxMzk1N2Q0MGQ1YWU3NzgyZTc5YmI3ZDAxOXAyNTk1Nzk

# Coolify (matrx-engine only — NOT Vercel)
MATRX_ENGINE_SENTRY_DSN=https://e2a9de7e9b6f2b15c6184821346fdcd9@o4510915110633472.ingest.us.sentry.io/4510915222437888

# Axiom (when ready)
AXIOM_TOKEN=
AXIOM_DATASET=ai-matrx-prod

# Typesense (when ready)
TYPESENSE_HOST=
TYPESENSE_PORT=443
TYPESENSE_PROTOCOL=https
TYPESENSE_API_KEY=
NEXT_PUBLIC_TYPESENSE_SEARCH_KEY=
```

---

## What Was Built (Code Summary)

### New Files
| File | Purpose |
|------|---------|
| `sentry.client.config.ts` | Sentry client init (Session Replay + error filters) |
| `sentry.server.config.ts` | Sentry server init |
| `sentry.edge.config.ts` | Sentry edge init |
| `lib/rate-limit/client.ts` | 6 named Upstash rate limiters |
| `lib/rate-limit/helpers.ts` | `ipRateLimit()` drop-in utility |
| `providers/PostHogProvider.tsx` | App Router pageview tracking + user identification |
| `lib/feature-flags.ts` | Server-side feature flag evaluation (`isFeatureEnabled`, `getFeatureFlag`, `getAllFlags`, typed `FLAGS` constant) |
| `lib/email/render.ts` | `renderTemplate()` — React Email → HTML string |
| `lib/email/templates/BaseLayout.tsx` | Shared brand header/footer for all emails |
| `lib/email/templates/WelcomeEmail.tsx` | Welcome email |
| `lib/email/templates/InvitationEmail.tsx` | Org + project invitations (+ reminders) |
| `lib/email/templates/NotificationEmail.tsx` | Task, comment, message, due date |
| `lib/email/templates/AuthEmail.tsx` | Invitation approved/rejected, password reset |
| `lib/email/templates/SharingEmail.tsx` | Resource shared, contact form (notification + confirmation) |
| `lib/email/templates/FeedbackEmail.tsx` | Feedback status, review request, user reply |
| `lib/email/templates/index.ts` | Barrel exports for all templates |

### Modified Files
| File | Change |
|------|--------|
| `next.config.js` | Wrapped with `withSentryConfig` |
| `app/layout.tsx` | Added `PostHogProvider` + `Suspense` wrapper |
| `app/Providers.tsx` | Added `identifyUser()` call after auth |
| `app/global-error.tsx` | Added `Sentry.captureException(error)` |
| `components/next-js/loading-error-not-found.tsx` | Added `Sentry.captureException(error)` |
| `app/api/public/email/route.ts` | Replaced in-memory rate limiter with Upstash |
| `app/api/contact/route.ts` | Added Upstash rate limiting |
| `lib/email/notificationService.ts` | Migrated 4 send functions to React Email templates |
| `package.json` | Added `"email": "email dev ..."` preview script |
