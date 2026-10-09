---
type: Feature
title: "Social Intelligence UI (marketing/social)"
description: "The Socials section at /marketing/[brandId]/socials: data layer, standards components (outlier badge, post card, metric chart, provider notice), Accounts, account detail, post detail. Lane SI-07a."
tags: [marketing, social, ui]
timestamp: 2026-10-09
---

# features/marketing/social

Product truth: `common-docs/systems/marketing/social/` (VISION, UI-SPEC = the blueprint, SCHEMA, PLAN §4/§9).
Server contract: `aidream/aidream/services/social/FEATURE.md`. Built by lane SI-07a; SI-07b (Studio, Swipe, Outliers)
and SI-07c (Ads, KPIs) fill the other tabs and **build on the modules listed here — never a second copy**.

## Routes (`app/(core)/marketing/[brandId]/socials/`)

| Route | Renders |
|---|---|
| `/socials` | redirect to `/socials/accounts` (temporary redirect, never a cached 308) |
| `/socials/accounts` | `AccountsTab` (live) |
| `/socials/{studio,outliers,swipe,ads,kpis}` | `SocialsTabPlaceholder` — a registry row each (`marketing.social.<tab>`), announced through `announceComingSoon`; replace the page body, keep the route |
| `/socials/[platform]/[accountId]` | `AccountDetail`. `accountId` is the **shared profile id** (`social.social_profile.id`), not the tracked-account id, so an untracked profile also opens |
| `/socials/post/[postId]` | `PostDetailPage` (same body as the drawer) |

`layout.tsx` mounts `SocialsShell`: ONE header row via `RecordPageHeader` (tab strip in the mode slot, `Track account`
as the primary action) and the header-offset scroll body. Tabs are route segments. A tab's page renders only its body.

## Module map — import these, do not re-derive

Data layer
- `@/features/marketing/social/types` — row aliases off `types/database.types.ts` (`SocialProfileRow`, `SocialPostRow`,
  `PostStatRow`, `TrackedAccountRow`, `SwipeCollectionRow`, `SocialAdRow`, `WatchlistHitRow`…), `SOCIAL_PLATFORMS`,
  `TRACKED_ROLES`, `SOCIALS_TABS`, the server shapes (`IngestPostResult`, `TrackAccountInput`…) and the view models
  `PostCardModel`, `AccountRow`, `OutlierInput`.
- `@/features/marketing/social/service` — direct Supabase reads/edits under RLS (`readAccountRows`, `readProfilePosts`,
  `readPostDetail`, `readPostMetricSnapshots`, `readPostTranscript`, `readPostAnalysis`, `readSwipeCollections`,
  `readProfileSnapshots`, `updateTrackedAccount`, `setTrackedRole`). `readAllRows` on every unbounded list.
- `@/features/marketing/social/server` — typed client for aidream `/social` via `lib/python-client`
  (`ingestPost`, `ingestProfile`, `trackAccount`, `untrackAccount`, `refreshProfile`, `getTranscript`, `analyzePost`,
  `listPostMedia`, `fetchPlaybackUrl`, `createCollection`, `addToCollection`, `socialErrorCode`, `socialErrorMessage`).
  Every call names the **brand's** organization. `ads/search`, `outliers`, `save-link`, `capabilities` are documented
  server doors NOT yet wrapped — SI-07b/c add them here, same `CallOptions`.
- `@/features/marketing/social/stream` — the NDJSON contract as pure functions (`consumeSocialEvents`, `progressOf`,
  `SocialStreamError`). In-stream `error` events surface as `SocialStreamError` (carries `code`).
- `@/features/marketing/social/hooks` — TanStack Query hooks + `socialKeys` (`useAccountRows`, `useProfilePosts`,
  `usePostDetail`, `usePostMetrics`, `usePostTranscript`, `usePostAnalysis`, `useSwipeCollections`,
  `useInvalidateSocial`). A mutation calls `useInvalidateSocial()`.
