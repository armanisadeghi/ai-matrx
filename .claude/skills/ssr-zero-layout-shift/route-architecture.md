# Agents Route Architecture — Next.js App Router

> For Claude Opus Coding Agent. Assumes deep Next.js/React/Redux knowledge.

---

## Core Principles

1. **Layouts don't re-render on sibling navigation.** The `[id]/layout.tsx` fetches agent data once. Navigating `/agents/[id]` → `/agents/[id]/edit` → `/agents/[id]/run` never re-fetches and never re-renders the layout.
2. **No prop drilling from layout to pages.** Layouts cannot pass data to children. Instead, every component that needs data calls the same `cache()`-wrapped function. React deduplicates within the same request — one DB hit total.
3. **Redux hydration happens once** in the `[id]` layout via a thin client component. All pages read from the Redux store. No re-hydration on tab changes.
4. **`params` is a Promise** in Next.js 15+. Always `await params` — never destructure synchronously.

---

## File Structure

```
app/agents/
├── layout.tsx              # Agents section layout (fetches agent list for prefetch/cache)
├── page.tsx                # /agents — lists all agents (SSR)
├── loading.tsx             # Skeleton for the agent list page
├── error.tsx               # Error boundary for list-level failures
│
└── [id]/
    ├── layout.tsx          # Shared agent layout: header, tabs, Redux hydrator
    ├── page.tsx            # /agents/[id] — default view (also permission fallback)
    ├── loading.tsx         # Skeleton matching the tabbed agent detail layout
    ├── not-found.tsx       # Custom 404 for invalid/deleted UUIDs
    ├── error.tsx           # Error boundary for agent-level failures (preserves state)
    │
    ├── edit/
    │   ├── page.tsx        # /agents/[id]/edit
    │   └── loading.tsx     # Skeleton for edit form
    │
    └── run/
        ├── page.tsx        # /agents/[id]/run
        └── loading.tsx     # Skeleton for run interface
```

**URLs produced:**
- `/agents` — agent list
- `/agents/{uuid}` — view agent (default, permission fallback, catchall)
- `/agents/{uuid}/edit` — edit agent
- `/agents/{uuid}/run` — run agent

---

## Data Access Layer

Single cached function. One DB hit per server request regardless of how many components call it.

```ts
// lib/agents/data.ts
import { cache } from 'react'
import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'

export const getAgent = cache(async (id: string) => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .eq('agent_id', id)
    .single()

  if (error || !data) notFound()
  return data
})

export const getAgentList = cache(async () => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agents')
    .select('agent_id, name, description, status')
    .order('name')

  if (error) throw error
  return data ?? []
})
```

**Key:** `getAgent` calls `notFound()` directly — this triggers `[id]/not-found.tsx`. No need for null checks downstream.

---

## Redux Hydration Pattern

A thin client component that dispatches once on mount. Lives in the `[id]` layout. Does not render any UI.

```tsx
// app/agents/[id]/components/agent-hydrator.tsx
'use client'

import { useRef } from 'react'
import { useAppDispatch } from '@/lib/redux/hooks'
import { hydrateActiveAgent } from '@/lib/redux/slices/agentsSlice'
import type { Agent } from '@/types/agents'

export function AgentHydrator({ agent }: { agent: Agent }) {
  const dispatch = useAppDispatch()
  const hydrated = useRef(false)

  if (!hydrated.current) {
    dispatch(hydrateActiveAgent(agent))
    hydrated.current = true
  }

  return null
}
```

**Why `useRef` + sync dispatch, not `useEffect`:**
- `useEffect` fires after paint — pages would flash without data.
- This pattern hydrates during the first render pass, before any child reads from the store.
- `useRef` ensures it runs exactly once even with Strict Mode double-renders.

**The Redux action (`hydrateActiveAgent`)** should be a simple synchronous action (not a thunk) that sets the agent in the slice. The layout SSR-fetches; Redux just receives.

---

## Agents List Layout & Page

```tsx
// app/agents/layout.tsx
export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

```tsx
// app/agents/page.tsx
import { getAgentList } from '@/lib/agents/data'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Agents',
  description: 'Manage your AI agents',
}

