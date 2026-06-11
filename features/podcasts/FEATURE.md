# Podcasts — FEATURE.md

**Status: live, actively expanding.** One of the platform's most popular systems.
Generates full multi-media podcast episodes (script → audio → cover images →
clip videos → composed "official" video) from a topic, notes, full script, or
files, with a live-streaming studio, resumable runs, and public share pages.

## Entry points

| Surface | Route | File |
|---|---|---|
| Public index | `/podcast` | `app/(core)/podcast/page.tsx` → `PodcastGrid.tsx` |
| Public episode/show | `/podcast/[slug]` (slug or UUID) | `app/(core)/podcast/[slug]/page.tsx` → `features/podcasts/components/player/{PodcastEpisodePage,PodcastShowPage}.tsx` |
| Studio dashboard | `/podcast/studio` | `features/podcasts/studio/components/StudioDashboard.tsx` |
| Create | `/podcast/studio/create` | `CreateView.tsx` → `generator/components/GeneratorForm.tsx` |
| Live run | `/podcast/studio/run/[id]` | `StudioRunView.tsx` → `studio/runs/useStudioRun.ts` |
| **Manage show (owner)** | `/podcast/studio/show/[showId]` | `studio/components/ShowManageClient.tsx` — owner-facing show settings: cover/title/description/author, RSS distribution (`rss_settings`), feed URL + submit helpers, episodes list |
| **Upload episode (owner)** | dialog (Studio dashboard + manage page) | `studio/components/UploadEpisodeDialog.tsx` — non-AI "upload your own audio/video" episode creation via `useFileUpload` |
| Admin | `/administration/podcasts` | `components/admin/PodcastsContainer.tsx` |

## Data flow

1. `GeneratorForm` collects a `PodcastGenerateRequest` (`generator/types.ts`).
2. A `pc_studio_runs` row is created (`studio/runs/service.ts`); route → run page.
3. `useStudioRun` POSTs to **`{base}/podcast/generate`** (NDJSON stream; NOT
   under `/api/`), folds events via `generator/reduce.ts`, persists milestones to
   `pc_studio_runs`. Resume → `{base}/podcast/resume/{backend_run_id}`.
4. Backend (aidream `podcast_generator`) runs: prepare/research → script →
   audio + (metadata → images + videos) → official video. `_persist_episode`
   writes a `pc_episodes` row (durable media — see Invariants).
5. Public pages render via `<InlineMediaRef>` (durable) + `PodcastAudioPlayer`.

## Tables (`pc_*`, project `txzxabzwovsujtloxrus`)

- **`pc_shows`** — series (slug, title, description, image_url, og/thumbnail, author, is_published, **`rss_settings` jsonb**). No owner column → "my shows" is derived from episodes. `rss_settings` (Apple category, owner name/email, language, explicit) is read by the feed builder + manage UI; always guard with `?? {}` (migration `pc_shows_rss_settings.sql`).
- **`pc_episodes`** — episode (slug, show_id, user_id, title, description, audio_url, image_url, video_url, og_image_url, thumbnail_url, display_mode, episode_number, duration_seconds, is_published).
- **`pc_studio_runs`** — durable generation record (status, request, title, description, script, audio_url, image_urls[], video_urls[], prompts[], selected_cover_url, episode_id, backend_run_id, error).

## Invariants

- **Media durability (load-bearing).** Every media column the public web reads
  MUST hold a **durable** URL (CDN/public), never an expiring signed S3 URL.
  Enforced in depth: DB guard (`migrations/mtx_public_media_url_guard*.sql` →
  `mtx_media_heal_queue`), frontend classifier (`lib/media/durability.ts`),
  server primitive (aidream `services/media_durability.py`, applied in
  `_persist_episode`), and an **ESLint fence** banning raw `<img>/<video>` in
  `features/podcasts/**`. Render media ONLY via `<InlineMediaRef>` (`@/features/files`).
  The one justified raw element is `PodcastAudioPlayer`'s headless `<audio>`.
  See root `KNOWN_DEFECTS.md` D1.
- **Public pages are anonymous** — they cannot re-mint signed URLs, so durability
  is non-negotiable, not cosmetic.
- **Direct Supabase** for `pc_*` CRUD (`service.ts`, `studio/runs/service.ts`); the
  Python backend only for generation. No Next.js API tier between them.

## Roadmap (see `docs/`)

- `docs/LIVE_INTERACTIVE_PODCAST.md` — flagship: chunked-streamed, hot-mic,
  script-rewrites-the-unplayed-tail interactive podcast.
