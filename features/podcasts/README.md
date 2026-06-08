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
```
