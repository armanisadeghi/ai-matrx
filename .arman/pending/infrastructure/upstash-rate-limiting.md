# Upstash — Serverless Redis Rate Limiting & Caching

**Category:** Yes — This Project (ai-matrx-admin)
**Status:** Partially implemented

---

## What's Done

- `@upstash/ratelimit` and `@upstash/redis` installed
- `lib/rate-limit/client.ts` — centralized limiter definitions (5 rate limiters; `getPublicAppsRatelimiter()` removed `2026-08-11` with its dead route)
- `lib/rate-limit/helpers.ts` — `ipRateLimit()` and `checkRateLimit()` utility functions
- `app/api/public/email/route.ts` — migrated from in-memory to Upstash (5/hr per IP)
- `app/api/contact/route.ts` — added rate limiting (3/hr per IP)

## Pending Setup (Required to Activate)

### 1. Create Upstash Redis Database
1. Go to [console.upstash.com](https://console.upstash.com)
2. Create a new Redis database (free tier works for most use cases)
3. Select the region closest to your Vercel deployment (usually `us-east-1`)

### 2. Add Environment Variables

**Vercel Dashboard → Settings → Environment Variables:**
```
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=AXXXxxx...
```

Also add to `.env.local` for local development. Without these, rate limiting is **silently disabled** (fail-open behavior — requests are always allowed, which is safe for development).

---

## Rate Limiters Defined

| Limiter | Limit | Window | Used On |
|---------|-------|--------|---------|
| `getPublicEmailRatelimiter()` | 5 req | 1 hour | `/api/public/email` |
| `getAuthRatelimiter()` | 10 req | 15 min | Auth endpoints (to be added) |
| `getContactRatelimiter()` | 3 req | 1 hour | `/api/contact` |
| `getAiRatelimiter()` | 60 req | 1 min | AI routes (to be added) |
| `getApiRatelimiter()` | 200 req | 1 min | General authenticated routes |

All use **sliding window** algorithm — more accurate than fixed windows.

---

## Pending Tasks

### Additional Routes to Protect
- [ ] Auth endpoints (`/api/auth/**`) — add `getAuthRatelimiter()` keyed by IP
- [ ] Voice assistant (`/api/voice`, `/api/cartesia`, `/api/deepgram/**`) — add per-user limit
- [ ] Invitation endpoints (`/api/organizations/invite`, `/api/projects/invite`) — add per-user limit
- [ ] Test email route (`/api/test-email`) — restrict to admin users only

### Clean Up Old In-Memory Rate Limiters
- [ ] Delete or deprecate `lib/services/ip-rate-limiter.ts` (replaced by Upstash)
- [ ] Delete the in-memory map in `app/api/public/email/route.ts` (already done)
- [ ] Review `lib/services/guest-limit-service.ts` — decide if Supabase-based limits should be kept alongside or replaced

### Optional: Caching with Upstash
Upstash Redis can also cache expensive queries. Examples:

```typescript
import { Redis } from "@upstash/redis";
const redis = new Redis({ url: process.env.UPSTASH_REDIS_REST_URL!, token: process.env.UPSTASH_REDIS_REST_TOKEN! });

// Cache AI model list (changes rarely)
const cached = await redis.get("ai_models");
if (!cached) {
  const models = await fetchModels();
  await redis.setex("ai_models", 300, JSON.stringify(models)); // 5 min TTL
}
```

Candidates for caching:
- `GET /api/ai-models` — model list (5 min TTL)
- User profile data accessed frequently across requests
- Prompt template list for public apps

### Monitoring
- Upstash dashboard shows rate limit analytics (requests blocked, top offenders)
- Since all limiters are created with `analytics: true`, data flows automatically
