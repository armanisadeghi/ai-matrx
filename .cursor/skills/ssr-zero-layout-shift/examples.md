# SSR Zero Layout Shift — Examples

Real-world component examples composing all five patterns with cache components.

---

## Example 1: Data Table Page

Full page with cached column config, dynamic user-specific data, and interactive sort/filter.

```tsx
// app/(authenticated)/agents/page.tsx — Server Component
import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import { cookies } from 'next/headers'
import PageHeader from '@/features/shell/components/header/PageHeader'

export default function AgentsPage() {
  return (
    <>
      <PageHeader>
        <div className="flex items-center justify-between w-full min-w-0">
          <h1 className="text-sm font-semibold truncate">Agents</h1>
          <Suspense fallback={<div className="h-9 w-24 animate-pulse rounded-md bg-muted" />}>
            <CreateAgentButton />
          </Suspense>
        </div>
      </PageHeader>
      <div className="h-full flex flex-col overflow-hidden">
        {/* Cached: column definitions rarely change */}
        <Suspense fallback={<FilterBarSkeleton />}>
          <FilterBar />
        </Suspense>

        {/* Dynamic: user-specific agent list */}
        <Suspense fallback={<TableSkeleton rows={10} />}>
          <AgentTable />
        </Suspense>
      </div>
    </>
  )
}

// Cached Server Component — column config and filter options
async function FilterBar() {
  'use cache'
  cacheLife('hours')
  cacheTag('agent-filters')

  const categories = await getAgentCategories()
  return (
    <div className="h-10 flex items-center gap-2">
      {/* Interactive filter is a thin client island */}
      <FilterDropdownClient categories={categories} />
      <SearchInputClient />
    </div>
  )
}

// Dynamic Server Component — reads cookies, streams into sized hole
async function AgentTable() {
  const userId = (await cookies()).get('userId')?.value
  const agents = await getUserAgents(userId!)
  return (
    <div className="flex-1 overflow-auto">
      <table className="w-full">
        <thead className="h-10 sticky top-0 bg-card border-b">
          <tr>
            <th className="px-4 text-left text-sm font-medium">Name</th>
            <th className="px-4 text-left text-sm font-medium">Status</th>
            <th className="px-4 text-left text-sm font-medium">Last Run</th>
          </tr>
        </thead>
        <tbody>
          {agents.map(agent => (
            <tr key={agent.id} className="h-12 border-b">
              <td className="px-4">{agent.name}</td>
              <td className="px-4">{agent.status}</td>
              <td className="px-4">{agent.lastRun}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Dimension-matched skeletons
function FilterBarSkeleton() {
  return (
    <div className="h-10 flex items-center gap-2">
      <div className="h-10 w-40 animate-pulse rounded-md bg-muted" />
      <div className="h-10 w-64 animate-pulse rounded-md bg-muted" />
    </div>
  )
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex-1 overflow-hidden">
      <table className="w-full">
        <thead className="h-10 sticky top-0 bg-card border-b">
          <tr>
            <th className="px-4"><Skeleton className="h-4 w-16" /></th>
            <th className="px-4"><Skeleton className="h-4 w-16" /></th>
            <th className="px-4"><Skeleton className="h-4 w-16" /></th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i} className="h-12 border-b">
              <td className="px-4"><Skeleton className="h-4 w-24" /></td>
              <td className="px-4"><Skeleton className="h-4 w-16" /></td>
              <td className="px-4"><Skeleton className="h-4 w-20" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

---

## Example 2: Form with Multiple Dropdowns

Server Component form shell with multiple data-fetching dropdowns, each streaming independently.

```tsx
// app/(authenticated)/agents/new/page.tsx
import { Suspense } from 'react'
import PageHeader from '@/features/shell/components/header/PageHeader'

