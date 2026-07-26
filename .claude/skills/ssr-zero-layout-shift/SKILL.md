---
name: ssr-zero-layout-shift
description: >-
  Enforces SSR-first rendering with zero Cumulative Layout Shift using seven composable patterns:
  Server Component shells with Client Component islands, Suspense boundaries as static-shell-with-dynamic-holes,
  selective hydration, lazy-loaded client components via next/dynamic, dimension-matched skeleton fallbacks,
  interaction-triggered data fetching, and one-shot Redux hydration. Also covers React cache() deduplication,
  server-only guards, the slot pattern, preloading, and the loading state hierarchy.
  Also the canonical Next.js 15/16 App Router doctrine (absorbed nextjs-ssr-architecture +
  nextjs-app-router-expert): server/client component boundaries, shared service patterns, async request
  APIs (awaited params/searchParams/cookies/headers), Route Handlers vs Server Actions, and 'use cache'.
  Use when creating pages, components, forms, dropdowns, data tables, dashboards, or any UI that fetches data.
  Also use when fixing layout shift, CLS issues, hydration mismatches, or reviewing component architecture
  for rendering performance. Triggers on: Suspense, skeleton, layout shift, CLS, SSR, streaming, hydration,
  next/dynamic, lazy loading, prerender, static shell, cache components, Redux hydration, server-only,
  "use client" audit, API route patterns, Server Actions.
---

# SSR-First Zero Layout Shift

Seven composable patterns that eliminate CLS while maximizing server-rendered content. Every component gets a fixed-dimension Server Component frame; dynamic content streams into sized holes inside those frames.

## Core Mental Model

Every piece of UI has two aspects: **structure** (dimensions, position, borders, labels) and **behavior** (interactivity, state, fetched data). Structure is always a Server Component. Behavior is always a thin Client Component island nested inside that structure. The browser receives a complete, dimensionally-stable HTML shell instantly. Nothing shifts. Nothing flashes.

## The Hierarchy

**Server Component defines fixed-dimension container** -> **Suspense boundary wraps async content** -> **Skeleton fallback matches exact dimensions** -> **Client Component island handles only interactive bits** -> **Lazy loading defers non-critical interactivity until user action** -> **Redux hydrator (if needed) bridges server data to client store**

---

## Pattern 1: Server Component Shell + Client Component Islands

The outer structure is always a Server Component. Only the interactive behavior is a Client Component. The HTML structure is fixed-size, so zero layout shift.

### Rules

- Default to Server Components. Add `'use client'` only for hooks, event handlers, or browser APIs.
- Push `'use client'` as far down the tree as possible — wrap the smallest interactive unit, not the container.
- The Server Component renders the full HTML skeleton (label, container, dimensions). The Client Component only adds behavior.
- Server Components ship zero JavaScript. Every line inside `'use client'` adds to the client bundle.

```tsx
// Server Component renders structure, Client Component handles the click
import { LikeButton } from './like-button'

export default async function Post({ id }: { id: string }) {
  const post = await getPost(id)
  return (
    <article className="p-6 border rounded-lg">
      <h2>{post.title}</h2>
      <p>{post.body}</p>
      <LikeButton postId={id} initialCount={post.likes} />
    </article>
  )
}
```

### Client Shell -> Server Children (Slot Pattern)

A Client Component can receive Server Components as `children`. The children render on the server; the Client Component just provides the interactive wrapper.

```tsx
'use client'
export function CollapsiblePanel({ title, children }: {
  title: string; children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <section>
      <button onClick={() => setOpen(!open)}>{title}</button>
      {open && children}
    </section>
  )
}

// Server Component composes the pattern
export default async function Sidebar() {
  const stats = await getStats()
  return (
    <CollapsiblePanel title="Stats">
      <StatsDisplay data={stats} />  {/* Server Component passed through */}
    </CollapsiblePanel>
  )
}
```

### Anti-patterns

- Wrapping an entire form or page in `'use client'` when only one input is interactive.
- Fetching data inside a Client Component when a Server Component parent can pass it as props.
- Putting the label, container sizing, or layout inside the Client Component.

