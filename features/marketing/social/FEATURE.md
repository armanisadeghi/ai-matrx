---
type: Feature
title: "Social Intelligence UI (marketing/social)"
description: "The Socials section at /marketing/[brandId]/socials: data layer, standards components, Accounts, account detail, post detail (SI-07a), Outliers + watchlists, KPIs + goals + benchmark, the Analytics social panel and the agency roll-up (SI-07b1 / SI-08)."
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
| `/socials/outliers` | `OutliersTab` (live, SI-07b1) |
| `/socials/kpis` | `KpisTab` (live, SI-08) |
| `/socials/{studio,swipe,ads}` | `SocialsTabPlaceholder` — a registry row each (`marketing.social.<tab>`), announced through `announceComingSoon`; replace the page body, keep the route |
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
  `judgeFollowerGrowth`, `filterAndSortPosts`, `postMetricSeries`, `availableMetrics`, `relativeAge`, `num`, `currentFollowers`. `outlier.ts` owns `profileBaseline` / `median` — the only place a creator's median views and engagement are computed (account page, Accounts table, KPI benchmark).
- `@/features/marketing/social/outlier` — THE tier thresholds + text (`outlierBadgeModel`, `formatMultiplier`,
  `formatCompact`, `formatPercentile`, `OUTLIER_TIER_THRESHOLDS`). One source; change a threshold here only.
- `@/features/marketing/social/link` — pasted-link helpers (`detectPlatform`, `looksLikePostUrl`, `handleFromInput`).

Standards components (`@/features/marketing/social/components/…`)
- `OutlierBadge` — `<OutlierBadge input={post.outlier} />` or `model=`. Handles tiers, `~` young posts, "11+ posts" no baseline.
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

## Outliers, KPIs, roll-ups (SI-07b1 / SI-08)

- `outliers.ts` (pure, tested) — `OutlierFilter`, `applyOutlierFilter`, `sortOutliers`, watchlist (de)serialization, hit resolution.
  A watchlist = `platform.saved_view` (surface `social.outliers`, `subject_id` = brand, written ONLY through the
  `saved_view_save` / `saved_view_archive` doors, read through `saved_view_list_lanes`). Its hits are **computed on view**:
  the filter applied to the brand's posts; a match with no `social.watchlist_hit` row is implicitly `new`; Mark seen /
  Dismiss / Restore upsert the row (`setHitStates`). Opening a post marks it seen. Dismissed hide behind a switch.
  **Alerts are a disabled control** (`OUTLIER_ALERTS_ENABLED = false`): no schedule, no auto-notification until approved.
- `OutliersTab` — one filter row (watchlist, platform, role, window 7/30/90d, min multiple, format, sort), Cards
  (`SocialPostCard`, with `extraActions` Why it worked / Dismiss and a new dot) or Table (`MatrxDataTable`), `PostDrawer`.
  "Why it worked" opens the drawer on its Breakdown tab (`initialTab`), which answers honestly while the agent is unbuilt.
  Platform and role pickers choose one or all (a stored multi-value watchlist shows "Several").