export default async function AgentsListPage() {
  const agents = await getAgentList()
  // Render agent list. Full page replacement when drilling into [id].
  return <AgentListView agents={agents} />
}
```

---

## Agent Detail Layout (the core piece)

This is the persistent shell. It fetches the agent, hydrates Redux once, renders the shared header + tab navigation, and wraps all child pages.

```tsx
// app/agents/[id]/layout.tsx
import { getAgent } from '@/lib/agents/data'
import { AgentHydrator } from './components/agent-hydrator'
import { AgentHeader } from './components/agent-header'
import { AgentTabNav } from './components/agent-tab-nav'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const agent = await getAgent(id) // cache() — shared with layout render below

  return {
    title: {
      template: `%s | ${agent.name} | AI Matrx`,
      default: `${agent.name} | AI Matrx`,
    },
    description: agent.description,
  }
}

export default async function AgentDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const agent = await getAgent(id) // cache() — same request, zero extra DB calls

  return (
    <>
      <AgentHydrator agent={agent} />
      <AgentHeader agent={agent} />
      <AgentTabNav agentId={id} />
      <main>{children}</main>
    </>
  )
}
```

---

## Tab Navigation (Client Component for active state)

```tsx
// app/agents/[id]/components/agent-tab-nav.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { label: 'View', segment: '' },
  { label: 'Edit', segment: '/edit' },
  { label: 'Run', segment: '/run' },
] as const

export function AgentTabNav({ agentId }: { agentId: string }) {
  const pathname = usePathname()
  const base = `/agents/${agentId}`

  return (
    <nav>
      {TABS.map((tab) => {
        const href = `${base}${tab.segment}`
        const isActive =
          tab.segment === ''
            ? pathname === base
            : pathname.startsWith(href)

        return (
          <Link key={tab.label} href={href} data-active={isActive}>
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
```

**`<Link>` prefetches all tab routes automatically.** Tab switches are near-instant.

---

## Page Files

Each page is a Server Component. Each calls `getAgent()` independently (deduplicated by `cache()`). Each defines its own metadata title (filled into the layout's `%s` template).

### View (Default Page + Permission Fallback)

```tsx
// app/agents/[id]/page.tsx
import { getAgent } from '@/lib/agents/data'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const agent = await getAgent(id)
  return { title: `${agent.name}` }  // Renders: "AgentName | AI Matrx"
}

export default async function AgentViewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const agent = await getAgent(id)
  return <AgentViewContent agent={agent} />
}
```

### Edit

```tsx
// app/agents/[id]/edit/page.tsx
import { getAgent } from '@/lib/agents/data'
import { redirect } from 'next/navigation'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const agent = await getAgent(id)
  return { title: `Edit ${agent.name}` }  // "Edit AgentName | AI Matrx"
}

export default async function AgentEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const agent = await getAgent(id)

  // Permission check — redirect to view if unauthorized
  // const canEdit = await checkPermission(agent, 'edit')
  // if (!canEdit) redirect(`/agents/${id}`)

  return <AgentEditContent agent={agent} />
}
```

### Run

```tsx
// app/agents/[id]/run/page.tsx
import { getAgent } from '@/lib/agents/data'
import { redirect } from 'next/navigation'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const agent = await getAgent(id)
  return { title: `Run ${agent.name}` }  // "Run AgentName | AI Matrx"
}

export default async function AgentRunPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const agent = await getAgent(id)

  // Permission check — redirect to view if unauthorized
  // const canRun = await checkPermission(agent, 'run')
  // if (!canRun) redirect(`/agents/${id}`)

  return <AgentRunContent agent={agent} />
}
```

---

## Loading States (Realistic Skeletons)

Each `loading.tsx` should mirror the actual page layout with skeleton placeholders. These render **instantly** during navigation while the page Server Component resolves.

```tsx
// app/agents/loading.tsx
// Skeleton: grid/list of agent cards matching the list page layout
export default function AgentsListLoading() {
  return <AgentListSkeleton />
}
```

```tsx
// app/agents/[id]/loading.tsx
// Skeleton: matches the tabbed detail layout (header + tab bar + content area)
// This shows on INITIAL load of any /agents/[id]/* route.
// Tab-to-tab navigation is instant (layout persists), so this rarely appears after first load.
export default function AgentDetailLoading() {
  return <AgentDetailSkeleton />
}
```

```tsx
// app/agents/[id]/edit/loading.tsx
export default function AgentEditLoading() {
  return <AgentEditSkeleton />
}
```

```tsx
// app/agents/[id]/run/loading.tsx
export default function AgentRunLoading() {
  return <AgentRunSkeleton />
}
```

**Implementation note:** Skeleton components should be actual components that visually match the real UI using placeholder blocks/shimmer. They are NOT generic spinners.

---

## Error Handling

### Not Found (Invalid/Deleted UUIDs)

```tsx
// app/agents/[id]/not-found.tsx
// Triggered automatically when getAgent() calls notFound()
export default function AgentNotFound() {
  return (
    <div>
      <h2>Agent Not Found</h2>
      <p>This agent doesn't exist or has been deleted.</p>
      <Link href="/agents">Back to Agents</Link>
    </div>
  )
}
```

### Error Boundaries (Preserve State for Debugging)

```tsx
// app/agents/[id]/error.tsx
'use client' // error.tsx MUST be a Client Component