export default function NewAgentPage() {
  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold truncate">Create Agent</h1>
      </PageHeader>
      <div className="h-full flex flex-col overflow-hidden p-6">

      <form className="max-w-lg space-y-6">
        {/* Static field — instant */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Name</label>
          <input
            type="text"
            className="h-10 w-full rounded-md border px-3 text-base"
            placeholder="Agent name"
          />
        </div>

        {/* Each dropdown streams independently */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Model</label>
          <Suspense fallback={<SelectSkeleton />}>
            <ModelSelectServer />
          </Suspense>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Category</label>
          <Suspense fallback={<SelectSkeleton />}>
            <CategorySelectServer />
          </Suspense>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Tools</label>
          <Suspense fallback={<MultiSelectSkeleton />}>
            <ToolsMultiSelectServer />
          </Suspense>
        </div>

        <button type="submit" className="h-10 w-full rounded-md bg-primary text-primary-foreground">
          Create Agent
        </button>
      </form>
      </div>
    </>
  )
}

// Each async Server Component fetches its own data
async function ModelSelectServer() {
  const models = await getModels()
  return (
    <div className="h-10 w-full">
      <ModelSelectClient models={models} />
    </div>
  )
}

async function CategorySelectServer() {
  const categories = await getCategories()
  return (
    <div className="h-10 w-full">
      <CategorySelectClient categories={categories} />
    </div>
  )
}

async function ToolsMultiSelectServer() {
  const tools = await getAvailableTools()
  return (
    <div className="min-h-10 w-full">
      <ToolsMultiSelectClient tools={tools} />
    </div>
  )
}

// Skeletons match exact container dimensions
function SelectSkeleton() {
  return <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
}

function MultiSelectSkeleton() {
  return <div className="min-h-10 w-full animate-pulse rounded-md bg-muted" />
}
```

---

## Example 3: Dashboard with Cached + Dynamic Sections

Three content tiers in one page: static shell, cached stats, dynamic user feed.

```tsx
// app/(authenticated)/dashboard/page.tsx
import { Suspense } from 'react'
import { cacheLife, cacheTag } from 'next/cache'
import { cookies } from 'next/headers'
import PageHeader from '@/features/shell/components/header/PageHeader'

export default function DashboardPage() {
  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-semibold truncate">Dashboard</h1>
      </PageHeader>
      <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-4 space-y-6">
        {/* Tier 2: Cached — revalidates hourly */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Suspense fallback={<MetricSkeleton />}>
            <TotalAgentsMetric />
          </Suspense>
          <Suspense fallback={<MetricSkeleton />}>
            <ExecutionsMetric />
          </Suspense>
          <Suspense fallback={<MetricSkeleton />}>
            <SuccessRateMetric />
          </Suspense>
        </div>

        {/* Tier 3: Dynamic — user-specific, always fresh */}
        <section>
          <h2 className="text-base font-medium mb-3">Recent Activity</h2>
          <Suspense fallback={<ActivityFeedSkeleton />}>
            <RecentActivityFeed />
          </Suspense>
        </section>
      </div>
      </div>
    </>
  )
}

// Cached Server Component
async function TotalAgentsMetric() {
  'use cache'
  cacheLife('hours')
  cacheTag('dashboard-metrics')

  const count = await getTotalAgents()
  return (
    <div className="h-28 rounded-lg border bg-card p-4 flex flex-col justify-between">
      <p className="text-sm text-muted-foreground">Total Agents</p>
      <p className="text-3xl font-bold">{count}</p>
    </div>
  )
}

// Dynamic Server Component — user-scoped
async function RecentActivityFeed() {
  const userId = (await cookies()).get('userId')?.value
  const activity = await getRecentActivity(userId!)
  return (
    <ul className="space-y-2">
      {activity.map(item => (
        <li key={item.id} className="h-16 flex items-center gap-3 rounded-lg border bg-card px-4">
          <div className="h-8 w-8 rounded-full bg-muted" />
          <div>
            <p className="text-sm font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.timestamp}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}

// Dimension-matched skeletons
function MetricSkeleton() {
  return (
    <div className="h-28 rounded-lg border bg-card p-4 flex flex-col justify-between">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-8 w-16" />
    </div>
  )
}

function ActivityFeedSkeleton() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="h-16 flex items-center gap-3 rounded-lg border bg-card px-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </li>
      ))}
    </ul>
  )
}
```

---

## Example 4: Lazy-Loaded Modal with next/dynamic

Modal component code loads only when user clicks the trigger button.

```tsx
// AgentActions.tsx — Server Component renders trigger
import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const AgentConfigModal = dynamic(() => import('./AgentConfigModal'), {
  ssr: false,
  loading: () => null, // Modal has no layout footprint when closed
})

export function AgentActions({ agentId }: { agentId: string }) {
  return (
    <div className="flex gap-2">
      {/* Trigger is server-rendered, visible immediately */}
      <ConfigButton agentId={agentId} />
    </div>
  )
}
```

```tsx
// ConfigButton.tsx — thin client island for the trigger
'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const AgentConfigModal = dynamic(() => import('./AgentConfigModal'), { ssr: false })

export function ConfigButton({ agentId }: { agentId: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="h-9 px-3 rounded-md border text-sm"
      >
        Configure
      </button>
      {open && <AgentConfigModal agentId={agentId} onClose={() => setOpen(false)} />}
    </>
  )
}
```

---

## Example 5: Cache Invalidation After Mutation

Server Action invalidates cached data; Suspense re-streams the updated content.

```tsx
// actions.ts
'use server'

import { updateTag } from 'next/cache'

export async function updateAgent(id: string, data: FormData) {
  await db.agents.update({ where: { id }, data: { name: data.get('name') as string } })
  updateTag(`agent-${id}`)
  updateTag('dashboard-metrics')
}
```

```tsx
// AgentDetail.tsx — cached, invalidated by the action above
async function AgentDetail({ agentId }: { agentId: string }) {
  'use cache'
  cacheLife('hours')
  cacheTag(`agent-${agentId}`)

  const agent = await getAgent(agentId)
  return (
    <div className="h-auto min-h-20 rounded-lg border bg-card p-4">
      <h2 className="text-lg font-semibold">{agent.name}</h2>
      <p className="text-sm text-muted-foreground">{agent.description}</p>
    </div>
  )
}
```

The page wraps `<AgentDetail>` in `<Suspense>` with a dimension-matched skeleton. After `updateAgent` runs, the cache tag invalidates and the next request streams fresh data into the same sized hole.

---

## Example 6: Interaction-Triggered Dropdown (No Page-Load Fetch)

The dropdown renders a fixed-dimension shell with a placeholder. Data fetches only when the user opens it.

```tsx
// app/(authenticated)/agents/new/components/model-field.tsx — Server Component
export default function ModelField() {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">Model</label>
      <div className="h-10 w-full">
        <ModelDropdownClient defaultLabel="Select a model..." />
      </div>
    </div>
  )
}
```

```tsx
// app/(authenticated)/agents/new/components/model-dropdown-client.tsx
'use client'

