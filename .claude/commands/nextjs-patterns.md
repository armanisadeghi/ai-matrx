# Next.js 16 App Router Patterns

Enforce proper server/client component boundaries, shared services, and Next.js 16 patterns for the code at `$ARGUMENTS`.

---

## "use client" Enforcement (CRITICAL)

Only add `"use client"` when the component genuinely requires it.

### When Justified

| Requirement | Example |
|-------------|---------|
| React state hooks | `useState`, `useReducer` |
| Effect hooks | `useEffect`, `useLayoutEffect` |
| Ref hooks | `useRef` |
| Event handlers | `onClick`, `onChange` |
| Browser APIs | `window`, `localStorage` |
| Third-party client libs | Analytics, Agora |

### When It's a VIOLATION

```typescript
// ❌ No hooks, no events → remove "use client"
"use client";
export function Skeleton({ className }: Props) {
  return <div className={cn("animate-pulse", className)} />;
}

// ❌ Pure display → remove "use client"
"use client";
export function ProfileCard({ profile }: { profile: Profile }) {
  return <div><h2>{profile.name}</h2></div>;
}
```

**Rule:** If it uses no hooks, no events, and no browser APIs → remove `"use client"`.

---

## Shared Services Pattern

Keep business logic in services, not scattered in components.

| Scope | Location |
|-------|----------|
| Feature-specific | `features/[name]/service.ts` |
| Shared/reusable | `lib/services/[name].ts` |

```typescript
// lib/services/profiles.ts
import { createClient } from '@/utils/supabase/server'

export async function getUserProfile(userId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles').select('*').eq('user_id', userId).single()
  if (error) throw error
  return data
}
```

Both API routes and Server Components use the same service.

---

## Async Request APIs (Next.js 15/16)

These return Promises and MUST be awaited:

| API | Correct Usage |
|-----|---------------|
| `params` | `const { id } = await params` |
| `searchParams` | `const { page } = await searchParams` |
| `cookies()` | `const cookieStore = await cookies()` |
| `headers()` | `const headersList = await headers()` |

### Page Signature

```typescript
export default async function Page({ 
  params, searchParams 
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
}
```

---

## Route Handlers vs Server Actions

| Use Case | Use This |
|----------|----------|
| Webhooks (Stripe, etc.) | Route Handlers (`/api/`) |
| Third-party integrations | Route Handlers |
| Forms/mutations | Server Actions |
| Internal mutations | Server Actions |

Both should use shared services.

---

## Caching (Opt-In)

```typescript
async function getStaticData() {
  'use cache'
  cacheTag('static-data')
  cacheLife('hours')
  return await fetchData();
}

// Invalidation
import { revalidateTag } from 'next/cache'
revalidateTag('static-data');
```

---

## Route Handler Template

```typescript
import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    const data = await fetchResource(user.id)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
```

---

## Server Action Template

```typescript
'use server'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const schema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
})

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')
  
  const validated = schema.parse(Object.fromEntries(formData))
  const { error } = await supabase.auth.updateUser({ data: validated })
  if (error) throw new Error('Failed to update')
  
  revalidatePath('/profile')
  return { success: true }
}
```

---

## Common Errors

| Error | Fix |
|-------|-----|
| `params is not defined` | `await params` — it's a Promise |
| `cookies() is a function` | `const store = await cookies()` |
| `Cannot read properties of Promise` | `const { page } = await searchParams` |
| Type error with params | Add `Promise<>` wrapper to type |

---

## Pre-Completion Checklist

- [ ] `"use client"` only on components needing hooks/events/browser APIs
- [ ] Pure display components are Server Components
- [ ] Business logic in services, not Client Components
- [ ] All `params`, `searchParams` awaited with `Promise<>` types
- [ ] All `cookies()`, `headers()` awaited
- [ ] Services in `lib/services/` or `features/*/service.ts`

## Reference

| Location | Purpose |
|----------|---------|
| `@/utils/supabase/server` | Server Supabase client |
| `@/utils/supabase/client` | Browser Supabase client |
| `lib/services/` | Shared service functions |
| `features/[name]/service.ts` | Feature-specific services |
