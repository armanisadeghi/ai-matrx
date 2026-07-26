> ARCHIVED 2026-07-26 — superseded by `features/agents/components/chat/FEATURE.md` (the authoritative live-chat doc; its "Rendering & data-loading standards" section absorbs this file's still-true rules).

# Agent/Chat/Conversation — Single Source of Truth

**Status:** MANDATORY — No new implementations. No copies. No "temporary" versions.

We currently have **10+ divergent implementations** of the most critical feature in AI Matrx. This ends now. There is one unified implementation. Everything else gets deleted or migrated.

---

## The Feature

The agent/chat/conversation UI consists of two primary sections:

### 1. Response Column

Displays the conversation: user messages, assistant responses, tool calls, structured blocks, and more.

**Dual data model — this is non-negotiable:**

- **Initial load:** Empty state OR hydrated from `cx_conversation` records fetched server-side.
- **Active session:** Streaming responses and user messages held in client state. On next page load, these will have been persisted and arrive via the database fetch. The client state and server data must never conflict — the streaming state is the authority during a session, the database is the authority on load.

### 2. User Input Section

This is not a textarea. It is a complex orchestration layer that includes:

- Text input with rich formatting
- File uploads
- Integrations with 10+ system resources: user files, notes, tasks, projects, cloud files, MCP integrations, connectors (Google, etc.), and more
- Agent selection and configuration
- AI model selection and settings

---

## Core Architecture Principles

### Principle 1: Server Components First — Client Boundaries at the Leaf

**Default to React Server Components. Push `'use client'` to the smallest possible leaf node.**

Every component is a Server Component unless it absolutely requires browser APIs, event handlers, or local state. When client interactivity is needed, extract *only* that interactive piece into its own `'use client'` component and import it into the server parent.

**Wrong:** Making an entire panel a Client Component because one button inside it needs `onClick`.
**Right:** Server Component renders the panel layout, structure, and static content. A tiny `<SendButton />` Client Component handles the click.

**The composition rule:** Importing a component into a `'use client'` file makes it part of the client bundle — you cannot import a Server Component into a Client Component. But you *can* pass a Server Component as a prop or `children` to a Client Component. This is how you nest server-rendered content inside client-driven UI.

This matters most for **context providers.** Place a Client Component context provider high in the tree and pass Server Components as `children`. Client Components deeper in the tree can read the shared context — even with Server Components sitting between them in the hierarchy. The Server Components never enter the client bundle; they render on the server and their output passes through.

```tsx
// layout.tsx (Server Component)
export default function Layout({ children }) {
  return (
    <ThemeProvider>       {/* Client Component — provides context */}
      <ServerSidebar />   {/* Server Component — passed as children, stays on server */}
      {children}
    </ThemeProvider>
  )
}
```

### Principle 2: The Cache System — `'use cache'`, `'use cache: remote'`, `'use cache: private'`

Next.js 16 replaces implicit caching with explicit, opt-in caching via Cache Components. Enable with `cacheComponents: true` in `next.config.ts` (top-level, not under `experimental` as of 16.1.x).

**The dual cache flow:**

On navigation, the **client cache** is checked first — if a valid entry exists, no server request is made. If the client misses, the request hits the **server cache**, which checks for a valid entry before rendering. Server responses update the client cache on the way back. This means a properly cached route segment can resolve entirely from the client with zero network cost.

**Independent cacheability of layouts and pages:**

`layout.tsx` and `page.tsx` are independently cacheable. A layout can be prerendered and served from CDN while its child page renders dynamically at request time. This is critical for our chat UI — the persistent chat shell (layout) can be cached and distributed globally, while the conversation content (page) renders fresh per-request.

**Prerendering and CDN distribution:**

Cacheable route segments can be prerendered at build time or during background revalidation. The prerendered result is distributed to a CDN and the closest edge node serves it. This is automatic once `'use cache'` is applied — no additional configuration.

**The three cache directives:**

**`'use cache'` — Standard (static/build-time caching)**

Apply to route segments (layout/page), individual Server Components, or plain functions. Caches at build time or during revalidation. The cached result is reused for all requests with the same inputs.

```tsx
// Cached at the route level
export default async function Page() {
  'use cache'
  const data = await db.query(...)
  return <ChatShell data={data} />
}

// Cached at the function level
async function getAgentList() {
  'use cache'
  cacheTag('agents')
  return await db.query('SELECT * FROM agents')
}
```

Tag with `cacheTag()`, invalidate with `updateTag()` (Server Actions, immediate) or `revalidateTag(tag, 'max')` (stale-while-revalidate). Wrap dynamic content in `<Suspense>` — the static shell ships instantly, dynamic portions stream in.

**`'use cache: remote'` — Runtime caching in dynamic contexts**

Standard `'use cache'` does **not** cache after dynamic API calls (`await connection()`, `await cookies()`, `await headers()`). If you need caching in a dynamic context — user-specific data, frequently changing data, or per-request data — use `'use cache: remote'`. This caches at runtime in a remote store (Redis, KV, etc.), reducing origin load even in fully dynamic routes.

```tsx
async function getProductPrice(id: string) {
  'use cache: remote'
  cacheTag(`price-${id}`)
  return await db.query(...)
}

async function ProductPrice({ id }: { id: string }) {
  await connection() // dynamic context — standard 'use cache' would skip caching
  const price = await getProductPrice(id)
  return <div>Price: ${price}</div>
}

export default async function Page() {
  return (
    <Suspense fallback={<Skeleton />}>
      <ProductPrice id="1" />
    </Suspense>
  )
}
```

**`'use cache: private'` — Personalized, prefetchable content**

Use when you need to cache user-specific data that depends on `cookies()`, `headers()`, or `searchParams`. Unlike the other directives, `'use cache: private'` can access request-specific APIs *directly inside* the cached function. Private caches are never persisted to cache handlers — they exist only to mark dynamic content as **runtime prefetchable**. Without this, personalized content cannot prefetch and must wait for navigation.

```tsx
async function getRecommendations(productId: string) {
  'use cache: private'
  cacheTag(`recommendations-${productId}`)
  cacheLife({ stale: 60 })
  // Can access cookies() INSIDE the cached function
  const sessionId = (await cookies()).get('session-id')?.value || 'guest'
  return getPersonalizedRecommendations(productId, sessionId)
}
```

**When to use which:**

| Directive | Context | Persisted? | Use case |
|---|---|---|---|
| `'use cache'` | Static / build-time | Yes (CDN + server) | Agent lists, model configs, system prompts, layout shells |
| `'use cache: remote'` | Dynamic (post-`connection()`) | Yes (remote KV/Redis) | Per-user usage stats, conversation metadata, pricing |
| `'use cache: private'` | Dynamic + request APIs | No (prefetch only) | Personalized recommendations, session-specific UI |

**This is how we get static-site speed with fully dynamic, personalized content.**

### Principle 3: Dynamic Imports for Non-Visible UI

Anything not immediately visible on screen **must** be dynamically imported with `next/dynamic`.

```tsx
const EmojiPicker = dynamic(() => import('./EmojiPicker'), {
  ssr: false,
  loading: () => <div className="w-8 h-8" /> // exact placeholder dimensions
})
```

**Critical rules:**

- The `loading` fallback must match the **exact dimensions and position** of the final component. Zero layout shift. Zero CLS.
- `next/dynamic` creates its own internal Suspense boundary. If you also wrap it in `<Suspense>`, you'll get **double loading states** — one for the import, one for data. Unify them or use one, not both.
- `ssr: false` only when the component genuinely needs browser APIs (`window`, `navigator`, etc.). Don't use it as a lazy shortcut — it kills server-rendered HTML.

### Principle 4: Tiered Data Fetching

Data fetching follows three tiers based on **when the user needs to see it:**

**Tier 1 — Server-fetched, blocking (visible on first paint)**
Data the user sees immediately. Fetch it in the Server Component. No loading state — it's in the HTML.

*Example: The conversation history from `cx_conversation`. The response column must render populated on first paint.*

**Tier 2 — Server-fetched with Suspense (visible but can stream)**
Data the user will see shortly but doesn't block the shell. Wrap in `<Suspense>` with a skeleton that matches the exact size, shape, and visual style of the final content.

*Example: User's pinned agents list in a sidebar panel.*

**Tier 3 — Deferred client-fetch (hidden until interaction)**
Data that lives inside dropdowns, modals, drawers, or panels the user hasn't opened yet. **This data must not fetch until the page is fully loaded and interactive.**

*Example: A dropdown listing available AI models. The dropdown renders server-side showing the current selection or a sensible default. The full model list fetches client-side only after the page is fully rendered and our post-render signal fires.*

**Tier 3 implementation rules:**

- Do NOT make the parent a Client Component just to fetch dropdown data. Render a server-side shell with a meaningful default value.
- The fetch must be gated behind a dependency chain that confirms: page is rendered, hydration is complete, and the user can interact. Use `requestIdleCallback`, `IntersectionObserver`, or our internal post-render hook — not `useEffect` on mount.
- Use a client-side cache (TanStack Query / SWR) with `staleTime` configured so repeat visits don't re-fetch.
- The fetch must not contend with critical resources. It should feel invisible.

### Principle 5: Nested Layouts for Persistent UI

Layouts in Next.js are shared UI that persist across route navigations. They **preserve state, remain interactive, and do not re-render** when a child route changes. This is not optional architecture — it is how the chat feature must be structured.

The agent/chat UI has clear persistent and variable zones:

- **Persistent (layout):** The response column shell, the user input section, sidebar navigation, agent/model selectors — these must live in a layout so they survive route changes without remounting, losing state, or re-fetching.
- **Variable (page/route):** The conversation content itself, settings panels, or context-specific views — these are the child routes that swap in and out within the layout.

**Why this matters for chat:** If the user is mid-composition in the input field and navigates to a different settings view or conversation branch, the input state, file uploads in progress, and selected agent must not be destroyed. Nested layouts guarantee this — a page-level component does not.

Nest layouts deliberately. A parent layout wraps the entire chat shell. A child layout can wrap the response column. The actual conversation content is the leaf page/route. Each layer re-renders independently — the parent never re-renders when only the leaf route changes.

### Principle 6: Parallel Routes for Independent UI Regions

Parallel Routes let you render multiple independent pages (called **slots**) simultaneously within the same layout, each with its own navigation, loading, and error boundaries. Slots are defined with the `@folder` convention and are injected as props into the parent `layout.tsx`. They do not affect the URL structure.

```
app/chat/
├── layout.tsx              ← receives @sidebar and children as props
├── @sidebar/
│   ├── page.tsx            ← conversation list
│   ├── loading.tsx         ← independent loading state
│   └── default.tsx         ← fallback on hard refresh
├── page.tsx                ← main conversation view (implicit @children slot)
└── default.tsx             ← fallback for children on hard refresh
```

```tsx
// app/chat/layout.tsx
export default function ChatLayout({
  children,
  sidebar,
}: {
  children: React.ReactNode
  sidebar: React.ReactNode
}) {
  return (
    <div className="flex">
      <aside>{sidebar}</aside>
      <main>{children}</main>
    </div>
  )
}
```

**Why this matters for chat:** The conversation list, the response column, and potentially a settings/config panel are independent UI regions. A failure or slow load in one must never break or block the others. Each slot streams independently, can have its own `loading.tsx` and `error.tsx`, and navigates without affecting sibling slots.

**Soft vs. hard navigation — the `default.tsx` requirement:**

- **Soft navigation (client-side `<Link>`):** Next.js performs a partial render — only the affected slot updates. Other slots preserve their current state even if their sub-route doesn't match the new URL.
- **Hard navigation (full page reload / direct URL):** Next.js cannot recover slot state from the URL alone. It renders `default.tsx` for any slot that doesn't match. If `default.tsx` doesn't exist, you get a 404.

**Every parallel route slot must have a `default.tsx`.** For the chat UI, `default.tsx` in `@sidebar` should render the conversation list at its default state. The implicit `children` slot also needs a `default.tsx` at the same level.

**Combining with Intercepting Routes for modals:**

Parallel Routes + Intercepting Routes solve the modal problem cleanly. Use an `@modal` slot with intercepting route notation (`(.)`, `(..)`) to render agent settings, conversation details, or file previews as modals that:

- Are shareable via URL
- Preserve context on refresh (the `default.tsx` returns `null` when the modal isn't active)
- Close on back navigation via `router.back()`
- Don't destroy the conversation state underneath

**Critical rules:**

- Parallel route slots **only work in `layout.tsx`**, never in `page.tsx`.
- If one slot at a level is dynamic, **all slots at that level must be dynamic** — you cannot mix static and dynamic slots at the same route segment.
- Consolidate intercepting routes under a single `@modal` slot if multiple modals exist at the same layout level. Multiple parallel modal slots will render simultaneously.
- Use `useSelectedLayoutSegment('slotName')` to read the active route segment within a specific slot — useful for highlighting the active conversation in the sidebar.

### Principle 7: Navigation Loading UX — Two Phases, Four Tools

Next.js routing is server-centric. Every navigation requires a server round trip. The framework compensates with prefetching, prerendering, and streaming — but you must design for the two phases a user experiences during any navigation:

1. **Pending phase:** Before the browser URL updates. The user is still on the current route, waiting. They need to know their click registered.
2. **Loading phase:** After the URL updates but before the new route's content is fully loaded. They need to see progress, not a blank screen.

**The four tools, in priority order:**

**`loading.js` + Prefetching (primary strategy):**
Define a `loading.js` file for each route segment that renders a skeleton fallback. `<Link>` prefetches routes by default — static routes fully, dynamic routes partially up to the nearest `loading.js` boundary. When both are in place, navigation is **instant**: the URL updates immediately and the `loading.js` fallback shows while the server renders the new content. This skips the pending phase entirely.

**We use `loading.js` for every dynamic route segment. Do not disable prefetching unless there is a measured, specific reason.**

**`useLinkStatus` (secondary — pending phase feedback):**
A Client Component hook that tracks whether a `<Link>` navigation is still pending. Use it to show subtle inline feedback (dimming, spinners, glimmers) on the link the user clicked while the server responds. This is useful when prefetching is still in progress or the destination route is dynamic without a `loading.js`.

**Pending UI design rules:**

- **No layout shift.** Use `position: absolute`, CSS `background` gradients, or `opacity` — never inject elements into document flow.
- **Delay visibility by ~100–150ms.** Most navigations are fast. Start the indicator invisible (`opacity: 0`) or off-screen (`translate: -100%` with `overflow: hidden`) and only reveal after the delay. This prevents flashes on fast transitions.
- **Place feedback near the interaction.** The indicator must appear on or adjacent to what the user clicked, not in a distant corner.
- **Include indicators proactively.** It's fine to wire up pending states on all key nav items even if most navigations are instant. If it's fast, the indicator never shows. If it's slow, the user gets feedback.

**`<Suspense>` boundaries (loading phase refinement):**
Within a route, wrap independent async Server Components in `<Suspense>` to stream chunks as they resolve. The user sees partial content early instead of waiting for everything.

**`useFormStatus` (form submissions):**
For Server Action form submissions, `useFormStatus` provides the same pending-phase feedback that `useLinkStatus` provides for link navigations.

**For the chat UI specifically:** Conversation list navigation, agent switching, and settings panels all need `loading.js` skeletons. Conversation items in the sidebar should wire up `useLinkStatus` so the user sees which conversation is loading when they click it.

---

## Anti-Patterns — Stop Doing These

1. **Wrapping an entire section in `'use client'` because one child needs state.** Push the boundary down.
2. **Fetching dropdown/menu data in `useEffect` on mount.** This competes with hydration and delays interactivity.
3. **Using `loading: () => <p>Loading...</p>` as a dynamic import fallback.** Match the exact dimensions. No text spinners. No layout shift.
4. **Creating a new version of the chat component** "just for this page / experiment / variant." There is one. Extend it or fix it.
5. **Ignoring the streaming/database dual model.** Client state during a session and database state on load are two phases of the same data. Design for both from the start.
6. **Fetching non-critical data server-side** and blocking render for content the user can't even see yet.

---

## Removed / Deferred Items

*Nothing was removed from the original spec. All concepts are preserved above. The following editorial changes were made:*

- "Fastest possible rendering" → made specific via the tiered fetching model and Cache Components.
- "Caching where appropriate" → replaced with explicit `'use cache'` directive guidance per Next.js 16.
- "Post-render logic" → clarified as a custom pattern using `requestIdleCallback` / `IntersectionObserver` / internal hook, not a framework feature.
- "Server-side components" → corrected to "Server Components" (React Server Components terminology).