- `@/features/marketing/social/mappers` — pure row→view-model rules (unit-tested): `toPostCardModel`, `buildAccountRows`,
  `judgeFollowerGrowth`, `filterAndSortPosts`, `postMetricSeries`, `availableMetrics`, `relativeAge`, `num`, `median`.
- `@/features/marketing/social/outlier` — THE tier thresholds + text (`outlierBadgeModel`, `formatMultiplier`,
  `formatCompact`, `formatPercentile`, `OUTLIER_TIER_THRESHOLDS`). One source; change a threshold here only.
- `@/features/marketing/social/link` — pasted-link helpers (`detectPlatform`, `looksLikePostUrl`, `handleFromInput`).

Standards components (`@/features/marketing/social/components/…`)
- `OutlierBadge` — `<OutlierBadge input={post.outlier} />` or `model=`. Handles tiers, `~` young posts, "—" no baseline.
- `SocialPostCard` — `<SocialPostCard post={PostCardModel} onOpen onSave compact />`. Thumbnail aspect reserved; platform
  mark; outlier badge; hook line; `⋯` menu. Does NOT use `card-and-grid` `Card` (an icon-launcher card, nothing to reuse).
- `PostDrawer` + `PostDetailBody` (in `PostDetail`) — `<PostDrawer post={card|null} onClose />` opens the right drawer from
  any card; `PostDetailBody` is the shared body.
- `MetricChart` (+ `seriesToCsv`, `contiguousRunSplit`) — one hand-drawn SVG chart for post metrics and account followers.
- `ProviderFallbackNotice` (+ `hasFallback`, `providerName`) — `via <provider>` chip with the reason as tooltip.
- `PlatformMark` (+ `platformLabel`) — wraps the existing `PropertyKindMark`, which already carries every social platform
  glyph on its brand color (no extension was needed).
- `SocialsContext` / `useSocials()` — `{brandId, brandSeg, organizationId, openTrack}` for any tab body.
- `TrackAccountDialog`, `AccountsTab`, `AccountDetail`, `SocialsShell`, `SocialsTabPlaceholder`.

## Decisions and edges

- **Reads direct, compute through the server.** No Next.js API routes. Plain edits (role) are Layer B row updates under RLS.
- **Which tracked accounts a brand shows:** the brand organization's rows with `brand_id = this brand` OR `brand_id is null`
  (an organization-wide account belongs to every brand until assigned). Own properties (`web.property`, social kinds) list
  as `Own` rows with status "Not tracked" until a tracked account matches platform + handle.
- **Account detail shows no breakdown tab yet** (UI-SPEC lists Posts · Outliers · Growth · Breakdown): it needs post
  analyses to exist, and the breakdown agent is not built. Post detail's Breakdown tab shows the honest
  "Breakdown agent not built yet" state on the server's 409 `social_agent_not_built`.
- **Not built (open for later lanes):** comments tab and "Mine comments", Download, inline hover preview, transcript
  timestamp sync to the player, watchlists, saved views (`TableSavedViews`) on the accounts table, drill-down by
  platform/format, bulk row actions, Accounts "Cards" view, account Pause and `Profile summary`.
- **Playback:** the door's bytes are fetched with auth into a blob URL on Play (a `<video>` cannot send the bearer token),
  revoked on unmount. Large videos load fully before playing.
- **Thumbnails** on list cards are the provider URLs (they expire; ruling in REGISTER) — an expired one falls back to the
  platform mark. Opening a post once lands stored media.
- Money-bearing clicks (refresh, fetch media, transcript, remove) go through `confirm()` naming the cost.

## Tests

`__tests__/outlier.test.ts` (tiers, text, badge states), `mappers.test.ts` (growth judge, account roll-ups, filters,
series), `link.test.ts`, `stream.test.ts` (the NDJSON contract). Run: `pnpm test features/marketing/social`.
