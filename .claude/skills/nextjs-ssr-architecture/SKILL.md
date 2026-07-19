---
name: nextjs-ssr-architecture
description: "Enforce Next.js App Router SSR-first component architecture with zero layout shift. Use this skill whenever building pages, layouts, components, or route structures in Next.js — especially when the work involves data fetching, loading states, skeletons, Redux hydration, Suspense boundaries, or any decision about what should be a Server vs Client Component. Also trigger when the user mentions performance, CLS, first contentful paint, streaming, partial prerendering, hydration, or shell patterns. If the user is creating any new page or route in a Next.js App Router project, consult this skill to ensure proper Server/Client component boundaries and data-fetching architecture."
---

# Next.js SSR-First Component Architecture

This skill enforces a rendering architecture that maximizes server-side rendering, eliminates layout shift, and defers client-side JavaScript to the smallest possible interactive islands.

## Core Mental Model

Every piece of UI has two aspects: **structure** (dimensions, position, borders, labels) and **behavior** (interactivity, state, fetched data). Structure is always a Server Component. Behavior is always a thin Client Component island nested inside that structure.

The result: the browser receives a complete, dimensionally-stable HTML shell instantly. Interactive islands hydrate progressively inside fixed-size containers. Nothing shifts. Nothing flashes.

## The Five Architectural Rules

### Rule 1: Server Components Are the Default — Client Components Are Exceptions

Every component is a Server Component unless it absolutely requires browser interactivity (`onClick`, `useState`, `useEffect`, browser APIs). When a component needs interactivity, don't make the whole component a Client Component. Instead, keep the outer container as a Server Component and nest a thin Client Component inside it for only the interactive part.

```tsx
// ✅ Server Component renders the structure, Client Component handles the click
import { LikeButton } from './like-button'  // 'use client' inside this file

export default async function Post({ id }: { id: string }) {
  const post = await getPost(id)
  return (
    <article className="p-6 border rounded-lg">  {/* Fixed dimensions — Server */}
      <h2>{post.title}</h2>
      <p>{post.body}</p>
      <LikeButton postId={id} initialCount={post.likes} />  {/* Tiny Client island */}
    </article>
  )
}
```

```tsx
// ❌ Never mark an entire page or large section as 'use client'
'use client'  // BAD — forces the entire tree into the client bundle
export default function Post({ id }) { /* ... */ }
```

**Why it matters:** Server Components ship zero JavaScript. Every line inside a `'use client'` file adds to the bundle the browser must download, parse, and execute before hydration completes.

### Rule 2: Fixed-Dimension Containers First, Data Second

Every component that will eventually contain dynamic data must first establish its dimensions in the HTML shell. The container's height, width, padding, and border are determined by the Server Component — not by the data inside it.

This is how you achieve zero Cumulative Layout Shift (CLS). The skeleton and the final content occupy the exact same space.

```tsx
// ✅ The Server Component defines a fixed-size card. Data streams into it.
export default function AgentCard() {
  return (
    <div className="h-24 p-4 border rounded-lg">  {/* Dimensions locked by CSS */}
      <Suspense fallback={<AgentCardSkeleton />}>   {/* Skeleton matches h-24 */}
        <AgentCardContent />                         {/* Streams in, same size */}
      </Suspense>
    </div>
  )
}
```

**The skeleton rule:** Every `<Suspense>` fallback must be a skeleton component that matches the exact dimensions of the real content. Same height, same width, same padding. Skeletons live **inside** the Suspense boundary, not outside it. The outer container is stable regardless of loading state.

### Rule 3: Suspense Boundaries Are Architectural Decisions

Place `<Suspense>` boundaries as close as possible to the components that fetch data. This maximizes the static shell that renders instantly and isolates dynamic content into the smallest possible streaming holes.

```tsx
// ✅ Granular boundaries — each section streams independently
export default function Dashboard() {
  return (
    <div className="grid grid-cols-3 gap-4">
      <section className="col-span-2">
        <h2>Recent Activity</h2>                     {/* Instant — static shell */}
        <Suspense fallback={<ActivitySkeleton />}>
          <RecentActivity />                          {/* Streams when ready */}
        </Suspense>
      </section>
      <aside>
        <h2>Quick Stats</h2>                          {/* Instant — static shell */}
        <Suspense fallback={<StatsSkeleton />}>
          <QuickStats />                              {/* Streams independently */}
        </Suspense>
      </aside>
    </div>
  )
}
```

