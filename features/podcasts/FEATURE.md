# Podcasts — FEATURE.md

**Status: live, actively expanding.** One of the platform's most popular systems.
Generates full multi-media podcast episodes (script → audio → cover images →
clip videos → composed "official" video) from a topic, notes, full script, or
files, with a live-streaming studio, resumable runs, and public share pages.

## Entry points

| Surface | Route | File |
|---|---|---|
| Public index | `/podcast` | `app/(core)/podcast/page.tsx` → `PodcastIndexClient.tsx` → `PodcastGrid.tsx` — Studio/create CTAs + "Your podcasts" (owned via `useMyPodcasts`, incl. drafts, Manage links) vs "On the platform" (published, minus yours) |
| Public episode/show | `/podcast/[slug]` (slug or UUID) | `app/(core)/podcast/[slug]/page.tsx` → `features/podcasts/components/player/{PodcastEpisodePage,PodcastShowPage}.tsx` |
| Studio dashboard | `/podcast/studio` | `features/podcasts/studio/components/StudioDashboard.tsx` |
| Create | `/podcast/studio/create` | `CreateView.tsx` → `generator/components/GeneratorForm.tsx` |
| Entryway prefill | `/podcast/studio/create?topic=...&format=...&agent=...` | Used by `/demos/matrx-entry`; pre-fills the source topic, format, and selected agent profile note before run creation |
| Live run | `/podcast/studio/run/[id]` | `StudioRunView.tsx` → `studio/runs/useStudioRun.ts` |
| **Manage show (owner)** | `/podcast/studio/show/[showId]` | `studio/components/ShowManageClient.tsx` — owner-facing show settings: cover/title/description/author, RSS distribution (`rss_settings`), feed URL + submit helpers, episodes list |
| **Upload episode (owner)** | dialog (Studio dashboard + manage page) | `studio/components/UploadEpisodeDialog.tsx` — non-AI "upload your own audio/video" episode creation via `useFileUpload` |
| Admin | `/administration/podcasts` | `components/admin/PodcastsContainer.tsx` |

## Data flow

1. `GeneratorForm` collects a `PodcastGenerateRequest` (`generator/types.ts`) —
   incl. `host_count` (1–20), `format`, `theme`, and optional `speakers[]`.
   Before customization it fetches `GET {base}/podcast/cast-preview`; the
   generation server returns the exact provider and default cast. The form only
   overlays user edits, so it never reimplements provider routing or voice
   defaults. If preview loading fails, it omits `speakers` and generation uses
   the same server-owned defaults.
2. A `pc_studio_runs` row is created (`studio/runs/service.ts`); route → run page.
3. `usePodcastRun` and `useStudioRun` use the canonical Redux `callApi` transport
   to POST **`{base}/podcast/generate`** (NDJSON stream; NOT under `/api/`), so
   active organization/project/task scope is injected like every other mutating
   API call. Studio folds events via `generator/reduce.ts` and persists
   milestones to `pc_studio_runs`. Resume →
   `{base}/podcast/resume/{backend_run_id}` through the same transport.
4. Backend (aidream `podcast_generator`) routes the script agent by host count
   (1 → solo · 2 → proven pinned agents · 2–4 custom → multihost · 5–20 →
   roundtable) and audio by provider band (≤2 → Gemini TTS, 3–20 → ElevenLabs
   dialogue), then: prepare/research → script → audio + (metadata → images +
   videos) → official video. `_persist_episode` writes a `pc_episodes` row
   (durable media — see Invariants) incl. `host_count` + `speakers`.
5. **Streaming audio:** during TTS the stream carries `audio_stream_chunk`
   (base64 s16le PCM) + `audio_stream_end` (canonical URL) events. The client
   feeds chunks to `features/audio/streamingPcmPlayer.ts` (generic primitive)
   rendered by `generator/components/LiveAudioPlayer.tsx`, and swaps to
   `PodcastAudioPlayer` at `audio_stream_end` — minutes before
   `podcast_complete`. A seq gap drops live playback (corrupt buffer) and waits
   for the URL. Gemini delivers ONE terminal mega-chunk; per-chunk live listening
   matters mostly for the ElevenLabs path.
6. Public pages render via `<InlineMediaRef>` (durable) + `PodcastAudioPlayer`.

