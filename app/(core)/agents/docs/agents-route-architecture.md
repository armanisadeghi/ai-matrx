# Agents Route Architecture — Next.js App Router

> For Claude Opus Coding Agent. Assumes deep Next.js/React/Redux knowledge.

---

## Core Principles

1. **Layouts don't re-render on sibling navigation.** The `[id]/layout.tsx` fetches the agent definition once. Navigating `/agents/[id]` → `/agents/[id]/edit` → `/agents/[id]/run` never re-fetches and never re-renders the layout.
2. **No prop drilling from layout to pages.** Layouts cannot pass data to children. Instead, every component that needs data calls the same `cache()`-wrapped function. React deduplicates within the same request — one DB hit total.
3. **Redux hydration happens once** in the `[id]` layout via a thin client component. All pages read from the Redux store. No re-hydration on tab changes.
4. **`params` is a Promise** in Next.js 15+. Always `await params` — never destructure synchronously.
5. **Nothing fetches until needed.** The only server-side fetch is the agent definition (required to render the shell). Everything else — execution history, version lists, dropdown options — is fetched on the client only when the user interacts with the UI that needs it. Use the IdleScheduler (`useIdleTask` at priority 5) for data that *will* be needed soon but isn't blocking render.
6. **Versions are a route segment.** Every agent URL includes an optional version number. Omitting it (or using `latest`) resolves to the most recent version. The version is resolved at the `[id]` layout level so all child pages share it.

---

## File Structure

```
app/(a)/agents/
├── layout.tsx              # Agents section layout (passthrough)
├── page.tsx                # /agents — lists all agents (SSR)
├── loading.tsx             # Skeleton for the agent list page
├── error.tsx               # Error boundary for list-level failures
│
└── [id]/
    ├── layout.tsx          # Shared agent layout: header, tabs, Redux hydrator, version resolution
    ├── not-found.tsx       # Custom 404 for invalid/deleted UUIDs
    ├── error.tsx           # Error boundary for agent-level failures (preserves layout)
    │
    └── [[...version]]/
        ├── page.tsx        # /agents/[id] or /agents/[id]/3 — default view
        ├── loading.tsx     # Skeleton for default view content area
        │
        ├── edit/
        │   ├── page.tsx    # /agents/[id]/edit or /agents/[id]/3/edit
        │   └── loading.tsx # Skeleton for edit form
        │
        └── run/
            ├── page.tsx    # /agents/[id]/run or /agents/[id]/3/run
            └── loading.tsx # Skeleton for run interface
```

**URLs produced:**
- `/agents` — agent list
- `/agents/{uuid}` — view agent (latest version, default)
- `/agents/{uuid}/edit` — edit agent (latest version)
- `/agents/{uuid}/run` — run agent (latest version)
- `/agents/{uuid}/3` — view agent at version 3
- `/agents/{uuid}/3/edit` — edit agent at version 3
- `/agents/{uuid}/3/run` — run agent at version 3
- `/agents/{uuid}/latest` — explicit latest (same as omitting version)

**How `[[...version]]` works:** This is an optional catch-all segment. When the URL is `/agents/{uuid}`, the `version` param is `undefined` (latest). When the URL is `/agents/{uuid}/3`, it's `['3']`. When it's `/agents/{uuid}/3/edit`, it's `['3', 'edit']`. The page files under `[[...version]]/` parse the segments to extract the version number and the sub-route (view/edit/run).

**Alternative:** If the catch-all parsing feels too complex, use `[version]/` as a required segment and always redirect bare `/agents/{uuid}` to `/agents/{uuid}/latest`. This trades a redirect for simpler param handling.

---

## Data Access Layer

Single cached function per concern. One DB hit per server request regardless of how many components call it.

**Thunk alignment (client):** Reads use Redux thunks in `features/agents/redux/agent-definition/thunks.ts`. Server Components cannot `dispatch` those thunks; use the **same Supabase calls** below with `createClient()` from `@/utils/supabase/server`. That keeps SSR, metadata, and client refetches consistent.

| Cached helper (SSR) | Client thunk | Supabase source |
|----------------------|--------------|-----------------|
| `getAgentList` | `fetchAgentsList` | `supabase.rpc('agx_get_list')` |
| `getAgent` | `fetchFullAgent` | `supabase.from('agx_agent').select('*').eq('id', id).single()` |
| `getAgentVersion` (numeric version) | `fetchAgentVersionSnapshot` | `supabase.rpc('agx_get_version_snapshot', { p_agent_id, p_version_number })` |
| `getAgentVersion` (latest / omitted) | `fetchFullAgent` | Same live row as `getAgent` — canonical “latest” is the current `agx_agent` row, not a separate history row |