- `docs/DYNAMIC_HOSTS_AND_THEMES.md` — N-host / formats / themes (latent in TTS
  config; not yet wired to `/podcast/generate`).
- `docs/BLOG_PER_EPISODE.md` — rich SEO blog article per episode (≠ transcript).
- Near-term: RSS feed per show, `file_id` persistence on episodes, transcripts +
  chapters + show notes, search, embeddable player, automated heal (pg_cron).

Much of the above is scaffolded in the UI as **"Coming soon"** (reusable
`components/coming-soon` primitive) so the vision is visible and the server side
is easy to fill in.

## Change log
- 2026-06-10 — **Studio bake-off: `*-reimagine` surfaces (ui-reimagine).** Added
  two presentation-only reinventions on top of the unchanged data layer:
  `app/(core)/podcast/studio/create-reimagine/` (the "Studio Command Bar" — a
  single-canvas composer: hero prompt + source chip rail + inline settings-tray
  pills + real recent-runs rail; same `createRun → stashPendingStart → push`
  submit) and `app/(core)/podcast/studio/run-reimagine/[id]/` (the "Studio Stage"
  — one living cover canvas that breathes while producing and becomes the album
  cover + player when done, with a slim control-rail). Both consume
  `useStudioRun` / generator constants / `MediaOptionsGrid` / `RunRecoveryBanner`
  / `ProductionTeaser` script logic UNCHANGED; every heartbeat / stall /
  background-poll / never-dead-end behavior is preserved. Verified live against
  the real `POST {base}/podcast/generate` stream (create→navigate→stream, real
  metadata/covers/progress) and the real durable-record reload path.
- 2026-06-08 — **Per-asset failures are non-fatal (server + client).** A single
  image/video rejection (Together.ai / Black Forest Labs content moderation
  false-flagging a benign concept) no longer kills the whole run. Server
  (`aidream` `podcast_generator._generate_image/_generate_video`): provider
  exceptions become failed `StageResult`s (soft failures the pipeline carries
  past), the media gather uses `return_exceptions=True` as a backstop, and
  Together image gen defaults `disable_safety_checker=True`. Client
  (`generator/reduce.ts`, `studio/runs/mapping.ts`): a run with audio/an episode
  is `done` (not `error`) even on `success=false`; `reconcile` no longer drops
  failed slots (they persist as retryable "Couldn't render" cards via
  `AssetCard`); durable records the old backend marked `failed` heal to `done`
  on read. Backend needs deploy to stop *new* aborts; client heals existing ones.
- 2026-06-08 — **Generator sources fully wired + Persian live.** Every source tile
  in `GeneratorForm` is now functional — no more ComingSoon source placeholders.
  Website / Note / YouTube / Audio-file sources resolve external content into an
  editable textarea (sent as `input_data`) via new `SourceResolverPanel` +
  `useSourceResolvers`: website → `useScraperApi` + Web Content Extractor agent
  (`bbfc9567-…`); YouTube → YouTube Transcription & Research agent (`7402d782-…`);
  audio file → `useFileUpload` (durable) + `useAudioTranscription` (STT); note →
  `useNotes` content. Agent runs go through the new reusable one-shot primitive
  `features/agents/run/useRunAgent.ts` (`POST /ai/agents/{id}` → NDJSON via
  `consumeStream`). Persian (`fa-IR`) flipped to `enabled: true` (maps to the wired
  `podcast_type: "persian"` path). Request now carries `language` + `host_count`
  (default 2). Replaced the `voice_memo`/"Record yourself" source with `audio_file`
  /"From an audio file"; added `youtube` source.
- 2026-06-08 — **User-facing show management.** Added owner show-settings page
  (`/podcast/studio/show/[showId]` → `ShowManageClient`): cover/title/description/author
  + RSS distribution settings persisted to new `pc_shows.rss_settings` jsonb
  (Apple category list, owner name/email, language, explicit) + computed feed URL
  with copy/submit helpers (Verify-&-submit gated `ComingSoon`). Added the non-AI
  "Upload an episode" flow (`UploadEpisodeDialog`): audio via `useFileUpload`
  (durable public URL), optional cover/video via `AssetUploader`, `display_mode`
  derived from provided media. Wired `feed.xml` to read `rss_settings ?? {}`.
  Migration `migrations/pc_shows_rss_settings.sql` written but NOT yet applied —
  reads guard with `?? {}` until then.
- 2026-06-08 — Media durability defense-in-depth (DB guard + classifier + server
  primitive + `_persist_episode` fix + ESLint fence); healed 5 live episodes.
  Created this FEATURE.md + roadmap docs. Began the feature push (RSS, file_id,
  coming-soon scaffolding, blog-per-episode).