## Tables (`pc_*`, project `txzxabzwovsujtloxrus`)

- **`pc_shows`** — series (slug, title, description, image_url, og/thumbnail, author, is_published, **`rss_settings` jsonb**). No owner column → "my shows" is derived from episodes. `rss_settings` (Apple category, owner name/email, language, explicit) is read by the feed builder + manage UI; always guard with `?? {}` (migration `pc_shows_rss_settings.sql`).
- **`pc_episodes`** — episode (slug, show_id, user_id, title, description, audio_url, image_url, video_url, og_image_url, thumbnail_url, display_mode, episode_number, duration_seconds, is_published, **`host_count` int, `speakers` jsonb** `[{name, voice}]` — migration `pc_episode_speakers.sql`).
- **`pc_studio_runs`** — durable generation record (status, request, title, description, script, audio_url, image_urls[], video_urls[], prompts[], selected_cover_url, episode_id, backend_run_id, error, host_count, speakers).
- **`pc_articles`** — per-episode companion content (`kind: blog | show_notes`, slug, title, content_markdown, status draft|published, unique `(episode_id, kind)` — migration `pc_articles.sql`). Generated by `podcast_blog_writer` / `podcast_show_notes_generator` agents.

## Invariants

- **Media durability (load-bearing).** Every media column the public web reads
  MUST hold a **durable** URL (CDN/public), never an expiring signed S3 URL.
  Enforced in depth: DB guard (`migrations/mtx_public_media_url_guard*.sql` →
  `mtx_media_heal_queue`), frontend classifier (`lib/media/durability.ts`),
  server primitive (aidream `services/media_durability.py`, applied in
  `_persist_episode`), and an **ESLint fence** banning raw `<img>/<video>` in
  `features/podcasts/**`. Render media ONLY via `<InlineMediaRef>` (`@/features/files`).
  The one justified raw element is `PodcastAudioPlayer`'s headless `<audio>`.
  See root `FOUND_DEFECTS.md` D1.
- **Public pages are anonymous** — they cannot re-mint signed URLs, so durability
  is non-negotiable, not cosmetic.
- **Direct Supabase** for `pc_*` CRUD (`service.ts`, `studio/runs/service.ts`); the
  Python backend only for generation. No Next.js API tier between them.

## Roadmap (see `docs/`)

- `docs/LIVE_INTERACTIVE_PODCAST.md` — flagship: chunked-streamed, hot-mic,
  script-rewrites-the-unplayed-tail interactive podcast.
- `docs/DYNAMIC_HOSTS_AND_THEMES.md` — N-host / formats / themes. **Wired
  2026-06-10** (1–20 hosts, all formats, per-host names/voices); 1-host and
  5–20-host paths fail loudly until their agents are built (version-id
  constants in aidream `podcast_generator.py`).
- `docs/BLOG_PER_EPISODE.md` — rich SEO blog article per episode (≠ transcript).
  **Live 2026-06-11:** generate from the run page (`EpisodeContentStudio`),
  publish, public route `/podcast/[slug]/blog`. Show notes share the path
  (rendered inline on the episode page).
- Near-term: RSS feed per show, `file_id` persistence on episodes, transcripts +
  chapters + show notes, search, embeddable player, automated heal (pg_cron).

Much of the above is scaffolded in the UI as **"Coming soon"** (reusable
`components/coming-soon` primitive) so the vision is visible and the server side
is easy to fill in.

## Change log

