---
name: nextjs-app-router-expert
description: Enforces proper server/client component boundaries, shared service patterns, and Next.js 15/16 patterns. Use when working with Next.js pages, components, API routes, data fetching, or when reviewing component architecture. Applies to all code in the AI Matrx project.
---

# Next.js 15/16 App Router Expert

> **Official guide:** `~/.arman/rules/nextjs-best-practices/nextjs-guide.md`
> Sections 5, 10, 12, and 16 cover "use client" enforcement, async APIs, API route patterns, and performance.
> This skill provides the enforcement audit workflow. Use the official guide for reference patterns.

**Your job:** Enforce proper component boundaries, shared service patterns, and Next.js 15/16 patterns.

---

## VIOLATION #1: Unnecessary "use client" Directives (CRITICAL)

**Only add `"use client"` when the component genuinely requires it.**

### When "use client" IS Required

| Requirement | Example |
|-------------|---------|
| React state hooks | `useState`, `useReducer` |
| Effect hooks | `useEffect`, `useLayoutEffect` |
| Ref hooks | `useRef`, `useImperativeHandle` |
| Event handlers | `onClick`, `onChange`, `onSubmit` |
| Browser APIs | `window`, `localStorage`, `navigator` |
| Third-party client libs | Analytics SDKs, Agora, etc. |

### When "use client" is a VIOLATION

```typescript
// ❌ VIOLATION — No hooks, no events, no browser APIs
"use client";
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-md bg-gray-200", className)} />;
}

// ❌ VIOLATION — Pure display component
"use client";
export function UserAvatar({ src, name }: AvatarProps) {
  return <img src={src} alt={name} className="rounded-full" />;
}

// ❌ VIOLATION — Only receives and displays props
"use client";
export function ProfileCard({ profile }: { profile: Profile }) {
  return (
    <div>
      <h2>{profile.name}</h2>
      <p>{profile.bio}</p>
    </div>
  );
}
```

### Correct Versions

```typescript
// ✅ CORRECT — Remove unnecessary directive
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-md bg-gray-200", className)} />;
}

// ✅ CORRECT — "use client" justified by onClick and useState
"use client";
export function LikeButton({ itemId }: { itemId: string }) {
  const [liked, setLiked] = useState(false);
  return <button onClick={() => setLiked(!liked)}>♥</button>;
}
```

### Enforcement

When reviewing or creating components:

1. **Does it use hooks?** → `"use client"` justified
2. **Does it have event handlers?** → `"use client"` justified
3. **Does it access browser APIs?** → `"use client"` justified
4. **None of the above?** → **Remove `"use client"`**

---

## VIOLATION #2: Business Logic in Client Components

**Keep business logic in shared services, not scattered in components.**

### The Pattern

| Location | Direct Supabase Query | Via Service |
|----------|----------------------|-------------|
| Client Components | ⚠️ Avoid | ✅ Preferred |
| Server Components | ✅ Via service | ✅ Via service |
| API Routes (`/api/...`) | ✅ Via service | ✅ Via service |
| Server Actions | ✅ Via service | ✅ Via service |

### Service Locations

| Scope | Location |
|-------|----------|
| Feature-specific | `features/[feature-name]/service.ts` |
| Shared/reusable | `lib/services/[name].ts` |

### Correct Pattern

```typescript
// ✅ CORRECT — Shared service
// lib/services/users.ts or features/users/service.ts
import { createClient } from '@/utils/supabase/server'

export async function getUserProfile(userId: string) {
  const supabase = await createClient()
  return supabase.from("profiles").select("*").eq("user_id", userId).single()
}

// ✅ API route uses service
// app/api/users/me/route.ts
import { getUserProfile } from '@/lib/services/users'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const { data } = await getUserProfile(user.id)
  return NextResponse.json({ success: true, data })
}

// ✅ Server Component uses same service
// app/(authenticated)/profile/page.tsx
import { getUserProfile } from '@/lib/services/users'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  const { data: profile } = await getUserProfile(user.id)
  return <ProfileView profile={profile} />
}
```

---

## Async Request APIs (Next.js 15/16)

These APIs return Promises and MUST be awaited:

| API | Correct Usage |
|-----|---------------|
| `params` | `const { id } = await params` |
| `searchParams` | `const { page } = await searchParams` |
| `cookies()` | `const cookieStore = await cookies()` |
| `headers()` | `const headersList = await headers()` |

### Page Signature

```typescript
export default async function Page({ 
  params, 
  searchParams 
}: { 
  params: Promise<{ id: string }>,
  searchParams: Promise<Record<string, string>>
}) {
  const { id } = await params;
  const { page } = await searchParams;
}
```

### Route Handler Signature

```typescript
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const cookieStore = await cookies();
}
```

---

## Route Handlers vs Server Actions

| Use Case | Use This |
|----------|----------|
| Webhooks (Stripe, etc.) | **Route Handlers** (`/api/...`) |
| Third-party integrations | **Route Handlers** |
| Forms/mutations | **Server Actions** |
| Internal mutations | **Server Actions** |

**Both should use shared services.**

---

## Caching (Opt-In)

Next.js 15/16 caching is explicit:

```typescript
async function getStaticData() {
  'use cache'
  cacheTag('static-data')
  cacheLife('hours')  // Presets: seconds, minutes, hours, days, max
  return await fetchData();
}

// Invalidation
import { revalidateTag } from 'next/cache'

export async function mutateData() {
  await updateData();
  revalidateTag('static-data');
}
```

---

## Pre-Completion Checklist

### Component Boundaries

- [ ] `"use client"` only on components that need hooks/events/browser APIs
- [ ] Pure display components are Server Components
- [ ] Business logic NOT in Client Components

### Next.js 15/16 Patterns

- [ ] All `params`, `searchParams` awaited
- [ ] All `cookies()`, `headers()` awaited
- [ ] Types include `Promise<>` wrappers

### Services

- [ ] Business logic extracted to services in `lib/services/` or `features/*/service.ts`
- [ ] API routes and Server Components use shared services

---

## What NOT to Do

- ❌ **NEVER** add `"use client"` to pure display components
- ❌ Don't put business logic in Client Components
- ❌ Don't access `params`/`searchParams` synchronously
- ❌ Don't duplicate logic across API routes and pages (use shared services)

---

## Reference

| Location | Purpose |
|----------|---------|
| `@/utils/supabase/server` | Server-side Supabase client |
| `@/utils/supabase/client` | Browser Supabase client |
| `lib/services/` | Shared service functions |
| `features/[name]/service.ts` | Feature-specific services |

For detailed templates, see [nextjs16-patterns-reference.md](nextjs16-patterns-reference.md).