---

## Pattern 2: Suspense Boundaries as Static Shell with Dynamic Holes

The static shell (layout, labels, known UI) prerenders immediately. Async data fills sized holes via `<Suspense>`. Everything outside the boundary is in the static shell.

### Rules

- Place `<Suspense>` as close as possible to the async component — maximize the static shell.
- Every `<Suspense>` fallback must be a dimension-matched skeleton (see Pattern 5).
- Async Server Components inside Suspense stream independently — no waterfalls.
- **Boundary placement heuristic:** If two data-fetching components can resolve at different times, they need separate Suspense boundaries. If they always resolve together (same query), they can share one.

```tsx
export default function Dashboard() {
  return (
    <>
      <PageHeader>
        <h1 className="text-sm font-medium truncate">Dashboard</h1>
      </PageHeader>
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-1 grid grid-cols-3 gap-4 p-4">
          <Suspense fallback={<StatCardSkeleton />}><RevenueCard /></Suspense>
          <Suspense fallback={<StatCardSkeleton />}><UsersCard /></Suspense>
          <Suspense fallback={<StatCardSkeleton />}><OrdersCard /></Suspense>
        </div>
      </div>
    </>
  )
}
```

Each boundary fetches independently and in parallel. This replaces `Promise.all` when components render different UI.

---

## Pattern 3: Selective Hydration

React 18+ breaks hydration into Suspense-scoped chunks. If a user interacts with a component before hydration completes, React prioritizes hydrating that component first.

### Rules

- Wrap each interactive section in its own `<Suspense>` boundary to enable independent hydration.
- Critical interactive elements (search bars, primary CTAs) get their own boundary.
- One boundary = one streaming unit = one hydration unit. No extra API needed.

---

## Pattern 4: Lazy Loading Client Components (`next/dynamic`)

Defer loading Client Component code until the user triggers it. The trigger renders in the static shell; the heavy component loads on demand.

### Rules

- Use `next/dynamic` with `ssr: false` for components that only matter after user interaction (modals, panels, rich editors).
- The trigger (button, dropdown trigger) is always server-rendered or in a thin Client Component.
- Provide a dimension-matched `loading` component.

```tsx
import dynamic from 'next/dynamic'

const RichEditor = dynamic(() => import('./RichEditor'), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-md bg-muted" />,
})
```

---

## Pattern 5: CLS Prevention — Dimension-Matched Skeletons

Every Suspense fallback and loading state must preserve the exact layout dimensions of the real component.

### Rules

- Skeletons must match the real component's height, width, padding, and gap.
- Use explicit dimension classes (`h-32`, `h-10`, `w-full`) — never rely on content-derived sizing.
- Skeletons live inside the Suspense boundary, not outside. The outer container is stable regardless.
- Use the project's `<Skeleton>` component (Server Component — no `'use client'` needed).
- Mirror the content structure: if the real component has a title and two lines, the skeleton has matching blocks.
- No spinners for page content. Spinners are acceptable for small inline actions (button loading state).

### Validating zero CLS

1. Same explicit height on the outer container
2. Same padding and gap classes
3. Same border/rounding so the visual footprint is identical
4. No content-dependent sizing — the container never grows based on text length

---

## Pattern 6: Interaction-Triggered Data Fetching

Not all data needs to be fetched on page load. If data is only needed after user action (click, scroll, hover), defer it. The component renders a fixed-dimension shell with a placeholder/hardcoded value. Data fetches only when the user interacts.

### Rules

- The dropdown trigger, form field label, and container dimensions are Server Component output — instant, zero JS.
- The Client Component fetches data only on first interaction, caches it locally, and replaces the placeholder.
- Use `useTransition` to keep the UI responsive during the fetch.

```tsx
// Server Component — renders the form field structure instantly
export default function AssignAgentField({ currentAgentName }: { currentAgentName: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">Agent</label>
      <div className="h-10 w-full">
        <AgentDropdown defaultLabel={currentAgentName} />
      </div>
    </div>
  )
}
```

