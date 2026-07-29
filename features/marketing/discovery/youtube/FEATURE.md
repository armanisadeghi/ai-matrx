# YouTube Discovery

**Status:** live

**Route:** `/marketing/discovery/youtube`

## Purpose

YouTube Discovery is Marketing's user-facing exploration surface for finding
strong video sources before they are added to a research project. It uses the
same enriched YouTube Data API primitive as the automated research pipeline.

## Entry points

- UI: `YouTubeDiscovery.tsx`
- API client: `service.ts`
- Reusable processing/results UI: `YouTubeResearchActions.tsx`
- API types and defaults: `types.ts`
- Canonical route: `/marketing/discovery/youtube`
- Direct preview: `/marketing/discovery/youtube/videos/[videoId]`
- Compatibility redirects: `/demos/youtube-discovery/**` in `next.config.js`
  (with route-level shims as defense in depth)
- Server route: `POST /api/research/youtube/search`

## Invariants

- The browser never calls Google directly and never receives the YouTube API
  key. It calls the authenticated AI Dream endpoint through `apiPost`.
- Request and response shapes come from the generated Python OpenAPI contract.
- Search results are enriched with video statistics, duration, tags, topics,
  and channel statistics before they reach the UI.
- Advanced controls expose supported YouTube search filters as ordinary form
  controls. Users never need to write JSON.
- Search is always unfiltered (`safeSearch=none`) at the server boundary; there
  is no client control that can silently filter results.
- The default diversity cap is three results per channel. Users can tighten,
  loosen, or remove it, and can select exact under-10 or under-20-minute
  post-enrichment duration filters in addition to YouTube's native buckets.
- Every surface is theme-aware while preserving the established dark design.
- Result cards show views, likes, subscribers, and formatted video length as
  first-class metrics. They link clearly to both the shared modal preview and
  the permanent full-page route. Result actions can copy the canonical YouTube
  link, and previews can copy the displayed description text.
- Modal and direct-page previews share `YouTubeVideoPreviewContent`, use the
  privacy-enhanced YouTube embed primitive, and link between discovery and the
  durable direct route.
- Every result is registered in the server's permanent global YouTube library
  as soon as it is discovered. Analysis and comment enrichment are
  available on cards, modal previews, and direct preview pages. Completed
  structured analysis renders through the canonical Content IR
  `KindInstanceRender` path and the live `video_transcript_research` component;
  a parse failure renders the saved raw fallback instead of losing the paid
  response.
- Analysis uses the canonical authenticated NDJSON stream. Cards, previews,
  direct pages, and Research batches show live preparation/analysis/completion
  messages, then reconcile the final saved record. The stream is presentation;
  disconnecting never cancels the durable server work.
- `KindInstanceRender` owns the structured artifact's visual shell. The YouTube
  action component must not wrap it in another decorative card.
- Topic association remains an explicit user choice on the Research YouTube
  step. Discovery alone never silently adds a source to a topic.

## Current scope

The surface provides the complete discovery experience: search, sort, filter,
paginate, compare authority signals, preview, trigger/reuse global analysis,
enrich comments, and open a result on YouTube. Topic selection lives at
`/research/topics/[topicId]/youtube`, which reuses the same search surface.

## Changelog

- **2026-07-28** — Promoted video length into the card metrics, added explicit
  full-page navigation from every result surface, renamed the vendor-neutral
  action to Analyze, replaced passive polling with live analysis streams, and
  removed the redundant outer analysis card.
- **2026-07-28** — Connected discovery and both preview forms to the canonical
  permanent video library, AI processing, comment enrichment, processing
  status polling, and the structured/fallback analysis renderer.
- **2026-07-28** — Added each video's formatted duration to the shared preview
  metadata row alongside views and likes.
- **2026-07-26** — Moved the complete feature from
  `features/research/youtube-discovery` to its permanent Marketing home,
  registered the canonical routes and navigation, retained legacy redirects,
  and consolidated modal/direct preview rendering.
- **2026-07-25** — Added light-theme parity, default channel diversity, exact
  under-10/under-20 duration controls, permanently unfiltered discovery, and
  copy actions for links and preview descriptions.