- `kpi.ts` (pure, tested) — goals in `social.kpi_goal`. UI metrics: followers, avg views (`views`), posts per week (`posts`),
  engagement rate (percent), outlier count (`custom` + label `Outlier count`; the table's CHECK has no such metric).
  `measureGoal` states each metric's rule; scope = the goal's account, else platform, else every `own` account.
  `goalProgress`: achieved / on track / behind / no data / paused; cumulative goals (followers from the stored baseline,
  outlier count) pace against time elapsed with `KPI_PACE_TOLERANCE`; level metrics are on track from 80% of target.
- `KpisTab` — goal tiles with progress + pace marker and pause/remove, Trend (a `MetricChart` per own account with the
  follower-growth judge), Benchmark (`MatrxDataTable`: followers, 30d growth, posts/week, median views, engagement,
  outlier rate; own rows first), Own channel (`BrandChannelPanel` for the owned YouTube channel; other platforms show
  "Coming with platform approvals").
- `readBrandSocialData` (service) — ONE direct read of the brand's accounts, 400 days of posts with stats (role attached)
  and follower snapshots; `useBrandSocialData` feeds Outliers, KPIs and the Analytics panel.
- `SocialAnalyticsPanel` — on the brand Analytics page beside `BrandChannelPanel` (tiles: tracked accounts, own
  followers, outliers 30d, goals on track; link to KPIs). `SocialReportsSection` — on `/marketing/reports`: cross-brand
  table of tracked accounts and recent (30d, 3x+) outliers; never filtered by the active organization.
- Not built: AI actions (Explain change, Suggest goals, Summarize feed), Patterns right rail, Content (by hook type)
  view, Compare = Competitors overlay lines, Share snapshot link, CSV export on KPIs, `account_insight_daily` for
  non-YouTube platforms (no writer yet), saved-view editing (a watchlist is created and removed, not edited in place).

## Kinds, tiles, Studio (SI-07c)

- `kind-models.ts`: rows -> the registered kinds (`socialPostKind`, `socialProfileKind`, `outlierRowKind`, `adCreativeKind`, `swipeCollectionKind`, `postTranscriptKind`) and kind -> card (`postCardModelFromKind`). `tile-data.ts`: ad, swipe collection and brand-outlier reads for the Board tiles. `link.ts` `classifySocialLink`: post vs profile for a pasted line.
- The six distilled kinds have one canonical component each (`components/mardown-display/blocks/social-kinds/social-kind-blocks.tsx`, reusing `SocialPostCard`, `OutlierBadge`, `PlatformMark`); compiled mirrors in `features/content-ir/kinds/social-kinds.ts`; `kind_component` rows landed and the kinds activated through `content_ir.set_kind_activation`. Placeholders (`post_breakdown`, `hook_set`, ...) stay inactive.
- Board tiles and their surfaces: `features/board/FEATURE.md` § Social tiles. Studio boards: `studio/studio-boards.ts` (`settings.brand_id`), `components/StudioTab.tsx`.

## Polish rules (SOC-POLISH-B, 2026-10-09)

- **A post's address and author come from the stored post.** `link.ts` `canonicalPostUrl` / `mappers.ts` `postAddress`: where the stored address names another account than the post's author (TikTok, X) it is rebuilt from the author and post id; the pasted link is only a way in. Cards, kinds and the Board tile all read it through `postAddress`. Server mirror: `ingest.py` `canonical_post_url` (SCHEMA.md A5).
- **A refused read speaks in a person's words.** `failure.ts` `describeSocialFailure` (title, one reason, `canRetry`, `canCapture`); `socialErrorMessage` no longer carries vendor or cache wording. Every surface that shows a refusal uses it, with `gated/RefusedReadOffer` / `GatedCaptureOffer` for the capture ways.
- **A brand's post panel belongs to that brand's pages** (`panelScope.ts`, used by `SocialPostWindow`): it closes on another brand, /board or any non-brand page, and a restored `?panels=` link on another page does not open it. A panel opened outside a brand follows the person.
- **A brand's accounts become profile tiles** through `board-accounts.ts` (own first, stored-only for the Studio starter) and `studio/studio-starter.ts`; the Add menu's "From this brand's accounts" picker is in `features/board/items/social-items.tsx`.

## Close rules (SOC-CLOSE-1, 2026-10-09)

- **A row click opens what the row is, never raw fields.** Every `MatrxDataTable` here spreads `socialRowOpen(...)` (`row-open.ts`: generic side panel + row window off, `onRowOpen` = the account page, the post panel, or `components/AccountSummary` for an account with no page). Guard: `__tests__/row-open-rule.test.ts` counts tables vs rules per component file.
- **`SocialImage` asks the element, not only the event** (`imageSettled`): a cached image can finish before `onLoad` is heard or before the source effect re-arms "loading".
- **A raw YouTube channel id is never a name or handle** (`accountLabels(name, handle, platform)`, `formatSocialHandle`): the stored name, else "YouTube channel".
- **Overview card and Accounts show the same numbers** for a row (readings show even when not tracked); the person-owner chip is hidden on a person brand (`showOwnerChip`).

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

`__tests__/outliers.feed.test.ts` (filter, watchlist serialization, hits), `kpi.test.ts` (current-vs-target math, pace,
benchmark), `__tests__/classify-social-link.test.ts` (pasted-line classification), `__tests__/outlier.test.ts` (tiers, text, badge states), `mappers.test.ts` (growth judge, account roll-ups, filters,
series), `link.test.ts`, `stream.test.ts` (the NDJSON contract). Run: `pnpm test features/marketing/social`.

## Swipe file and Ads (SI-07b2)

- **Swipe file** (`SwipeFileTab`): collections rail (create, rename, archive = `deleted_at`, "Show archived" + Restore), masonry of
  saved posts (`SocialPostCard`) and ads (`AdCard`), filters (type, platform, format, tag, date saved, search), `SwipeItemSheet`
  (note, tags, copy/remove per collection, move, `Open post details` -> `PostDrawer`), `Save link` (ingest stream, then add), bulk
  add-to-collection and bulk transcribe (estimate + confirm first). Pure rules: `swipe.ts`.
- **Where note and tags live:** on the membership edge (`platform.associations.metadata = {note, tags[]}`), written by the server's
  `PUT /social/collections/{id}/items/{type}/{id}`. Not `platform.tag`: a post/ad is shared Layer A, so a person cannot file a tag
  under it (`file_under_tag` needs editor on the item). Per collection, so a many-collection item has one pair each.
- **Ads** (`AdsTab`): Search (Meta/TikTok/Google/LinkedIn by keyword or advertiser; shows the provider's effective country from
  `effective_params`, cost, fallback chip; save to swipe file; track advertiser) and Tracked (a `platform.saved_view`, surface
  `social.advertisers`, definition `{library, advertiser, advertiserPlatformId, lastLookAt}`; ads first seen after `lastLookAt`
  are marked New, `Mark seen` moves the look; `Look again` = one confirmed search; format mix + landing-page ranking). No schedules.
  Pure rules: `ads.ts`.
- **Operations:** `SocialProviderCard` on `/marketing/operations/connections` (status + platform coverage from `GET /social/capabilities`,
  credits from the new `GET /social/credits`). Spend this month reads "Not recorded by the server yet": the social server writes no
  provider spend to a ledger. No Capabilities entry: that page is the SEO capabilities catalogue.
- **Open:** `Add to board` (the board has no tile that holds a specific saved post/ad; add to the bulk bar when board-tiles lands);
  Meta video ads show a label tile (the normalizer keeps only the video file, no poster); Share link, Table view, Suggest tags/Brief.
- Tests: `swipe.test.ts`, `ads.test.ts`, `providerCard.test.ts` (jest).

## Player, watchlist memory, goals (SI-FIX-SOCIALS-2)

- `PostMedia` (PostDetail): YouTube = official embed, never "Fetch"; other platforms = stored mp4 via the playback door. Frame sized by the real aspect ratio; the drawer is a fixed width.
- Outliers: the last watchlist is kept in the URL (`?watchlist=`) and per brand in this browser; posts have "Save to swipe file" (card menu and table row action).
- KPIs: goals are editable (`GoalDialog`, `updateKpiGoal`); with no tracked own accounts the empty state offers "Track own accounts" (`useTrackOwn`, shared with the Accounts tab).
- Swipe: both save dialogs carry the note + tags editor (`NoteTagsFields`, shared with the item sheet).

## Brand social accounts — ONE list (contract for the UI, 2026-10-09)

A brand's social account = ONE `web.property` row (non-website kind). Tracking hangs off it via
`social.tracked_account.property_id`. Every surface that shows "the brand's socials" — Overview presence card,
Brand Home, Socials → Accounts (own), brands-list count, Research subject — reads the RPCs below. Never re-merge
`web.property` + `tracked_account` in the client (the old `mappers.ts` own-property merge is superseded by this read).

**Read the list** — `supabase.schema("social").rpc("brand_social_accounts", { p_brand_id })` (SECURITY INVOKER: the
caller's RLS on every source table applies). One row per account, ordered company before person, tracked first, then
platform, handle:

| Field | Type | Meaning |
|---|---|---|
| `row_key` | text | Stable React key: the property id, or `tracked:<id>` for an own/client tracked account with no property yet |
| `property_id` | uuid \| null | The `web.property` (null only on a `tracked:` row) |
| `platform` | text | Property kind (instagram, tiktok, youtube, linkedin, facebook, x, threads, pinterest, reddit, snapchat, other) |
| `handle`, `url`, `display_name`, `property_status` | text | From the property (`handle` filled by the shared rule) |
| `owner_kind` | `company` \| `person` | Whose account: the brand's, or a named person's (founder/spokesperson). Group by it; KPIs and Research default to `company` |
| `owner_party_id`, `owner_name` | uuid, text \| null | The person (`crm.party`) when named |
| `trackable` | boolean | Server can track this platform (computed in SQL `social.brand_social_accounts`, mirrored by `TRACKABLE_PLATFORMS` in `types.ts` — change both; false: snapchat, other — say why, no button). Pinterest tracks an account's pins (outlier multiple in saves); Reddit tracks a subreddit (multiple in upvotes); Threads multiple in likes (`outlierMetric(platform)`) |
| `tracked_account_id`, `tracked_role`, `tracked_status`, `tracked_label` | | Null = not tracked. Role is `own`/`client`; status `active`/`paused` |
| `profile_id`, `profile_handle`, `profile_display_name`, `profile_url`, `avatar_url`, `is_verified` | | The shared `social.social_profile` when tracked. Avatar via the existing avatar door (provider URL is a hint) |
| `followers`, `followers_observed_at` | bigint, timestamptz | Latest snapshot (falls back to the profile count) |
| `followers_30d_ago` | bigint \| null | Latest snapshot at or before 30 days ago; growth = `followers / followers_30d_ago - 1`; null = not enough history (say so) |
| `posts_tracked`, `last_post_at` | bigint, timestamptz | Posts in the cache for the profile |
| `best_multiple_30d`, `best_post_id_30d` | numeric, uuid \| null | Highest outlier multiple among posts of the last 30 days |
| `last_refreshed_at` | timestamptz | Profile's last refresh |

Row click → `/marketing/[brandId]/socials/[platform]/[tracked_account_id]` when tracked; external icon → `url`.

**Built (2026-10-09):** `readBrandSocialAccounts` / `useBrandSocialAccounts` + `brandSocialRowToAccountRow` (mappers) are the one read. The Overview
"Social profiles" card (`components/brands/BrandSocialProfilesCard.tsx`) renders them; Socials → Accounts (`readAccountRows`) is that same list plus
the competitor / inspiration accounts; the brands list counts via `readBrandSocialCounts`. Confirming a discovered social profile writes the property
with `handle` from `classifySocialLink` and invalidates `["marketing","social","brand-accounts"|"brand-counts"]`.

**One identity per account (A3):** `propertyIdentity` (link.ts) = `web.property_identity` in the DB; unique index `property_social_identity_unique` forbids a second live row per (brand, kind, owner_kind, identity). Create paths (`createProperty`, `confirmDiscoveredProperty`, server `link_brand_property`) find-or-create. The person chip (`PersonOwnerChip`) shows the linked person or offers "Link person".

**Read counts** — `supabase.schema("social").rpc("brand_social_counts", { p_brand_ids: string[] })` →
`{ brand_id, accounts, tracked, company_accounts, person_accounts }[]` (brands with zero accounts are absent → 0). The
brands list "Socials" column shows `tracked/accounts`; same source as the list.

**Write paths**
- Track (own/client) — `POST /social/tracked` with `brand_id` (and `property_id` when the row has one). The server
  finds-or-creates and links the property and returns `property_id`, `property_created`. A Track dialog with role
  Own and only a handle now lands on the brand's list. Competitor/inspiration never create a property.
- Untrack — `DELETE /social/tracked/{id}`: the property stays on the list as "Not tracked".
- Add/edit property in the UI: write `handle` from `classifySocialLink(url)?.handle` (`link.ts`) — the same rule the
  server uses (`profile_handle_cases.json` case table, identical in both repos, both test suites run it). Owner:
  update `owner_kind` (`company`|`person`) and `owner_party_id` (person only; DB CHECK refuses a party on a company row).

**Swipe tab is brand-scoped (SOC-FIX-E, 2026-10-09).** Collections carry an optional `brand_id`. The Swipe tab
defaults to "This brand" (collections linked to the brand); "All collections" shows every one, including unlinked.
Each collection's menu has Link to / Unlink from this brand (`setCollectionBrand`). Rules: `collectionsForBrandScope`.

**Change Log: page-pass 2026-10-09 (Studio, type: single-record board, sharp after Miro/FigJam).** Studio title menu has one "New board" (the brand-linked one; `hideNewBoard` on `PresetBoard`/`BoardPage`); the "Add your accounts" offer re-reads every 4 s while shown so adding an account tile from the Add menu removes it; a pasted post link that is not stored yet draws a link face (platform mark + address) instead of a blank grey card at far zoom; the template preview names tile kinds ("Social post", "Write-up"), not registry keys.

**Change Log: page-pass 2026-10-09 (Accounts, account page, post page/panel; types: list, single record).** A post card's @creator and the Outliers table's Creator cell link to the account's route (`account-href.ts` `accountHref`, the one place every account link is built; the guard in `__tests__/row-open-rule.test.ts` scans every Socials `.tsx` for a table without `socialRowOpen` and pins the route). Agent surfaces: Accounts list = `matrx-user/marketing-social-accounts` (new; read values + XML bundle), account page = `matrx-user/social-profile`, post page and post panel = `matrx-user/social-post` (same values and four actions as the board tiles; the actions are `components/usePostActions.ts`, shared with the tile). Route map: aidream `route-to-surface.ts` (chat package publish owed). No write targets yet: Track/Refresh spend plan credits, role change and Stop tracking have no agent twin.

**Change Log: page-pass 2026-10-09 (Outliers, KPIs, Swipe file, Ad library; type: list; posture sharp after Linear).** Each tab is its own agent surface (`matrx-user/marketing-social-outliers|kpis|swipe|ads`, `features/surfaces/manifests/marketing-social-tabs.manifest.ts`; values from what is on screen, XML bundles for the lists; view/filter tools are `ui`, save watchlist / remove watchlist / new collection / ad search are `entity`); route map in aidream `route-to-surface.ts` (chat package publish owed). Outliers empty state names why (no posts / already at the widest filter) and offers Widen window only when it changes something; KPIs has one New goal button and no bare dash badge; swipe cards drop the no-baseline "11+ posts" badge and open from the title; ad formats read as words (DCO = Dynamic creative); loading is a skeleton; the tabs carry `matrx-touch-targets`; 12px text. Left: goal create/edit/pause/remove, swipe save-link/rename/archive/notes, ad Track/Look again/Stop have no agent twin yet (credit spend or derived fields); Tracked advertisers is organization-wide, not per brand.