```tsx
// Client Component — fetches ONLY on user interaction
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
        const data = await fetchAgents()
        setAgents(data)
      })
    }
  }

  return (
    <button onClick={handleOpen} className="h-10 w-full rounded-md border px-3 text-left">
      {defaultLabel}
      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover">
          {isPending
            ? <DropdownSkeleton />
            : agents?.map(a => <div key={a.id} className="px-3 py-2">{a.name}</div>)
          }
        </div>
      )}
    </button>
  )
}
```

### When to use each approach

| Data needed at... | Pattern |
|---|---|
| Initial page paint | Fetch in Server Component, pass as props (Pattern 1) |
| Initial paint, but slow | Suspense boundary with skeleton (Pattern 2) |
| User click/hover/scroll | Interaction-triggered fetch (Pattern 6) |
| Never on this page load | `next/dynamic` with `ssr: false` (Pattern 4) |

---

## Pattern 7: Redux Hydration — One-Shot Background Operation

When SSR-fetched data must live in the Redux store for client-side interactions, hydrate it exactly once using a thin Client Component that renders nothing.

```tsx
'use client'
import { useRef } from 'react'
import { useAppDispatch } from '@/lib/redux/hooks'
import { hydrateAgent } from '@/lib/redux/slices/agentsSlice'

export function AgentHydrator({ agent }: { agent: Agent }) {
  const dispatch = useAppDispatch()
  const hydrated = useRef(false)

  if (!hydrated.current) {
    dispatch(hydrateAgent(agent))
    hydrated.current = true
  }

  return null
}
```

### Rules

- **Why not `useEffect`:** It fires after paint. Children reading from the store would see empty state for one frame, causing a flash. The `useRef` guard dispatches during the first render pass — before any child reads.
- **Synchronous action only:** The Redux action must be a plain synchronous action (not a thunk). The server did the fetching; Redux just receives.
- **Hydrate once:** When the layout persists across tab/page navigation, the hydrator doesn't re-mount. Re-hydrating on every navigation risks overwriting in-progress edits.
- **Place in layouts:** The hydrator typically lives in a layout that wraps multiple pages sharing the same data.

---

## Data Fetching Architecture

### React `cache()` for Request Deduplication

Wrap data-access functions in React's `cache()` to deduplicate across the render pass. Layout, page, `generateMetadata`, and any Server Component can all call the same function — React collapses them into one execution per request.

```tsx
// lib/data.ts
import { cache } from 'react'
import 'server-only'

export const getAgent = cache(async (id: string) => {
  const supabase = await createClient()
  const { data, error } = await supabase.from('agents').select('*').eq('id', id).single()
  if (error || !data) notFound()
  return data
})
```

**`cache()` vs `'use cache'`:** `cache()` deduplicates within a single request (same render pass). `'use cache'` persists data across requests (cross-user caching). They serve different purposes and are often used together.

### `server-only` Import Guard

Add `import 'server-only'` to any data-access file. If a Client Component accidentally imports it, the build fails immediately — preventing secret leaks and server-only code from entering the client bundle.

### Preloading Pattern

When data is expensive and conditionally needed, start the fetch early:

```tsx
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  preloadAgent(id)
  const canView = await checkPermission(id)
  if (!canView) redirect('/agents')
  return <AgentView id={id} />
}

const preloadAgent = (id: string) => { void getAgent(id) }
```

### Parallel Fetching

```tsx
// Parallel — both start immediately
const [agent, logs] = await Promise.all([getAgent(id), getAgentLogs(id)])

// Waterfall — logs waits for agent. NEVER do this.
const agent = await getAgent(id)
const logs = await getAgentLogs(id)
```

---

## Next.js 15/16 App Router Rules (merged from nextjs-app-router-expert)

### Business logic lives in shared services

Never scatter Supabase queries across components and API routes. Extract to a service and consume it from Server Components, API routes, and Server Actions alike:

| Scope | Location |
|-------|----------|
| Feature-specific | `features/[feature-name]/service.ts` |
| Shared/reusable | `lib/services/[name].ts` |

Client Components avoid direct Supabase queries where a Server Component parent (via a service) can pass data down. Server clients: `@/utils/supabase/server`; browser: `@/utils/supabase/client`.

