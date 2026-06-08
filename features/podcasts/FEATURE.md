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

- **`pc_shows`** — series (slug, title, description, image_url, og/thumbnail, author, is_published). No owner column → "my shows" is derived from episodes.
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
- 2026-06-08 — Media durability defense-in-depth (DB guard + classifier + server
  primitive + `_persist_episode` fix + ESLint fence); healed 5 live episodes.
  Created this FEATURE.md + roadmap docs. Began the feature push (RSS, file_id,
  coming-soon scaffolding, blog-per-episode).
