# Podcasts Feature (`pc_`)

Podcast sharing system with public shareable pages and an admin management UI.

## Database Tables

Both tables are prefixed `pc_` (podcast module). RLS: public SELECT, authenticated-only INSERT/UPDATE/DELETE.

- **`pc_shows`** — podcast series/channels (title, slug, description, image_url, author, is_published)
- **`pc_episodes`** — individual audio episodes (slug, show_id FK nullable, user_id FK nullable → auth.users, audio_url, image_url, video_url, display_mode, episode_number, duration_seconds, is_published). `user_id` attributes creator ownership for generated and admin-created episodes; nullable for legacy rows.

Cross-table slug uniqueness is enforced via DB triggers — a slug cannot exist in both tables simultaneously.

## Public Routes

`/podcast/[slug]` — resolves slug or UUID against episodes first, then shows.

- **Episode page** — renders in one of three modes with full fallback to audio-only:
  - `audio_only` — centered player with default icon
  - `with_metadata` — cover art + title/description + player
  - `with_video` — looping muted video background + player overlay
- **Show page** — lists all published episodes with links to their individual pages

SSR metadata (`generateMetadata`) provides OG tags, Twitter cards, and audio metadata for social sharing. `revalidate = 3600` (ISR).

## Creator Routes — Podcast Studio (user-facing)

The user-facing surface for creating podcasts (admins manage the catalog under `/administration/podcasts`).

- **`/podcast/studio`** — the studio dashboard. A library of the episodes you've created
  (`pc_episodes.user_id`) and the shows that host them, with prominent paths to **Create episode**
  and **New podcast**.
- **`/podcast/studio/create`** — the live **podcast generator**. Streams a full end-to-end run from
  the Python backend (`POST {base}/podcast/generate`, NDJSON) and renders it as it arrives: live
  stage rail + progress, title/description the instant metadata lands, then 5 cover-art + 2 video
  **options filling in one-by-one (out of order)**, then the audio player, transcript, and a link to
  the real episode. From the moment **Generate** is hit, the UI is never idle.

After a run completes, real post-creation actions (no mocks): open the episode, **publish/unpublish**,
**pick a cover** (writes `pc_episodes.image_url`), set the **episode-page display mode**, download the
audio, copy the share link, and native share.

### Generator architecture (`features/podcasts/generator/`)

```
generator/
├── types.ts            ← request + podcast stream events + render-ready run state
├── constants.ts        ← input-type / format / stage presentation metadata
├── reduce.ts           ← pure reducer (folds one podcast `data` event into state)
├── usePodcastRun.ts    ← owns one run; reuses useBackendApi (base+auth) + consumeStream (NDJSON)
└── components/
    ├── PodcastGenerator.tsx   ← orchestrator (compose → live console → result)
    ├── GeneratorForm.tsx      ← input-type tiles, inputs, format, show picker, advanced, truncate
    ├── ShowPicker.tsx         ← choose existing show / default / new
    ├── CreateShowDialog.tsx   ← quick-create a pc_shows row (start a podcast)
    ├── LiveProgressRail.tsx   ← sticky status + stage timeline (the drumbeat)
    ├── MetadataHero.tsx       ← title/description reveal (skeleton → content)
    ├── MediaOptionsGrid.tsx   ← cover-art + video option grids + lightbox
    ├── AssetCard.tsx          ← one slot: shimmer → media, failed badge, pick-cover
    ├── ResultActions.tsx      ← open / publish / display-mode / download / share
    ├── TranscriptPanel.tsx    ← collapsible transcript
    └── ElapsedTimer.tsx       ← mm:ss elapsed
```

`hooks/useMyPodcasts.ts` loads the signed-in user's episodes + available shows for the studio and
picker. The streaming contract is documented in `aidream/docs/podcast/PODCAST_TEST_UI_GUIDE.md`.

**Reuse, not reinvention:** the NDJSON reader is the platform's `consumeStream`
(`lib/api/stream-parser.ts`), the base URL + auth headers come from `useBackendApi` /
`selectResolvedBaseUrl`, the player is the existing `PodcastAudioPlayer`, and images render through
`InlineMediaRef` (the file-handler surface). No new fetch/reader, Redux slice, or player was added.

## Admin Route

`/administration/podcasts` — master-detail split pane (matches ai-models pattern).

- Two tabs: **Episodes** (default) and **Shows**
- Per-tab: search, table with row actions (edit/delete/copy link), create button
- Detail panel slides in alongside the table (50/50 split)
- Direct Supabase client calls — no API routes needed

## File Structure

```
features/podcasts/
├── index.ts
├── types.ts
├── service.ts
├── components/
│   ├── admin/
│   │   ├── PodcastsContainer.tsx   ← state orchestrator
│   │   ├── PodcastsTable.tsx       ← table with row actions
│   │   ├── PodcastDetailPanel.tsx  ← slide-in edit/create panel
│   │   └── PodcastForm.tsx         ← ShowForm + EpisodeForm
│   └── player/
│       ├── PodcastAudioPlayer.tsx  ← mobile-optimized HTML5 audio player
│       ├── PodcastEpisodePage.tsx  ← episode public page (3 modes + fallback)
│       └── PodcastShowPage.tsx     ← show listing public page
├── generator/                      ← live podcast generator (Studio create surface)
├── studio/                         ← studio dashboard (creator library)
└── hooks/
    ├── useShare.tsx
    └── useMyPodcasts.ts            ← signed-in user's episodes + shows
```

## Change Log

- **2026-06-08** — Added the user-facing **Podcast Studio**: `/podcast/studio` (creator library) and
  `/podcast/studio/create` (live streaming generator that drives `POST {base}/podcast/generate` and
  renders stages, metadata, cover/video options, audio, transcript, and the episode link as they
  stream). Added quick-create-show, post-generation actions (publish / pick cover / display mode /
  download / share), and `useMyPodcasts`. Reuses `consumeStream`, `useBackendApi`,
  `PodcastAudioPlayer`, and `InlineMediaRef` — no new primitives.
- **2026-06-08** — Generator engagement + correctness pass: per-asset `image_n`/`video_n` stage rows
  now settle to done/failed when their `podcast_asset` lands (no more stuck spinners); progress is
  derived from completed stages (+½ credit for in-flight) so it's honest and never hits 100% early;
  the live rail shows **all** steps and derives its featured "current" label from the running stages
  (async-aware, never stuck on the last one started). Asset cards show the **full prompt in the tile
  while rendering**, then swap to media-only on arrival; images are larger; videos auto-play
  (muted/looped). Added `ProductionTeaser` — a rotating cover-art showcase + real script sneak-peek
  (from `create_script` stage output) + honest "producing audio" status — shown in the player slot
  while the long audio step finishes, so the wait is never dead air.