### Async request APIs — always await

`params`, `searchParams`, `cookies()`, and `headers()` all return Promises in Next.js 15/16:

```tsx
export default async function Page({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string>>
}) {
  const { id } = await params
  const { page } = await searchParams
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
}
```

Types must include the `Promise<>` wrappers.

### Route Handlers vs Server Actions

| Use case | Use |
|----------|-----|
| Webhooks, third-party integrations | Route Handlers (`/api/...`) |
| Forms / internal mutations | Server Actions |

Both go through shared services.

### Cross-request caching (`'use cache'`)

Opt-in and explicit. `cache()` deduplicates within one request; `'use cache'` persists across requests — often used together:

```tsx
async function getStaticData() {
  'use cache'
  cacheTag('static-data')
  cacheLife('hours')  // seconds, minutes, hours, days, max
  return await fetchData()
}
// Invalidate: revalidateTag('static-data') from next/cache after a mutation.
```

### `"use client"` audit

`"use client"` is justified ONLY by hooks, event handlers, browser APIs, or client-only third-party libs. A pure display component carrying the directive is a violation — remove it. When reviewing, check each in order: hooks? events? browser APIs? None → strip the directive.

---

## Loading State Hierarchy

```
layout.tsx        → Never shows loading (persists across navigation)
loading.tsx       → Wraps page.tsx in Suspense (route transition skeleton)
<Suspense>        → Wraps individual async components (granular streaming)
dynamic(ssr:false)→ Placeholder until client JS loads (interaction-triggered)
```

`loading.tsx` is automatic Suspense at the page level. Prefer granular `<Suspense>` boundaries inside pages for fine-grained streaming. Use `loading.tsx` as a coarse fallback for full-page transitions.

---

## Decision Tree

```
Building a new component?
│
├── Does it fetch data?
│   ├── Yes, needed at initial paint → async Server Component in <Suspense> (Pattern 2)
│   ├── Yes, but only after interaction → Interaction-triggered fetch (Pattern 6)
│   └── No → Render directly in the static shell
│
├── Does it need interactivity?
│   ├── Yes → Can the interactive part be isolated?
│   │   ├── Yes → Server parent + thin Client child (Pattern 1)
│   │   └── No → Minimal 'use client' component
│   ├── Is it critical (above fold)? → Own Suspense boundary (Pattern 3)
│   └── Is it non-critical? → next/dynamic ssr:false (Pattern 4)
│
├── Does it display user-specific data (cookies, session)?
│   ├── Yes → Dynamic Server Component inside Suspense, outside 'use cache'
│   └── No → Candidate for 'use cache' with cacheLife/cacheTag
│
└── Does the fetched data need to be in Redux?
    ├── Yes → Add Hydrator component in layout (Pattern 7)
    └── No → Pass as props
```

---

## Checklist

Before shipping any page or component:

- [ ] Outer container has explicit dimensions (not content-derived)
- [ ] `'use client'` only on the smallest interactive unit
- [ ] Every `<Suspense>` fallback matches the real component's bounding box
- [ ] Async data fetches happen in Server Components, not Client Components
- [ ] Non-critical interactive components use `next/dynamic` with `ssr: false`
- [ ] No data waterfalls — parallel Suspense boundaries or `Promise.all`
- [ ] Skeleton components are Server Components (no `'use client'` directive)
- [ ] Data-access functions wrapped in `cache()` with `import 'server-only'`
- [ ] Redux hydration (if needed) uses `useRef` guard, not `useEffect`
- [ ] Non-critical data defers to interaction-triggered fetching

---

## Additional Resources

- For complete page examples with cache components, see [examples.md](examples.md)
- For route-level architecture (layouts, nested routes, metadata, error boundaries), see [route-architecture.md](route-architecture.md)
- For detailed Next.js 16 templates (services, API routes, signatures), see [nextjs16-patterns-reference.md](nextjs16-patterns-reference.md)
- For splitting heavy client code out of the bundle, see the `code-splitting` skill; for the full new-route workflow, see `new-route-scaffold`
