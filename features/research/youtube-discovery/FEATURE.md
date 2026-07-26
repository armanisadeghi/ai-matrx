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
- Video previews use the shared privacy-enhanced YouTube embed primitive.
- This surface is transient discovery. Persisting selected videos into research
  remains a separate research action.

## Current demo scope

The demo proves the complete discovery experience: search, sort, filter,
paginate, compare authority signals, preview, and open a result on YouTube. It
does not yet add a selected video to a research project.