```tsx
// ❌ One giant boundary — user sees nothing until everything resolves
export default function Dashboard() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <EntireDashboard />
    </Suspense>
  )
}
```

**Boundary placement heuristic:** If two data-fetching components can resolve at different times, they need separate Suspense boundaries. If they always resolve together (same query), they can share one.

### Rule 4: Defer Non-Critical Data Until Interaction

Not all data needs to be fetched on page load. If data is only needed when the user performs an action (clicks a dropdown, opens a modal, expands a panel), defer it.

**Pattern: Interaction-triggered loading**

For a dropdown that displays a list of options:
- The dropdown trigger (label, border, chevron icon, placeholder text) is a Server Component — renders instantly with fixed dimensions.
- The dropdown panel with its options is a lazy-loaded Client Component that fetches data only when opened.

```tsx
// Server Component — renders the form field structure instantly
export default function AssignAgentField({ currentAgentName }: { currentAgentName: string }) {
  return (
    <div className="h-10 border rounded">  {/* Fixed dimensions — never shifts */}
      <AgentDropdown defaultLabel={currentAgentName} />
    </div>
  )
}
```

```tsx
// Client Component — only fetches the agent list when user opens it
'use client'
import { useState, useTransition } from 'react'

export function AgentDropdown({ defaultLabel }: { defaultLabel: string }) {
  const [open, setOpen] = useState(false)
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleOpen = () => {
    setOpen(true)
    if (!agents) {
      startTransition(async () => {
        const data = await fetchAgents()  // Only fetches on first open
        setAgents(data)
      })
    }
  }

  return (
    <button onClick={handleOpen} className="h-10 w-full text-left px-3">
      {defaultLabel}
      {open && (
        <div className="absolute mt-1 border rounded shadow bg-white">
          {isPending ? <DropdownSkeleton /> : agents?.map(a => (
            <option key={a.id}>{a.name}</option>
          ))}
        </div>
      )}
    </button>
  )
}
```

**Other deferral patterns:**
- **Modals:** Use `next/dynamic` with `{ ssr: false }` for modal content that only loads on trigger.
- **Tabs:** Only the active tab's content loads. Inactive tabs are empty until clicked (use route-based tabs or lazy components).
- **Below-the-fold content:** Use Intersection Observer to trigger loading when the user scrolls near it.

### Rule 5: Redux Hydration Is a One-Shot Background Operation

When SSR-fetched data needs to be available in the Redux store for client-side interactions, hydrate it exactly once using a thin Client Component that renders nothing.

```tsx
// Hydrator — renders null, dispatches once during first render pass
'use client'
import { useRef } from 'react'
import { useAppDispatch } from '@/lib/redux/hooks'
import { hydrateAgent } from '@/lib/redux/slices/agentsSlice'

export function AgentHydrator({ agent }: { agent: Agent }) {
  const dispatch = useAppDispatch()
  const hydrated = useRef(false)

  if (!hydrated.current) {
    dispatch(hydrateAgent(agent))  // Synchronous action, not a thunk
    hydrated.current = true
  }

  return null
}
```

**Why not `useEffect`:** `useEffect` fires after paint. Child components reading from the store would see empty state for one frame, causing a flash. The `useRef` guard with synchronous dispatch hydrates during the first render pass — before any child reads from the store.

**Why not re-hydrate on navigation:** When the layout persists across tab/page navigation, the hydrator doesn't re-mount. Data set once stays in the store. Re-hydrating on every navigation risks overwriting in-progress edits.

The Redux action should be a plain synchronous action (not a thunk) that sets data in the slice. The server did the fetching; Redux just receives.

---

## Data Fetching Architecture

### React `cache()` for Request Deduplication

When using an ORM or database client (not `fetch`), wrap data-access functions in React's `cache()` to deduplicate across the render pass. Layout, page, `generateMetadata`, and any Server Component can all call the same function — React collapses them into one execution.

```tsx
// lib/data.ts
import { cache } from 'react'
import 'server-only'

export const getAgent = cache(async (id: string) => {
  const { data, error } = await supabase.from('agents').select('*').eq('id', id).single()
  if (error || !data) notFound()
  return data
})
```

### Parallel Fetching, Not Waterfalls

When a page needs multiple independent data sources, initiate all fetches before awaiting any of them.