**Version lists / pagination (not shown here):** `fetchAgentVersionHistory` → `agx_get_version_history`. Execution payloads use `fetchAgentExecutionMinimal` / `fetchAgentExecutionFull` → `agx_get_execution_minimal` / `agx_get_execution_full`.

```ts
// lib/agents/data.ts
import { cache } from 'react'
import 'server-only'
import { createClient } from '@/utils/supabase/server'
import { notFound } from 'next/navigation'
import { dbRowToAgentDefinition } from '@/features/agents/redux/agent-definition/converters'
import type { AgentDefinition } from '@/features/agents/types/agent-definition.types'

/** Same RPC as fetchAgentsList — owned + shared agents with access metadata. */
export const getAgentList = cache(async () => {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('agx_get_list')

  if (error) throw error
  return data ?? []
})

/**
 * Full live agent row. Same query as fetchFullAgent.
 * Map to AgentDefinition for hydration/UI using dbRowToAgentDefinition.
 */
export const getAgent = cache(async (id: string) => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agx_agent')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) notFound()
  return dbRowToAgentDefinition(data)
})

/**
 * Resolved definition for the URL version segment.
 * - latest / omitted: live row (identical to getAgent — cache() dedupes).
 * - N: historical snapshot; same RPC as fetchAgentVersionSnapshot.
 *
 * For snapshot rows, build AgentDefinition the same way the thunk does
 * (version_id as id, isVersion: true, parentAgentId: id, etc.) — see
 * fetchAgentVersionSnapshot in thunks.ts.
 */
export const getAgentVersion = cache(
  async (id: string, version?: string): Promise<AgentDefinition> => {
    if (!version || version === 'latest') {
      return getAgent(id)
    }

    const versionNum = parseInt(version, 10)
    if (isNaN(versionNum)) notFound()

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('agx_get_version_snapshot', {
      p_agent_id: id,
      p_version_number: versionNum,
    })

    if (error) notFound()

    const raw = Array.isArray(data) ? data[0] : data
    if (!raw) notFound()

    // Exact field mapping lives in fetchAgentVersionSnapshot (thunks.ts) before upsertAgent.
    // Extract: `versionSnapshotRowToAgentDefinition(parentAgentId, row)` next to that thunk.
    return versionSnapshotRowToAgentDefinition(id, raw)
  },
)
```

**Key:** `getAgent` and `getAgentVersion` call `notFound()` directly — this triggers `[id]/not-found.tsx`. No null checks downstream.

**DRY:** Implement `versionSnapshotRowToAgentDefinition` once (same payload `fetchAgentVersionSnapshot` passes to `upsertAgent`) and import it from `lib/agents/data.ts` and from the thunk body.

---

## Redux Hydration Pattern

A thin client component that dispatches once on mount. Lives in the `[id]` layout. Does not render any UI.

```tsx
// app/(a)/agents/[id]/components/agent-hydrator.tsx
'use client'

import { useRef } from 'react'
import { useAppDispatch } from '@/lib/redux/hooks'
import { upsertAgent } from '@/features/agents/redux/agent-definition/slice'
import type { AgentDefinition } from '@/features/agents/types/agent-definition.types'

// useRef persists across Strict Mode remount — dispatch fires exactly once.
// Do NOT convert to useEffect or useState.
export function AgentHydrator({ definition }: { definition: AgentDefinition }) {
  const dispatch = useAppDispatch()
  const hydrated = useRef(false)

  if (!hydrated.current) {
    dispatch(upsertAgent(definition))
    hydrated.current = true
  }

  return null
}
```

**Why `useRef` + sync dispatch, not `useEffect`:**
- `useEffect` fires after paint — pages would flash without data.
- This pattern hydrates during the first render pass, before any child reads from the store.
- `useRef` ensures it runs exactly once even with Strict Mode double-renders.

**Slice:** `upsertAgent` lives in `features/agents/redux/agent-definition/slice.ts`. It is synchronous (not a thunk). Thunks such as `fetchFullAgent` / `fetchAgentVersionSnapshot` end with the same `upsertAgent` after their network call.

