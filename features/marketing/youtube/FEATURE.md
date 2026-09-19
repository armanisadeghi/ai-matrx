# YouTube (the brand's own channel)

**Status:** live (Plane A + Plane C). Google-native PLAN §4.11, unit U-M3.

**Routes / mounts:** `/marketing/[brandId]/analytics` (the panel, under the
Google Analytics list) · overlay `brandChannelWindow` (the same panel in a
window) · `/detail/web_youtube_video/<id>` (one video as a record).

## Purpose

The operator's OWN channel, mirrored and read-only: which videos went up, how
the channel is doing over 30 days against the 30 before, and a publish-nothing
check that grades a title, description, tags and thumbnail before anyone
uploads them. Champions: TubeBuddy and vidIQ for the check; the GA panel next
door for the delta.

It is NOT the research corpus. `research.youtube_video` (3,065 rows, token
`youtube_video`) is any video we have ever analysed; this feature is
`web.youtube_video` (token `web_youtube_video`) — the channel the organization
owns, authorized by a `users.integration_connection_resources` row.

## Entry points

| file | what it is |
|---|---|
| `components/BrandChannelPanel.tsx` | THE canonical panel. Everything else wraps it. |
| `components/PreUploadCheck.tsx` | The publish-nothing check, a section of the panel. |
| `components/YouTubeVideoSections.tsx` | The two Detail sections a video adds. |
| `itemType.tsx` | `web_youtube_video`'s ONE registration (`refineDetail`). |
| `record.ts` | Pure logic: stats envelope, window totals, fields, health override. |
| `preupload.ts` | Pure scoring. **Imports nothing** — that is what makes "publishes nothing" structural. |
| `service.ts` | The three doors: two direct Supabase reads and the ONE refresh call. |
| `binding.ts` | The brand↔channel binding on `web.brand.integrations`. |
| `associationWrites.ts` | The `covers` edge to `seo_map_topic`, through the ONE chokepoint. |
| `knobs.ts` | `google.youtube.preview_target_keyword_required`. |

Window (four files, the `siteAnalyticsWindow` pattern): `features/overlays/catalogue.ts` ·
`features/overlays/openers/brandChannelWindow.tsx` ·
`features/overlays/OverlayController.tsx` ·
`features/window-panels/windows/marketing/BrandChannelWindow.tsx`.

## Data model

* `web.youtube_video` — entity, `visibility personal`, `default_list_scope mine`,
  soft-delete, NOT versioned. `stats` jsonb carries `__kind: youtube_video_stats`
  (a table CHECK); `sync_status` ∈ {available, unavailable} and an `unavailable`
  row MUST carry a reason. Connection side: `channel_resource_id →
  users.integration_connection_resources`.
* `web.channel_analytics_daily` — **ledger**, `default_list_scope organization`,
  no soft delete. `video_external_id` NULL = the whole channel that day.
* `web.brand.integrations` — the binding, same document shape as
  `web.site.integrations`, key `youtube_channel`.

Both tables are written by exactly ONE writer, `refresh_youtube` in aidream, and
there is **no schedule**: a human press is the only trigger.

## Invariants & gotchas

1. 🚨 **The delta is never computed here.** `judgeGscWindowDelta`
   (`../analytics/gsc-delta.ts`) over `judgeAnalyticsComparison` is the
   platform's one comparison judge; a second `trendPercent` in this feature is
   what `__tests__/the-delta-is-the-one-judge.test.ts` fails on.
2. 🚨 **`youtube` and `youtube_analytics` are DIFFERENT capabilities.** The
   preview is `approved`; analytics sits behind `google.rollout.read_only_sweep_phase`
   (`internal_test` today). The gate notice covers the analytics section only —
   hiding the videos behind it would hide a working half.
3. 🚨 **The per-video analytics lane is unwritten.** The schema has it; the
   server passes `video_external_id=None` on every day. The toggle says so; it
   never shows an empty table that reads as zero views.
4. **Average view duration is watch time ÷ views over the window.** A mean of
   each day's mean weights a four-view day like a busy one.
5. **`web.brand.integrations` may not exist yet.** The chair applies
   `migrations/brand_integrations_youtube_channel.sql`; until then the reader
   answers `column_absent` with the remedy — never `unbound`, which would tell a
   brand that HAS a channel that it does not.
6. **The `covers` edge uses the sanctioned cast** from
   `../seo/topical-map/panel/associationWrites.ts` (the package's target union
   carries neither token; the runtime guard checks canonical tokens, which both
   are). Widening the union is F-65, a package change.
7. **No control here runs a mandate**, so the surface declares no `agentRoles[]`.
   `google.channel_video_plan` and `marketing.video_metadata` are declared and
   seeded; the day a control launches one, it is disclosed through the manifest
   with `MANDATE_KEYS` and adds no visible page content.

## Tests

`__tests__/` — the delta and its refusal, the pre-upload scoring red-then-green,
the registration in all three presentations, the binding's one shape, the
binding's three answers, and the panel in every state.

## Change log

- 2026-09-19 — Created (U-M3). The panel, the window, the pre-upload check, the
  registration handover from the item-presentation registry's inline entry
  (V-22 NEW-6), the brand binding, the knob and the migration file. Neither
  migration is applied — the chair applies both.
- 2026-09-19 — `brandChannelWindow` (registered in `features/overlays/catalogue.ts` /
  `OverlayController.tsx` / `openers/brandChannelWindow.tsx` /
  `features/window-panels/windows/marketing/BrandChannelWindow.tsx`) got its
  missing address: a row in `features/window-panels/registry/windowRegistryMetadata.ts`
  (`urlSync: { key: "brand_channel" }`, singleton, `preservation.requiredDataKeys:
  ["brandId"]` — same shape as `siteTrackingWindow`, since the window is meaningless
  without its brand) and a hydrator in
  `features/window-panels/url-sync/initUrlHydration.ts` reopening it from
  `?panels=brand_channel:<brandId>`. The `everyWindowHasAnAddress` (R35) guard
  was red on `brandChannelWindow` before this and is green after.
