# Research System Frontend

AI-powered research pipeline with human-in-the-loop curation. Searches the web, scrapes content, analyzes sources with specialized AI agents, and generates comprehensive research reports.

This route serves as the **reference implementation** for Next.js best practices across the project.

> Engineering source of truth (entry points, flows, **invariants**): [`FEATURE.md`](./FEATURE.md). Read it before changing pipeline/stream/render behavior.

## Data Model

Projects (from existing project system) have a 1:many relationship with Research Topics (`rs_topic`). Each topic owns keywords, sources, content, analyses, syntheses, tags, documents, and media.

## Routes

All routes live under `app/(core)/research/`.

| Route | Description |
|-------|-------------|
| `/research` | Public landing page (Server Component — zero JS) |
| `/research/topics` | Authenticated topic list with project selector |
| `/research/topics/new` | Topic creation wizard (project > name > template > keywords > settings) |
| `/research/topics/[topicId]` | Topic overview dashboard with pipeline stats + JSON-LD |
| `/research/topics/[topicId]/sources` | Source list with URL-driven filters, bulk actions |
| `/research/topics/[topicId]/sources/[sourceId]` | Source detail with content viewer/editor, analysis |
| `/research/topics/[topicId]/keywords` | Keyword management (add/remove) |
| `/research/topics/[topicId]/analysis` | All analyses for the topic with stats, filters, and full markdown display |
| `/research/topics/[topicId]/document` | Markdown document viewer with TOC, version history, diff |
| `/research/topics/[topicId]/tags` | Tag CRUD with URL-driven search |
| `/research/topics/[topicId]/tags/[tagId]` | Per-tag consolidation view |
| `/research/topics/[topicId]/media` | Media gallery with relevance toggles |
| `/research/topics/[topicId]/costs` | LLM cost breakdown dashboard |
| `/research/topics/[topicId]/settings` | Topic settings |

## Architecture — Next.js Best Practices

### Server-First Data Architecture

The topic layout (`[topicId]/layout.tsx`) server-fetches all critical data before rendering any client components:

1. **`getTopicServer(topicId)`** — fetches the topic row server-side
2. **`getTopicOverviewServer(topicId)`** — calls the `get_topic_overview` Supabase RPC (lightweight counts)
3. Data is passed as `initialData` to `ResearchTopicShell` → `TopicProvider` → Zustand store
4. Store starts with `isLoading: false` and pre-populated data — no skeleton flash

```
Server Layout → fetches topic + counts
  └→ ResearchTopicShell (client) → TopicProvider(initialData)
      └→ Zustand store starts populated
          └→ All child pages render with data on first frame
```

### Why This Matters
- **Direct URL navigation works** — server has cookies, fetches data server-side
- **Client-side navigation works** — Next.js re-runs the layout server-side for the RSC payload
- **No full-page skeletons** — only dynamic data regions (lists, counts) show loading if needed
- **Background refresh** — client-side refresh runs silently after mount, never flashes loading UI

### Rendering Strategy
- **Server Components** for `page.tsx` and `layout.tsx` — fetch data, render static shell
- **Client Components** only at leaf nodes (interactive panels, forms, stream consumers)
- **`loading.tsx`** at every route segment — enables instant perceived navigation via skeleton prefetching
- **`error.tsx`** at research root and topic level — graceful error recovery
- **`not-found.tsx`** for invalid topic UUIDs — proper 404 with back navigation
- **No `<Suspense>` wrapping client components** — data is pre-populated from server, no async boundary needed

### Skeleton Strategy
- **Never skeleton the entire page** — skeleton only the dynamic data regions
- Toolbars, sidebars, headers, card frames render instantly from static markup or server data
- Only list areas (keywords, sources, topics) show loading skeletons
- Card counts render with real data from the server-fetched RPC

### SEO
- **Static metadata** on research layout with `title.template` for child pages
- **`generateMetadata`** on topic layout — dynamic title, description, OG, Twitter from Supabase
- **JSON-LD** structured data (`ResearchProject` schema) on topic overview page
- **Canonical URLs** and proper `robots` directives

### State Management
- **Zustand store** (`state/topicStore.ts`) with server-provided initial data
- Store accepts `TopicStoreInitialData` — pre-populates `topic` and `progress`, sets `isLoading: false`
- Components subscribe to specific slices via selector hooks — only re-render when their data changes
- **URL search params** for all filter, sort, search, and pagination state
- Backward-compatible `useTopicContext()` hook wraps Zustand selectors

### Performance
- **`get_topic_overview` RPC** — single SQL function returns all overview counts (replaces heavy Python aggregation)
- **React Compiler** enabled — automatic memoization
- **`ResearchLanding`** is a Server Component (zero client JS for the landing page)
- **`PublicHeader`** uses `dynamic()` with `ssr: false` for auth/theme — non-blocking initial render
- **Root layout** isolated from schema system (only loaded in authenticated routes)

### Data Fetching Strategy

| Source | Used For |
|--------|----------|
| **Supabase (server, in layout)** | Topic row + overview counts (RPC) — pre-populates client store |
| **Supabase (client, in hooks)** | List data (keywords, sources, tags, etc.) — fetched after hydration |
| **Python API** | Suggest (LLM), create topic, add keywords, search/scrape/analyze/synthesize (SSE streams), run pipeline, document generation, tag consolidation/suggestion, content versioning, links/costs aggregation |

### Key Files

| File | Purpose |
|------|---------|
| `service/server.ts` | Server-side Supabase functions (`createClient()`) for layouts |
| `service.ts` | Client-side Supabase functions for hooks |
| `state/topicStore.ts` | Zustand store with `TopicStoreInitialData` support |
| `context/ResearchContext.tsx` | `TopicProvider` accepts `initialData`, silent background refresh |

### Key Hooks

| Hook | Purpose |
|------|---------|
| `useTopicContext()` | Full topic state (backward compat — wraps Zustand) |
| `useTopicId()` | Just the topic ID (most components only need this) |
| `useTopicData()` | Topic + loading + error (no progress, no refresh) |
| `useTopicProgress()` | Pipeline progress only |
| `useStreamDebug()` | Stream debug events for overlay |
| `useResearchApi()` | Python API methods wrapping `useBackendApi` |
| `useResearchStream()` | NDJSON streaming with progress tracking |
| `useSourceFilters()` | URL-driven filter state management |

## Mobile UX

- `useIsMobile()` conditional rendering throughout
- Bottom navigation bar on mobile, sidebar on desktop
- Dialogs become Drawers on mobile (bottom sheets)
- `dvh` units, `pb-safe`, 16px input fonts, 44pt touch targets

## Dependencies

- `zustand` — Zustand store for topic/stream state
- `react-markdown` + `remark-gfm` — document rendering
- `react-diff-viewer-continued` — version comparison