**Layout vs version URL:** The `[id]` layout typically hydrates the **live** row (`getAgent`). If the user is on `/agents/{id}/3/...`, add a small client hydrator on the page that dispatches `upsertAgent` for the snapshot from `getAgentVersion` (or `dispatch(fetchAgentVersionSnapshot({ agentId, versionNumber }))`) so selectors keyed by `version_id` match the thunk behavior.

---

## Agents List Layout & Page

```tsx
// app/(a)/agents/layout.tsx
export default function AgentsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

```tsx
// app/(a)/agents/page.tsx
import { getAgentList } from '@/lib/agents/data'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Agents',
  description: 'Manage your AI agents',
}

export default async function AgentsListPage() {
  const agents = await getAgentList()
  return <AgentListView agents={agents} />
}
```

---

## Agent Detail Layout (the core piece)

This is the persistent shell. It fetches the agent definition + resolved version, hydrates Redux once, renders the shared header + tab navigation, and wraps all child pages.

The `[id]` layout resolves the version so that all child pages under `[[...version]]/` share the same cached version data.

```tsx
// app/(a)/agents/[id]/layout.tsx
import { getAgent, getAgentVersion } from '@/lib/agents/data'
import { AgentHydrator } from './components/agent-hydrator'
import { AgentHeader } from './components/agent-header'
import { AgentTabNav } from './components/agent-tab-nav'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const agent = await getAgent(id)

  return {
    title: {
      template: `%s | AI Matrx`,
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
  const agent = await getAgent(id)

  return (
    <>
      <AgentHydrator definition={agent} />
      <AgentHeader agent={agent} />
      <AgentTabNav agentId={id} />
      <main>{children}</main>
    </>
  )
}
```

**Note on version resolution:** The `[id]` layout fetches the agent definition. The version is resolved at the page level inside `[[...version]]/` since the version segment is a child of this layout. The layout does NOT need the version — it only needs the agent identity for the header and tabs. The pages parse the version from their own params and call `getAgentVersion()`.

---

## Version Segment Parsing

Each page under `[[...version]]/` receives the optional catch-all. A shared utility extracts the version and sub-route:

```ts
// app/(a)/agents/[id]/[[...version]]/parse-version.ts
export function parseVersionSegments(
  segments: string[] | undefined
): { version: string | undefined } {
  if (!segments || segments.length === 0) return { version: undefined }

  const first = segments[0]

  // If first segment is a number or "latest", it's a version
  if (first === 'latest' || /^\d+$/.test(first)) {
    return { version: first === 'latest' ? undefined : first }
  }

  // Otherwise it's a sub-route with no version (e.g., /edit, /run)
  return { version: undefined }
}
```

---

## Tab Navigation (Client Component for active state)

```tsx
// app/(a)/agents/[id]/components/agent-tab-nav.tsx
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
            ? pathname === base || /^\/agents\/[^/]+\/(\d+|latest)?$/.test(pathname)
            : pathname.includes(tab.segment)

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

**Note:** Tab links always point to the base (no version in URL). If the user is viewing a specific version, the version context is in Redux — the tab nav doesn't need to encode it in every link. Version-specific navigation is handled separately (e.g., a version selector dropdown).

---

## Page Files

Each page is a Server Component. Pages under `[[...version]]/` parse version from segments and call `getAgentVersion()` (deduplicated by `cache()`). The live definition comes from `getAgent()` (also cached, shared with layout). Both return `AgentDefinition` — for a historical version, `getAgentVersion` is the snapshot record (`id` = `version_id`, `isVersion: true`).

### View (Default Page)

```tsx
// app/(a)/agents/[id]/[[...version]]/page.tsx
import { getAgent, getAgentVersion } from '@/lib/agents/data'
import { parseVersionSegments } from './parse-version'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; version?: string[] }>
}) {
  const { id } = await params
  const agent = await getAgent(id)
  return { title: agent.name }  // Renders: "AgentName | AI Matrx"
}

export default async function AgentViewPage({
  params,
}: {
  params: Promise<{ id: string; version?: string[] }>
}) {
  const { id, version: segments } = await params
  const { version } = parseVersionSegments(segments)
  const agent = await getAgent(id)
  const agentVersion = await getAgentVersion(id, version)

  return <AgentViewContent agent={agent} version={agentVersion} />
}
```

### Edit

```tsx
// app/(a)/agents/[id]/[[...version]]/edit/page.tsx
import { getAgent, getAgentVersion } from '@/lib/agents/data'
import { parseVersionSegments } from '../parse-version'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; version?: string[] }>
}) {
  const { id } = await params
  const agent = await getAgent(id)
  return { title: `Edit ${agent.name}` }  // "Edit AgentName | AI Matrx"
}

export default async function AgentEditPage({
  params,
}: {
  params: Promise<{ id: string; version?: string[] }>
}) {
  const { id, version: segments } = await params
  const { version } = parseVersionSegments(segments)
  const agent = await getAgent(id)
  const agentVersion = await getAgentVersion(id, version)

  return <AgentEditContent agent={agent} version={agentVersion} />
}
```

### Run

```tsx
// app/(a)/agents/[id]/[[...version]]/run/page.tsx
import { getAgent, getAgentVersion } from '@/lib/agents/data'
import { parseVersionSegments } from '../parse-version'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; version?: string[] }>
}) {
  const { id } = await params
  const agent = await getAgent(id)
  return { title: `Run ${agent.name}` }  // "Run AgentName | AI Matrx"
}

export default async function AgentRunPage({
  params,
}: {
  params: Promise<{ id: string; version?: string[] }>
}) {
  const { id, version: segments } = await params
  const { version } = parseVersionSegments(segments)
  const agent = await getAgent(id)
  const agentVersion = await getAgentVersion(id, version)

  return <AgentRunContent agent={agent} version={agentVersion} />
}
```

---

## Loading States

Each `loading.tsx` mirrors the actual page layout with skeleton placeholders. These render **instantly** during navigation while the page Server Component resolves.

```tsx
// app/(a)/agents/loading.tsx
export default function AgentsListLoading() {
  return <AgentListSkeleton />
}
```

```tsx
// app/(a)/agents/[id]/[[...version]]/loading.tsx
// Content-area skeleton only. The layout (header + tabs) is already rendered.
export default function AgentViewLoading() {
  return <AgentViewSkeleton />
}
```

```tsx
// app/(a)/agents/[id]/[[...version]]/edit/loading.tsx
export default function AgentEditLoading() {
  return <AgentEditSkeleton />
}
```

```tsx
// app/(a)/agents/[id]/[[...version]]/run/loading.tsx
export default function AgentRunLoading() {
  return <AgentRunSkeleton />
}
```

**Implementation note:** Skeleton components should visually match the real UI using placeholder blocks/shimmer. They are NOT generic spinners. Since the layout shell (header + tabs) is already server-rendered and persistent, these skeletons only need to match the content area below the tabs.

---

## Error Handling

### Not Found (Invalid/Deleted UUIDs or Invalid Versions)

```tsx
// app/(a)/agents/[id]/not-found.tsx
// Triggered when getAgent() or getAgentVersion() calls notFound()
import Link from 'next/link'

export default function AgentNotFound() {
  return (
    <div>
      <h2>Agent Not Found</h2>
      <p>This agent or version doesn't exist.</p>
      <Link href="/agents">Back to Agents</Link>
    </div>
  )
}
```

### Error Boundaries

```tsx
// app/(a)/agents/[id]/error.tsx
'use client'

import { useEffect } from 'react'

export default function AgentError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
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
// app/(a)/agents/error.tsx
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

For any route like `/agents/{uuid}/3/edit`:

```
app/layout.tsx                                   ← Root layout (auth, theme, Redux Provider)
└── app/(a)/layout.tsx                               ← Shell layout (sidebar, header)
    └── app/(a)/agents/layout.tsx                        ← Agents section wrapper (passthrough)
        └── app/(a)/agents/[id]/layout.tsx                   ← Agent header + tabs + hydrator
            └── app/(a)/agents/[id]/error.tsx                    ← Error boundary
                └── app/(a)/agents/[id]/[[...version]]/edit/
                    ├── loading.tsx                                   ← Suspense skeleton
                    └── page.tsx                                     ← Edit page content
```

---

## Data Flow Summary

```
Server request for /agents/{uuid}/3/edit
│
├── [id]/layout.tsx
│   ├── getAgent(id)           ← cache() hit #1 — agx_agent row (same as fetchFullAgent)
│   ├── AgentHydrator          ← upsertAgent(live definition), sync, once
│   ├── AgentHeader            ← server-renders real header (name, status, etc.)
│   └── AgentTabNav            ← client component, reads pathname for active tab
│
└── [[...version]]/edit/page.tsx
    ├── getAgent(id)           ← cache() hit #1 — DEDUPLICATED, zero cost
    ├── getAgentVersion(id, "3") ← cache() hit #2 — agx_get_version_snapshot (fetchAgentVersionSnapshot)
    └── AgentEditContent       ← server-renders with live agent + snapshot as AgentDefinition
```

**Total DB hits: 2** for a **numeric** version route (live `agx_agent` + snapshot RPC). For **latest** (`version` omitted), `getAgentVersion` defers to `getAgent` — **1 hit** total.

The `cache()` wrapper ensures that even though `getAgent()` is called in `generateMetadata`, layout, and page, it executes exactly once.

**Everything else is client-side on demand:**
- Agent list after navigation → usually `dispatch(fetchAgentsList)` (same RPC as SSR list if you choose client-only list like `app/(ssr)/ssr/agents/page.tsx`)
- Version list for dropdown → `fetchAgentVersionHistory` when the panel opens (or `useIdleTask` at p5)
- Execution payload → `fetchAgentExecutionMinimal` / `fetchAgentExecutionFull` when Run/builder needs it
- Access metadata on a stale record → `fetchAgentAccessLevel`

---

## Checklist for Implementation

- [ ] `lib/agents/data.ts` — `getAgent` / `getAgentVersion` / `getAgentList` wrapped in `cache()`, backed by `agx_agent`, `agx_get_version_snapshot`, and `agx_get_list` (thunks: `fetchFullAgent`, `fetchAgentVersionSnapshot`, `fetchAgentsList`)
- [ ] `app/(a)/agents/layout.tsx` — passthrough wrapper
- [ ] `app/(a)/agents/page.tsx` — agent list (SSR)
- [ ] `app/(a)/agents/loading.tsx` — list skeleton
- [ ] `app/(a)/agents/error.tsx` — list error boundary
- [ ] `app/(a)/agents/[id]/layout.tsx` — fetches agent, renders header + tabs + `AgentHydrator`
- [ ] `app/(a)/agents/[id]/not-found.tsx` — custom 404 for bad UUIDs / invalid versions
- [ ] `app/(a)/agents/[id]/error.tsx` — detail error boundary
- [ ] `app/(a)/agents/[id]/[[...version]]/page.tsx` — view page (resolves version)
- [ ] `app/(a)/agents/[id]/[[...version]]/loading.tsx` — view content skeleton
- [ ] `app/(a)/agents/[id]/[[...version]]/edit/page.tsx` — edit page with version
- [ ] `app/(a)/agents/[id]/[[...version]]/edit/loading.tsx` — edit skeleton
- [ ] `app/(a)/agents/[id]/[[...version]]/run/page.tsx` — run page with version
- [ ] `app/(a)/agents/[id]/[[...version]]/run/loading.tsx` — run skeleton
- [ ] `app/(a)/agents/[id]/[[...version]]/parse-version.ts` — version segment parser
- [ ] `app/(a)/agents/[id]/components/agent-hydrator.tsx` — Redux one-shot hydration (client)
- [ ] `app/(a)/agents/[id]/components/agent-tab-nav.tsx` — tab nav with active state (client)
- [ ] `app/(a)/agents/[id]/components/agent-header.tsx` — shared agent header (server)
- [ ] Redux: `upsertAgent` from `agentDefinition` slice (sync); optional shared `versionSnapshotRowToAgentDefinition` for SSR + `fetchAgentVersionSnapshot`
- [ ] Skeleton components for list, view, edit, and run (content area only — layout is real)

---

## Things NOT to Do

- **Don't use a Context/Provider** to share agent data between layout and pages. Use `cache()`.
- **Don't make the layout a Client Component.** It's a Server Component that renders a Client Component (`AgentHydrator`) as a child.
- **Don't pass agent data as props from layout to page.** Layouts cannot pass props to `children`.
- **Don't use `useEffect` for hydration.** It fires after paint and causes a flash. Use `useRef` guard with synchronous dispatch.
- **Don't destructure `params` synchronously.** It's a `Promise` in Next.js 15+.
- **Don't re-hydrate Redux on tab navigation.** The layout mounts once; hydration runs once.
- **Don't fetch anything beyond the agent definition + version on the server.** Everything else is client-side, triggered by user interaction or deferred via the IdleScheduler.
- **Don't duplicate providers.** The global `Providers.tsx` tree already has Redux, theme, etc. Don't wrap agent pages in extra providers.
- **Don't call Supabase auth from client components.** User identity is in Redux. Use `selectIsAuthenticated`, `selectIsAdmin`, etc.