import { useEffect } from 'react'

export default function AgentError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log to your error reporting service
    console.error('Agent error:', error)
  }, [error])

  return (
    <div>
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      {error.digest && <p>Error ID: {error.digest}</p>}
      <button onClick={reset}>Try Again</button>
    </div>
  )
}
```

```tsx
// app/agents/error.tsx
'use client'

export default function AgentsListError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div>
      <h2>Failed to load agents</h2>
      <p>{error.message}</p>
      <button onClick={reset}>Retry</button>
    </div>
  )
}
```

**Key behavior:** `error.tsx` catches errors in its sibling `page.tsx` and all descendants, but NOT in its sibling `layout.tsx`. The layout persists even when the page errors, so the user keeps their navigation context.

---

## Component Hierarchy (Render Order)

For any route like `/agents/{uuid}/edit`:

```
app/layout.tsx                    ← Root layout (auth, theme, Redux Provider — ALREADY EXISTS)
└── app/agents/layout.tsx         ← Agents section wrapper
    └── app/agents/[id]/layout.tsx    ← Agent header + tabs + AgentHydrator
        └── app/agents/[id]/error.tsx     ← Error boundary
            └── app/agents/[id]/edit/loading.tsx  ← Suspense fallback (skeleton)
                └── app/agents/[id]/edit/page.tsx  ← Edit page content
```

---

## Checklist for Implementation

- [ ] `lib/agents/data.ts` — `getAgent` and `getAgentList` wrapped in `cache()`
- [ ] `app/agents/layout.tsx` — minimal wrapper
- [ ] `app/agents/page.tsx` — agent list (SSR)
- [ ] `app/agents/loading.tsx` — list skeleton
- [ ] `app/agents/error.tsx` — list error boundary
- [ ] `app/agents/[id]/layout.tsx` — fetches agent, renders header + tabs + `AgentHydrator`
- [ ] `app/agents/[id]/page.tsx` — view page (default + permission fallback)
- [ ] `app/agents/[id]/loading.tsx` — detail skeleton
- [ ] `app/agents/[id]/not-found.tsx` — custom 404 for bad UUIDs
- [ ] `app/agents/[id]/error.tsx` — detail error boundary
- [ ] `app/agents/[id]/edit/page.tsx` — edit page with permission guard
- [ ] `app/agents/[id]/edit/loading.tsx` — edit skeleton
- [ ] `app/agents/[id]/run/page.tsx` — run page with permission guard
- [ ] `app/agents/[id]/run/loading.tsx` — run skeleton
- [ ] `app/agents/[id]/components/agent-hydrator.tsx` — Redux one-shot hydration (client)
- [ ] `app/agents/[id]/components/agent-tab-nav.tsx` — tab nav with active state (client)
- [ ] `app/agents/[id]/components/agent-header.tsx` — shared agent header (server)
- [ ] Redux: `hydrateActiveAgent` action in agents slice (synchronous, not a thunk)
- [ ] Skeleton components for list, detail, edit, and run views

---

## Things NOT to Do

- **Don't use a Context/Provider** to share agent data between layout and pages. Use `cache()`.
- **Don't make the layout a Client Component.** It's a Server Component that renders a Client Component (`AgentHydrator`) as a child.
- **Don't pass agent data as props from layout to page.** Layouts cannot pass props to `children`.
- **Don't use `useEffect` for hydration.** It fires after paint and causes a flash. Use `useRef` guard with synchronous dispatch.
- **Don't destructure `params` synchronously.** It's a `Promise` in Next.js 15+.
- **Don't re-hydrate Redux on tab navigation.** The layout mounts once; hydration runs once.
