# Research — the Next.js reference implementation

> Cross-repo system-of-record: `/Users/armanisadeghi/code/common-docs/systems/knowledge/research/STATE.md` — read it before touching this feature in ANY repo.
> Local rules for this directory: [`FEATURE.md`](./FEATURE.md).

This route is the repo's **reference implementation** for Next.js patterns. The rules below are
what other features copy — they are about rendering and data flow, not about research.

## Server-first data flow

`[topicId]/layout.tsx` (a Server Component) fetches `getTopicServer(topicId)` and
`getTopicOverviewServer(topicId)` before any client component renders, and passes them as
`initialData` → `ResearchTopicShell` → `TopicProvider` → the Zustand store, which therefore starts
with `isLoading: false` and real data.

- **Server Components for `page.tsx` / `layout.tsx`; client components only at leaf nodes.**
- **Never `<Suspense>`-wrap a client component here** — data is pre-populated, so there is no
  async boundary to suspend on.
- **Never skeleton the whole page.** Toolbars, sidebars, headers and card frames render instantly
  from static markup or server data; only list regions get skeletons. Card counts render with real
  server-fetched numbers.
- `loading.tsx` at every route segment, `error.tsx` at the research root and topic level,
  `not-found.tsx` for invalid topic UUIDs.
- The client-side refresh after mount is **silent** — it must never flash loading UI.

## State and URL

Zustand (`state/topicStore.ts`) with `TopicStoreInitialData`; components subscribe through
selector hooks (`useTopicId`, `useTopicData`, `useTopicProgress`, `useTopicContext`) so only the
consumers of a slice re-render. **All filter, sort, search and pagination state lives in URL
search params** (`useSourceFilters`), never in component state.

## Where data comes from

Supabase **server** (layout): the topic row + the `get_topic_overview` RPC. Supabase **client**
(hooks): list data after hydration. **Python (aidream)**: LLM and compute only — suggest,
search/scrape/analyze/synthesize streams, run pipeline, document generation, tag
consolidation/suggestion. Python is never a database gateway.

## SEO and mobile

Static metadata with `title.template` on the research layout; `generateMetadata` on the topic
layout; JSON-LD (`ResearchProject`) on the topic overview; canonical URLs and `robots`.
Mobile: `useIsMobile()`, bottom nav instead of sidebar, Dialogs become Drawers, `dvh` units,
`pb-safe`, 16px input fonts, 44pt touch targets.