```tsx
// ✅ Parallel — both start immediately
const agentPromise = getAgent(id)
const logsPromise = getAgentLogs(id)
const [agent, logs] = await Promise.all([agentPromise, logsPromise])
```

```tsx
// ❌ Waterfall — logs waits for agent to finish
const agent = await getAgent(id)
const logs = await getAgentLogs(id)
```

### Preloading Pattern

When a component conditionally renders and its data is expensive, eagerly start the fetch before the condition check.

```tsx
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  preloadAgent(id)                           // Starts fetch immediately
  const canView = await checkPermission(id)  // Runs in parallel
  if (!canView) redirect('/agents')
  return <AgentView id={id} />               // getAgent(id) resolves from cache
}

const preloadAgent = (id: string) => { void getAgent(id) }
```

---

## Component Composition Patterns

### Server Parent → Client Child (The Standard Pattern)

Server Components can render Client Components as children. The Server Component does the data fetching and passes serializable props down.

```tsx
// Server Component
import { InteractiveEditor } from './editor'  // 'use client'

export default async function EditPage() {
  const agent = await getAgent(id)
  return (
    <div className="p-6">
      <h1>{agent.name}</h1>                    {/* Static, zero JS */}
      <InteractiveEditor initialData={agent} /> {/* Client island */}
    </div>
  )
}
```

### Client Shell → Server Children (The Slot Pattern)

A Client Component can receive Server Components as `children`. The Server Components render on the server; the Client Component just provides the interactive wrapper.

```tsx
// Client Component — provides interactive wrapper
'use client'
export function CollapsiblePanel({ title, children }: {
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <section>
      <button onClick={() => setOpen(!open)}>{title}</button>
      {open && children}  {/* Server-rendered content passed through */}
    </section>
  )
}

// Server Component — composes the pattern
export default async function Sidebar() {
  const stats = await getStats()
  return (
    <CollapsiblePanel title="Stats">
      <StatsDisplay data={stats} />  {/* This is a Server Component */}
    </CollapsiblePanel>
  )
}
```

### Dynamic Import for Deferred Client Components

For heavy Client Components that aren't needed on initial load:

```tsx
import dynamic from 'next/dynamic'

const HeavyEditor = dynamic(() => import('./heavy-editor'), {
  loading: () => <EditorSkeleton />,  // Matches editor dimensions
  ssr: false,                          // Don't server-render — only loads on client
})
```

---

## Skeleton Design Rules

1. **Match exact dimensions.** The skeleton must occupy the same height, width, and padding as the final content. Use the same CSS classes for the outer container.
2. **Live inside the Suspense boundary.** The skeleton is the `fallback` prop of `<Suspense>`, not a wrapper around it. The outer container is a stable Server Component.
3. **Use shimmer/pulse animation.** A subtle `animate-pulse` (Tailwind) or CSS shimmer gives the user confidence that content is loading.
4. **Mirror the content structure.** If the real component has a title, two lines of text, and a button, the skeleton has a title-shaped block, two line-shaped blocks, and a button-shaped block.
5. **No spinners for page content.** Spinners are acceptable for small inline actions (button loading state). For page sections and cards, always use dimensionally-accurate skeletons.

---

## Checklist: Before Implementing Any Component

Ask these questions in order:

1. **Does this component need browser interactivity?** No → Server Component. Yes → Continue.
2. **Can the interactive part be isolated into a smaller child?** Yes → Server Component parent with Client Component child. No → Minimal Client Component with `'use client'`.
3. **Does this component fetch data?** Yes → Wrap in `<Suspense>` with a dimension-matched skeleton. No → Render directly.
4. **Is the data needed on initial page load?** No → Defer fetch until user interaction (click, scroll, hover). Yes → Fetch in Server Component.
5. **Does the fetched data need to be in Redux?** Yes → Add a Hydrator component (renders null, dispatches once). No → Pass as props.
6. **Is the component below the fold or behind an interaction?** Yes → Consider `next/dynamic` with `{ ssr: false }` or lazy loading.

---

## Reference: Loading State Hierarchy

```
layout.tsx        → Never shows loading (persists across navigation)
loading.tsx       → Wraps page.tsx in Suspense (shows on route transitions)
<Suspense>        → Wraps individual async components (granular streaming)
dynamic(ssr:false)→ Placeholder until client JS loads (interaction-triggered)
```

For more detail on route-level architecture (layouts, nested routes, metadata, error boundaries), see the companion reference: `references/route-architecture.md`.