- 2026-07-23 — **Blog page enriched + balanced (`PodcastBlogPage`).** The public blog was a hero cover + wall of text + a bottom "Play" link. Now: the audio player (`PodcastAudioPlayer`) is embedded at the article's MIDPOINT (`splitMarkdownForEmbed` in `blogLayout.ts` splits the markdown at the block boundary nearest the middle — fence-safe, never mid-paragraph; short articles render the player after the body), and the episode's official video (a montage of the run's generated stills + clips) anchors the lower third, with a slim "Open the full episode" footer replacing the old link card. Only episode-public media is used — the extra generated images live on the `internal`-visibility studio run and are not anon-readable (a genuinely distinct second still would need the run made public or a gallery denormalized onto the article; not done). Also fixed a latent SSR hydration mismatch in `PodcastAudioPlayer`: waveform bar heights now serialize via `toFixed(2)` so `Math.sin`'s cross-runtime float drift can't desync server vs client (affected every SSR'd player). Pure split covered by `__tests__/blogLayout.test.ts`.
- 2026-07-23 — **Feature image never hidden; "Image unavailable" root-caused.** `MediaOptionsGrid` capped the editable grid at `VISIBLE_IMAGES = 5`, so once the run produced 6 images (5 metadata + the feature image) the 6th was hidden behind a "See all 6 images" link — the feature image looked missing. Raised to 6 (videos 2→4); the collapse now only triggers when the user ADDS images beyond the default set. The "Style 5 = Image unavailable" case was a backend concurrency leak (a metadata image slot captured a window of the feature-prompt text agent's stream) — fixed in aidream (`suppress_stream`+`independent_request` on the feature agents, plus a non-URL-output guard); see D85 + aidream `services/podcast/FEATURE.md`. One corrupt studio-run row healed in place.
- 2026-07-22 — **Feature image style picker (the transcript-derived sixth image).**
  aidream now renders an extra image per run from the FULL transcript via a
  two-step agent chain (prompt generator → Matrx Image Ultra / gpt-image-2). The
  frontend contributes only the style: `features/podcasts/generator/featureImageStyles.ts`
  owns the 11 wire tokens (default `infographic`; `auto` = "let the agent decide")
  and `GeneratorForm` exposes them under Advanced options, sending the style only
  when it differs from the default so the SERVER stays the single owner of that
  default. **The tokens must stay character-identical to aidream's
  `FeatureImageStyle` StrEnum** — an unknown token degrades to the default
  server-side (loudly) rather than failing a run, so drift downgrades silently;
  keep them in sync deliberately. No render plumbing was needed: the image
  arrives as a normal asset at slot `eff_images`, and `reduce.ts#applyAsset`
  appends + re-sorts any unknown slot index, so it lands in the existing images
  grid. The episode cover is unchanged — aidream appends the URL to the END of
  `image_urls` and the cover is `image_urls[0]`.
- 2026-07-22 — **False "connection went quiet" stall during research + real
  activity feed.** Root cause was server-side: `scrape_url_core`
  (`matrx-scraper/features/mcp_tool_helpers.py`) ran `extract_text_from_pdf_bytes`
  / `extract_text_from_image_bytes` **synchronously on the event loop** — 300 DPI
  pdfium render + pytesseract OCR per page. That starves the 3s podcast ticker
  AND the 5s stream heartbeat simultaneously, so the client's 20s watchdog fired
  on a run that was working fine (proof: run `e64b4691…` showed the stall banner
  and still completed with audio). Both now go through `asyncio.to_thread`;
  `extract_text_content` was deliberately left on the loop (linear string work,
  tens of ms). Client: `useStudioRun` now feeds the watchdog from `heartbeat`
  and `tool_event` too — previously ONLY `podcast_tick`/chunks counted, so a
  single stalled producer could fake a dead stream; a late heartbeat
  (`late_by_seconds`) is now logged loudly as backend starvation. Banner copy no
  longer asserts failure. **Added `ResearchActivityFeed`** — the real search
  queries / URLs / scrape tallies the research child agent already streamed on
  the parent emitter and the client was discarding wholesale.
  **`useStageDisplay`'s synthetic sub-steps are UNCHANGED and remain the
  guaranteed floor** — the feed is strictly additive and self-hides when the
  stream sends no tool events. NOT yet verified against a live research run.
- 2026-07-22 — Podcast generation and resume migrated from the legacy
  `useBackendApi` stream path to canonical `callApi`, restoring automatic active
  organization/project/task injection while preserving NDJSON event handling.
- 2026-07-22 — **Show/episode page conformance + legibility + data cleanup.** Header: `/podcast/[slug]` moved from `<PageHeader>` (centre slot — the back chevron floated mid-header) to `RouteHeader left={…}`, so back + episode/show title sit at the left edge; `CreateView` was double-portalling (`<PageHeader><RouteHeader/></PageHeader>` — `RouteHeader` already renders its own) and now renders it once. Legibility: the video-mode scrim's `via-transparent` left the vertical middle — exactly where the title/description sit — unscrimmed, so copy landed on raw cover art; replaced with a ramped multi-stop gradient plus a text shadow, and the show hero's scrim grew `h-24 → h-48` (mobile text blocks exceed 96px) with the same shadow. Player: `PodcastAudioPlayer` now adopts a duration the `<audio>` element already knows (`durationchange` + mount sync) — `onLoadedMetadata` alone missed the cached/pre-loaded case and every episode showed `--:--` despite a known duration. Index: dropped the `<h1>Podcasts</h1>` that duplicated the shell header title, and the hero now clears the glass header via `pt-[calc(var(--shell-header-h)+1.25rem)]`. Data: 15 episodes soft-deleted (2 untitled, 4 with dead audio, 9 duplicate test runs) + the empty AP Bio show → 33 episodes / 3 shows, zero dead media refs. Generator bug behind the untitled episodes is aidream-side (D82); missing `duration_seconds` is D83.
- 2026-07-22 — THE VIEW LAW: `podcastService.fetchAllShows()` now `.eq("created_by", userId)` explicitly instead of bare RLS.
- 2026-07-20 — **`/podcast` index theme + interaction + broken-art cleanup.** Hero and cards moved off hardcoded dark (`bg-zinc-900`/white text) onto semantic tokens — the index now reads correctly in light AND dark (the shell header title was dark-on-dark before). Card click target fixed: the whole-card overlay link now sits above the artwork (`z-[15]`, artwork z-10, Manage/Draft z-20), so cursor + click are uniform across the full card. Consumer-surface fallback doctrine: grid + show-page episode thumbs pass `errorFallback="icon"` with the mic/music placeholder — a dead URL degrades to the same quiet tile as "no artwork", never the red debug panel (the `InlineMediaRef` "info" default stays for internal surfaces). Data heal: the `podcast-assets` storage bucket was deleted (all URLs 400) — Phoenix Echo's cover re-pointed to its surviving CDN episode image, AP Bio's + 4 episodes' dead image refs nulled; 4 published episodes still have unrecoverable dead audio (D77, decision pending).
- 2026-07-20 — **`/podcast` index identity fix.** The public index now routes creators to the Studio ("Create a podcast" → `/podcast/studio/create`, "Open Studio" → `/podcast/studio`) and separates "Your podcasts" (owned, incl. unpublished drafts, per-card Manage link to `/podcast/studio/show/[id]`) from "On the platform" (published catalog minus yours), via new `PodcastIndexClient.tsx` + extended `PodcastGrid`. Ownership: added `created_by` to `PcShow` (DB-stamped by `_stamp_actor`; omitted from create/update payloads), and `useMyPodcasts.myShows` now includes shows the user created even with zero episodes (fixes the invisible-new-show gap noted in `StudioDashboard`). Dead cover URLs on two published shows filed as D77.
- 2026-07-18 — **Canonical studio media controls completed on mobile.** The shared image renderer now opens its fullscreen lightbox when the image is tapped/clicked and exposes a persistent top-right “…” action button on touch layouts; the shared video renderer now exposes the matching mobile “…” action button. Hover-only toolbars are desktop-only. Because every completed `MediaOptionsGrid` image/video flows through `AssetCard`, this fixes the main run page plus the dense, sharp, refine, and reimagine run surfaces together. The composed episode-video hero in `StudioRunView` was also migrated from display-only `InlineMediaRef` to `UnifiedVideoBlockRenderer`, restoring fullscreen, download, share, copy-link, context-menu, and mobile-drawer actions while retaining durable `podcastMediaRef` URL recovery. Lightweight covers used as thumbnails, audio-player artwork, and rotating production teasers intentionally remain on durable `InlineMediaRef` because those are display elements rather than standalone media assets.
- 2026-07-18 — **Run detail reads respect PostgREST schema profiles.** `studio/runs/runsRepository.ts` no longer asks a `chat.agent_run` select to embed `podcast.pc_studio_run_assets` (PGRST200 despite the cross-schema FK). It reads the RLS-scoped run/stages through `chat`, reads assets through `podcast`, and merges the DTO client-side; real query errors are propagated instead of being misreported as a missing run. Regression coverage pins the two-schema query boundary and merged asset metadata.
- 2026-07-15 — **Server-owned cast preview removed duplicated provider routing.** Added the typed `GET /podcast/cast-preview` contract and `usePodcastCastPreview`; `GeneratorForm` now renders and submits the server's exact provider/default cast with user edits layered on top. Removed the frontend `hostCount <= 2` routing branch and hardcoded Gemini default-voice order. Preview failure safely omits `speakers`, leaving generation to resolve its native defaults. Focused cast tests, ESLint, and full TypeScript validation pass.
- 2026-07-06 — **Per-asset endpoints migrated to NDJSON streams.** `POST /podcast/runs/{id}/assets/regenerate|add` no longer return blocking JSON; `studio/runs/runsApi.ts` now consumes them via the shared `postNdjson` (`lib/python-client.ts`), resolving the unchanged `Promise<RunAsset>` from the terminal `podcast_asset_result` event (status `"failed"` + error resolves normally, like the old graceful-failure JSON; in-stream `error` events throw). Signature change: the `api` (useBackendApi) param is gone — `postNdjson` handles auth + base URL; optional `onEvent` tap added. `useStudioRun` callsites updated; `RunAsset` stays the strict durable DTO, normalized from the generated `PodcastAssetResultEvent`.
- 2026-07-05 — **`PodcastRunState.audioFileId` — durable file_id now captured from the stream.** `reduce.ts`'s `audio_stream_end` handler previously only stored `audioUrl` (the render-time URL/CDN link); it now also captures `data.file_id` into a new `audioFileId` field. Any consumer that needs to PERSIST a run's audio (not just play it back in the moment) must read `audioFileId`, never `audioUrl` — per the media-durability doctrine, a stored raw/signed URL expires while a file_id doesn't. First consumer: flashcards' "Generate audio overview" (`features/flashcards/components/set-detail/AudioOverviewSection.tsx`), which writes it to `fc_set.audio_overview_file_id` (falling back to `fileIdFromUserFilesUrl(audioUrl)` if the backend didn't report a file_id, and refusing to persist at all if neither resolves).
- 2026-06-28 — **DB: `pc_*` canonicalized + moved `public → podcast` schema.** All 5 tables (`pc_shows`, `pc_episodes`, `pc_articles`, `pc_studio_runs`, `pc_studio_run_assets`) brought onto the platform base entity (visibility/org/created_by/satellites) and relocated to the `podcast` schema (exposed via PostgREST). Public content stays anon-readable via `visibility='public'`; studio runs are owner-private. FE now uses `.schema('podcast').from('pc_*')` everywhere; `mapPcShowRow` accepts the display-column subset. **Show editing is now owner/org-gated** (was open to any authed user); the 4 existing ownerless shows were assigned their episode owner. aidream ORM config staged but needs a `generate.py` run. See `docs/db_rebuild/CHANGEOVER_PROGRESS.md` → `podcast` schema.
- 2026-06-24 — **Matrx entryway prefill.** `/podcast/studio/create` now accepts `topic`, `format`, and `agent` query params from the new `/demos/matrx-entry` route. `CreateView` validates the format param against `PodcastFormat`, and `GeneratorForm` seeds the topic textarea, selected format, and advanced agent-profile note so submit still uses the existing `pc_studio_runs` creation + live run handoff.
- 2026-06-17 — **Live voice catalog (Supabase `public.voices`) + Run Truth inspector.**
  Voices now come from one Supabase table (read directly, RLS-scoped) with public
  CDN `sample_url`s — `generator/voiceCatalog.ts` (`fetchVoices` + cache) +
  `generator/useVoices.ts`. Deleted the hardcoded rosters, `VOICE_SAMPLE_URLS`,
  `voiceSamplesManifest.ts`, the generated `public/voice-samples/` mp3s, and
  `scripts/generate-voice-samples.mjs` — the old ElevenLabs IDs were stale (wrong
  genders / dead voices); the table is the single source of truth. `voices.ts`
  keeps `buildCast`/`resolveSpeaker`/`voicesForProvider`, applying user edits to
  the server preview against the live `Voice[]`; the picker groups by real
  gender, plays the CDN sample, and shows loading/error/retry. (`fetchVoices` casts to an untyped
  client until `voices` lands in the generated `database.types.ts` — re-run
  `pnpm db-types`.) **Run Truth inspector** (`studio/components/RunTruthInspector.tsx`,
  on the run page): an advanced, read-only panel showing the ABSOLUTE durable
  truth of a run — the exact `request` sent (incl. the speaker cast), the `result`
  (resolved cast / URLs / official video / `official_video_error`), the run
  `error`, and EVERY `agent_run_stage` with its real per-agent output / error /
  cost / timing, plus the `pc_studio_runs` + `pc_episodes` rows. Lazy-loads from
  Supabase, per-stage expand (failed stages auto-open), "Copy all for AI". Makes
  "was it the script or something else?" answerable at a glance.
- 2026-06-17 — **Speaker cast editor — name + gender + voice (with samples), up to 20.**
  Replaced the optional name/voice grid with `generator/components/SpeakerCastEditor.tsx`:
  one card per host (always synced to host count), each with a name input, a
  gender select, and a searchable voice picker grouped by gender with a play-
  sample button per voice (`useVoiceSamplePlayer.ts`, one-at-a-time playback).
  Provider and untouched defaults now come from `/podcast/cast-preview`; the
  frontend does not infer the provider from host count. `PodcastSpeaker` carries
  `gender`, and `buildCast` sends a complete cast only after a valid preview;
  otherwise generation chooses its own defaults. Voices with no catalog sample
  show a disabled "preview unavailable" button (never a broken player).
- 2026-06-16 — **Merged "official" episode video wired end-to-end.** The backend already stitches every clip + still into one crossfaded MP4 (square stills get blurred-fill sides) and sets it as the episode's primary `video_url`, but the frontend ignored it. Now: modeled the `podcast_official_video` stream event + `official_video_url` on `podcast_complete` (`generator/types.ts`), added `officialVideoUrl` to `PodcastRunState` + the reducer (`generator/reduce.ts`) + durable-record rehydration (`studio/runs/mapping.ts`) + an episode-level fallback from `pc_episodes.video_url` (`studio/runs/useStudioRun.ts`), and surfaced it as a prominent "Episode video" hero in `studio/components/StudioRunView.tsx` (with a loud "couldn't assemble" note when a finished multi-asset run has none). `ResultActions` display-mode default now follows the backend (video when present). Backend (aidream) hardened in the same change: compose skip/failure is logged loudly and surfaced via a new `official_video_error` field on the complete event. NOTE: the compose step needs ffmpeg (`imageio-ffmpeg`) + the cloud file manager present in the deployed env — if the merged video is still missing in prod, verify those.
- 2026-06-16 — **Studio media units now use the canonical media renderers.** Done image/video slots in `generator/components/AssetCard.tsx` render through `UnifiedImageBlockRenderer` / the new `UnifiedVideoBlockRenderer` (built in `features/files/blocks/video/`), restoring expand → fullscreen, the single "…" menu (download / copy-link / share / open-in-new-tab), right-click context menu, and mobile long-press — replacing the bare `InlineMediaRef` + custom Enlarge button + podcast-only `AssetActionsMenu` overlay. Podcast actions (Use as cover, Regenerate, per-model Regenerate) ride in via the renderers' new `extraActions` slot so there is ONE menu per asset. Blocks are built from `podcastMediaRef(url)` via the new generic `blockFromMediaRef` adapter (`features/files/blocks/adapters/from-media-ref.ts`). `AssetActionsMenu` is kept only for non-done slots (model picker / edit-description); the grid-level `InlineMediaRef` lightbox in `MediaOptionsGrid.tsx` was removed (the canonical Expand is now the only fullscreen path).
- 2026-06-16 — **Mobile title/layout squish fix.** `PodcastEpisodePage` (all three display modes) and `PodcastShowPage` now scale titles responsively (`text-lg`/`text-xl` base → `sm:text-2xl`/`sm:text-3xl`), wrap (`break-words`, `min-w-0` on flex children), and use responsive padding (`px-4 sm:px-6`) with `max-w-*` content centering — titles no longer cramp on ~360px screens.
- 2026-06-12 — **ElevenLabs dialogue agent live → 1–20 hosts proven end-to-end.**
  Created `podcast_audio_dialogue` (master `88f05360`, version `293425be`,
  pinned to `eleven_v3`/`elevenlabs_dialogue`) and wired `_AUDIO_DIALOGUE_VERSION_ID`
  in the aidream pipeline — the last missing piece for the 3–20 host band. With
  the solo + roundtable script agents, every host-count band routes correctly
  (solo→Gemini single, 2→Gemini multi, 3–20→ElevenLabs dialogue). Verified via
  `scripts/podcast_e2e_matrix.py` (`solo`/`three_host`/`six_host_roundtable` all
  PASS with real audio). Also fixed a build-blocking dangling `human-id` pnpm
  symlink (cartesia dep). Full status: `docs/HANDOFF_2026-06-12.md`. Server work
  committed (`aidream 05c457d0`) but **awaits deploy** for production.
- 2026-06-11 — **Blog posts + show notes (generate → publish → public).** Per
  episode, `EpisodeContentStudio` (on the run page) generates a blog article or
  show notes from the episode's `script` via the `podcast_blog_writer`
  (`58204bd9`) / `podcast_show_notes_generator` (`b1910198`) agents through
  `useEpisodeArticles` + `useRunAgent`, saving to `pc_articles`
  (`articleService`, migrations `pc_articles.sql` + `pc_episodes_script.sql`).
  These agents emit a **structured JSON envelope** (behind `<reasoning>`), NOT
  raw markdown — `articleMarkdown.ts#assembleArticle` extracts the object
  (`utils/json/extract-json`) and assembles renderable markdown. Two
  `useRunAgent` fixes this surfaced: it now reads `completion.result.output`
  (schema agents don't stream `chunk` events) and treats a failed/cancelled
  completion as an error. Publish flips `status`; public blog renders at
  `/podcast/[slug]/blog` (`PodcastBlogPage`, SSR + `generateMetadata` with
  `og:type=article` + canonical), show notes inline on the episode page
  (`EpisodeShowNotes`). Episode-page CTAs go live when published; `ResultActions`
  blog/show-notes ComingSoon removed. Server now links `agent_run.episode_id` on
  persist + persists `pc_episodes.script`. Shared `slugify` extracted to
  `features/podcasts/utils.ts` (was duplicated in two dialogs). Live-verified:
  generated → published → anonymous `/blog` page renders with cover + byline.
- 2026-06-10 — **Multi-speaker (1–20 hosts) + streaming audio + error taxonomy.**
  Server (aidream): host-count-aware script routing (`_select_script_agent` —
  legacy 2-host agents stay for default educational/news; `podcast_multihost_script`
  for custom 2–4; solo/roundtable agents pending their version ids), audio
  routing (≤2 Gemini w/ per-run `tts_voice` overrides; 3–20 ElevenLabs dialogue
  via `_dialogue_to_elevenlabs_turns` — unmapped speaker fails BEFORE the paid
  call), `speakers`/`format`/`theme`/`host_count` request fields, cast persisted
  to `pc_episodes.{host_count,speakers}`. **Two production bugs fixed:** (1)
  Gemini TTS aborted EVERY full-length render — first chunk takes >250s and the
  fixed stall window killed it (now: pre-first-chunk window = length-scaled
  budget; Gemini delivers one terminal mega-chunk); (2) a swallowed TTS abort
  committed a `completed`-empty audio checkpoint, so the run claimed success
  with no audio AND resume replayed the empty result forever (now:
  `_audio_stage_result` converts empty-success to FAILED pre-commit; run-level
  success requires audio; FE offers Resume on completed-without-audio).
  Image/video slots retry ONCE on the alternate pinned model before failing
  (`_run_asset_with_fallback`), with an informational `note` chip on fallback
  successes (`AssetCard`). Client: generic `features/audio/streamingPcmPlayer.ts`
  + `LiveAudioPlayer` consume `audio_stream_chunk`/`audio_stream_end`; early
  player swap at TTS finish; `liveText` now fed by `onChunk` (ProductionTeaser
  sneak peek is live); GeneratorForm hosts 1–20 + per-host name/voice pickers
  (`generator/voices.ts`) + theme; N-speaker transcript colors
  (`SPEAKER_SLOT_TEXT`); episode page shows the cast; one silent player retry on
  a just-minted CDN URL. Verified end-to-end on local aidream (Maya/Rex custom
  2-host interview, 6:53 episode, cast persisted) + chunk events verified on prod.
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