import { useState, useTransition } from 'react'

interface Model { id: string; name: string; provider: string }

export function ModelDropdownClient({ defaultLabel }: { defaultLabel: string }) {
  const [open, setOpen] = useState(false)
  const [models, setModels] = useState<Model[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleOpen = () => {
    setOpen(prev => !prev)
    if (!models) {
      startTransition(async () => {
        const res = await fetch('/api/models')
        const data = await res.json()
        setModels(data)
      })
    }
  }

  return (
    <div className="relative h-10 w-full">
      <button
        onClick={handleOpen}
        className="h-10 w-full rounded-md border px-3 text-left flex items-center justify-between"
      >
        <span>{selected ?? defaultLabel}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      {open && (
        <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {isPending ? (
            Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="h-9 px-3 py-2">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              </li>
            ))
          ) : (
            models?.map(m => (
              <li
                key={m.id}
                className="h-9 px-3 py-2 cursor-pointer hover:bg-accent"
                onClick={() => { setSelected(m.name); setOpen(false) }}
              >
                {m.name} <span className="text-xs text-muted-foreground">({m.provider})</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
```

Key points:
- Server Component defines the label + fixed `h-10` container — zero CLS.
- No data fetch on page load. The `/api/models` call fires only on first click.
- `useTransition` keeps the button responsive while fetching.
- The dropdown panel shows inline skeletons while loading, then replaces with data. The container dimensions never change.

---

## Example 7: Redux Hydration in a Layout with Tabbed Pages

Layout fetches agent data once, hydrates Redux, renders shared header + tabs. Child pages read from the store.

```tsx
// lib/agents/data.ts
import { cache } from 'react'
import 'server-only'
import { createClient } from '@/utils/supabase/server'
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
```

```tsx
// app/(authenticated)/agents/[id]/layout.tsx
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
  const agent = await getAgent(id)

  return {
    title: { template: `%s | ${agent.name}`, default: agent.name },
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
      <AgentHydrator agent={agent} />
      <AgentHeader agent={agent} />
      <AgentTabNav agentId={id} />
      <main>{children}</main>
    </>
  )
}
```

```tsx
// app/(authenticated)/agents/[id]/components/agent-hydrator.tsx
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

Key points:
- `getAgent` is wrapped in `cache()` + `'server-only'`. Layout and `generateMetadata` both call it — React deduplicates to one DB hit.
- `AgentHydrator` renders null. It dispatches synchronously during the first render pass (not in `useEffect`), so child components never see empty state.
- Navigating between tabs (`/agents/[id]`, `/agents/[id]/edit`, `/agents/[id]/run`) never re-renders the layout or re-hydrates Redux.
- Each child page calls `getAgent(id)` independently. `cache()` deduplicates — zero extra DB calls.
