# YouTube Discovery

## Purpose

YouTube Discovery is the user-facing exploration surface for finding strong
video sources before they are added to a research project. It uses the same
enriched YouTube Data API primitive as the automated research pipeline.

## Entry points

- UI: `YouTubeDiscoveryDemo.tsx`
- API client: `service.ts`
- API types and defaults: `types.ts`
- Demo route: `/demos/youtube-discovery` in full-profile builds
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
- Result actions can copy the canonical YouTube link, and previews can copy the
  displayed description text.
- Video previews use the shared privacy-enhanced YouTube embed primitive.
- This surface is transient discovery. Persisting selected videos into research
  remains a separate research action.

## Current demo scope

The demo proves the complete discovery experience: search, sort, filter,
paginate, compare authority signals, preview, and open a result on YouTube. It
does not yet add a selected video to a research project.

## Changelog

- **2026-07-25** — Added light-theme parity, default channel diversity, exact
  under-10/under-20 duration controls, permanently unfiltered discovery, and
  copy actions for links and preview descriptions.
