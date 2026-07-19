# Next.js 15/16 Patterns Reference

> **Official guide:** `~/.arman/rules/nextjs-best-practices/nextjs-guide.md` — covers all patterns below and more. This file provides project-specific copy-paste templates for AI Matrx.

Detailed code patterns and templates for AI Matrx Next.js 15/16 implementation.

---

## Shared Services Pattern

Extract reusable data access into services.

### Step 1: Create Service

```typescript
// lib/services/profiles.ts
import { createClient } from '@/utils/supabase/server'

export async function getUserProfile(userId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single()
  
  if (error) throw error
  return data
}

export async function updateUserProfile(userId: string, updates: Partial<Profile>) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('user_id', userId)
    .select()
    .single()
  
  if (error) throw error
  return data
}
```

### Step 2: Use in API Route

```typescript
// app/api/users/me/route.ts
import { createClient } from '@/utils/supabase/server'
import { getUserProfile, updateUserProfile } from '@/lib/services/profiles'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  const profile = await getUserProfile(user.id)
  return NextResponse.json({ success: true, data: profile })
}
```

### Step 3: Use in Server Component

```typescript
// app/(authenticated)/profile/page.tsx — Server Component
import { createClient } from '@/utils/supabase/server'
import { getUserProfile } from '@/lib/services/profiles'
import { redirect } from 'next/navigation'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) redirect('/login')
  
  const profile = await getUserProfile(user.id)
  return <ProfileView profile={profile} />
}
```

---

## Removing Unnecessary "use client"

### Audit Checklist

When reviewing a `"use client"` component, check:

| Check | If NO → Remove "use client" |
|-------|----------------------------|
| Uses `useState`? | |
| Uses `useEffect`? | |
| Uses `useRef`? | |
| Uses any other hook? | |
| Has `onClick`, `onChange`, etc.? | |
| Uses `window`, `localStorage`, etc.? | |

### Before/After Examples

```typescript
// ❌ BEFORE: Unnecessary "use client"
"use client";
import { cn } from "@/lib/utils";

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn("rounded-lg border bg-white p-4", className)}>
      {children}
    </div>
  );
}

// ✅ AFTER: Server Component
import { cn } from "@/lib/utils";

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn("rounded-lg border bg-white p-4", className)}>
      {children}
    </div>
  );
}
```

```typescript
// ❌ BEFORE: "use client" for props display only
"use client";

export function UserInfo({ user }: { user: User }) {
  return (
    <div>
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
}

// ✅ AFTER: Server Component
export function UserInfo({ user }: { user: User }) {
  return (
    <div>
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
}
```

---

## Route Handler Template

```typescript
// app/api/[resource]/route.ts
import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const updateSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
})

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const data = await fetchResource(user.id)
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const validated = updateSchema.parse(body)
    
    const result = await updateResource(user.id, validated)
    
    return NextResponse.json({ success: true, data: result })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', errors: error.errors },
        { status: 400 }
      )
    }
    console.error('API Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

---

## Dynamic Route Handler Template

For routes with `[id]` or other dynamic segments.

```typescript
// app/api/[resource]/[id]/route.ts
import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params  // MUST await in Next.js 15/16
    
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const data = await fetchResourceById(id, user.id)
    
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Not found' },
        { status: 404 }
      )
    }
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      )
    }

    await deleteResource(id, user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('API Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

---

## Page Component Template

For pages with dynamic params and searchParams.

```typescript
// app/(authenticated)/[resource]/[id]/page.tsx
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ tab?: string; filter?: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const data = await fetchResource(id)
  
  return {
    title: data?.name ?? 'Not Found',
  }
}

export default async function ResourcePage({ params, searchParams }: PageProps) {
  const { id } = await params
  const { tab = 'overview', filter } = await searchParams
  
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    notFound()
  }
  
  const data = await fetchResource(id)
  
  if (!data) {
    notFound()
  }
  
  return (
    <div>
      <h1>{data.name}</h1>
      {/* Render based on tab */}
    </div>
  )
}
```

---

## Server Action Template

For mutations.

```typescript
// app/actions/profile.ts
'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const updateProfileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  bio: z.string().max(500).optional(),
})

export async function updateProfile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    throw new Error('Unauthorized')
  }
  
  const raw = Object.fromEntries(formData)
  const validated = updateProfileSchema.parse(raw)
  
  // Update user metadata in auth.users (use supabase.auth.updateUser)
  const { error } = await supabase.auth.updateUser({
    data: validated // Updates user_metadata
  })
  
  if (error) {
    throw new Error('Failed to update profile')
  }
  
  revalidatePath('/profile')
  return { success: true }
}
```

---

## Layout with Auth Check

```typescript
// app/(authenticated)/layout.tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect('/login')
  }
  
  return (
    <>
      <PageHeader>{/* route chrome if needed */}</PageHeader>
      <div className="h-full flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </>
  )
}
```

---

## Client Component with Server Action

```typescript
// components/LikeButton.tsx
'use client'

import { useState, useTransition } from 'react'
import { toggleLike } from '@/app/actions/likes'
import { Heart } from 'lucide-react'

interface LikeButtonProps {
  itemId: string
  initialLiked: boolean
}

export function LikeButton({ itemId, initialLiked }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked)
  const [isPending, startTransition] = useTransition()
  
  const handleClick = () => {
    // Optimistic update
    setLiked(!liked)
    
    startTransition(async () => {
      try {
        const result = await toggleLike(itemId)
        setLiked(result.liked)
      } catch {
        // Revert on error
        setLiked(liked)
      }
    })
  }
  
  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="p-2 rounded-full"
    >
      <Heart
        className={liked ? 'fill-red-500 text-red-500' : 'text-gray-400'}
      />
    </button>
  )
}
```

---

## Cached Data Fetching

For data that doesn't change frequently.

```typescript
// lib/services/events.ts
import { cacheLife, cacheTag } from 'next/cache'
import { createClient } from '@/utils/supabase/server'

export async function getUpcomingEvents() {
  'use cache'
  cacheTag('events')
  cacheLife('hours')  // Refresh every hour
  
  const supabase = await createClient()
  
  const { data } = await supabase
    .from('events')
    .select('*')
    .gte('start_date', new Date().toISOString())
    .order('start_date', { ascending: true })
    .limit(20)
  
  return data ?? []
}

// Invalidation (call from Server Action after event creation)
import { revalidateTag } from 'next/cache'

export async function createEvent(data: EventData) {
  // ... create event
  revalidateTag('events')
}
```

---

## Type Definitions

```typescript
// types/next.ts

// Page props with async params
export interface PageProps<
  TParams extends Record<string, string> = Record<string, string>,
  TSearchParams extends Record<string, string> = Record<string, string>
> {
  params: Promise<TParams>
  searchParams: Promise<TSearchParams>
}

// Layout props
export interface LayoutProps {
  children: React.ReactNode
  params: Promise<Record<string, string>>
}

// Route handler context
export interface RouteContext<TParams extends Record<string, string>> {
  params: Promise<TParams>
}

// Usage example
export default async function UserPage({ params }: PageProps<{ id: string }>) {
  const { id } = await params
  // ...
}
```

---

## Common Errors and Fixes

### "params is not defined"

```typescript
// ❌ Error
export async function GET(request: Request, { params }) {
  const { id } = params  // params is Promise, not object
}

// ✅ Fix
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
}
```

### "cookies() is a function, not a cookies object"

```typescript
// ❌ Error
const session = cookies().get('session')

// ✅ Fix
const cookieStore = await cookies()
const session = cookieStore.get('session')
```

### "Cannot read properties of Promise"

```typescript
// ❌ Error
export default async function Page({ searchParams }) {
  const page = searchParams.page  // searchParams is Promise

// ✅ Fix
export default async function Page({ 
  searchParams 
}: { 
  searchParams: Promise<{ page?: string }> 
}) {
  const { page } = await searchParams
}
```

### Type error with params

```typescript
// ❌ Error: Property 'slug' does not exist on type 'Promise<...>'
function Page({ params }: { params: { slug: string } }) {
  return <div>{params.slug}</div>
}

// ✅ Fix: Add Promise wrapper and await
async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <div>{slug}</div>
}
```
