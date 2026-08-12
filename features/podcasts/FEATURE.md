# Podcasts — FEATURE.md

**Status: live, actively expanding.** One of the platform's most popular systems.
Generates full multi-media podcast episodes (script → audio → cover images →
clip videos → composed "official" video) from a topic, notes, full script, or
files, with a live-streaming studio, resumable runs, and public share pages.

## Entry points

| Surface                    | Route                                                   | File                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public index               | `/podcast`                                              | `app/(core)/podcast/page.tsx` → `PodcastIndexClient.tsx` → `PodcastGrid.tsx` — Studio/create CTAs + "Your podcasts" (owned via `useMyPodcasts`, incl. drafts, Manage links) vs "On the platform" (published, minus yours) |
| Public episode/show        | `/podcast/[slug]` (slug or UUID)                        | `app/(core)/podcast/[slug]/page.tsx` → `features/podcasts/components/player/{PodcastEpisodePage,PodcastShowPage}.tsx`                                                                                                     |
| Studio dashboard           | `/podcast/studio`                                       | `features/podcasts/studio/components/StudioDashboard.tsx`                                                                                                                                                                 |
| Create                     | `/podcast/studio/create`                                | `CreateView.tsx` → `generator/components/GeneratorForm.tsx`                                                                                                                                                               |
| Entryway prefill           | `/podcast/studio/create?topic=...&format=...&agent=...` | Used by `/demos/matrx-entry`; pre-fills the source topic, format, and selected agent profile note before run creation                                                                                                     |
| Live run                   | `/podcast/studio/run/[id]`                              | `StudioRunView.tsx` → `studio/runs/useStudioRun.ts`                                                                                                                                                                       |
| **Manage show (owner)**    | `/podcast/studio/show/[showId]`                         | `studio/components/ShowManageClient.tsx` — owner-facing show settings: cover/title/description/author, RSS distribution (`rss_settings`), feed URL + submit helpers, episodes list                                        |
| **Upload episode (owner)** | dialog (Studio dashboard + manage page)                 | `studio/components/UploadEpisodeDialog.tsx` — non-AI "upload your own audio/video" episode creation via `useFileUpload`                                                                                                   |
| Admin                      | `/administration/knowledge/podcasts`                    | `components/admin/PodcastsContainer.tsx`                                                                                                                                                                                  |

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
   API call. `PodcastGenerateRequest.context_anchor` may bind a run to an
   existing durable source entity; aidream reloads that entity and its saved
   scope becomes authoritative. Studio folds events via `generator/reduce.ts` and persists
   milestones to `pc_studio_runs`. Resume →
   `{base}/podcast/resume/{backend_run_id}` through the same transport.
4. Backend (aidream `podcast_generator`) routes the script agent by host count
   (1 → solo · 2 → proven pinned agents · 2–4 custom → multihost · 5–20 →
   roundtable) and audio by provider band (≤2 → Gemini TTS, 3–20 → ElevenLabs
   dialogue), then: prepare/research → script → audio + (metadata → images +
   videos) → official video. `_persist_episode` writes a `pc_episodes` row
   (durable media — see Invariants) incl. `host_count` + `speakers`.
5. **Streaming audio (no Supabase Realtime):** the same authenticated NDJSON
   response that carries podcast progress also carries `audio_stream_chunk` +
   `audio_stream_end`; `useStudioRun` consumes it directly through `callApi`.
   Gemini chunks are base64 s16le PCM and play through
   `features/audio/streamingPcmPlayer.ts` (Web Audio). ElevenLabs chunks are
   base64 MP3 bytes and play through `features/audio/streamingMp3Player.ts`
   (MediaSource). Both implement the transport used by
   `generator/components/LiveAudioPlayer.tsx`; `encoding`/`mime_type` selects
   the implementation on the first chunk. `audio_stream_end` supplies the
   canonical URL and swaps to `PodcastAudioPlayer` — often minutes before
   `podcast_complete`. A seq gap, stream-id change, codec change, decoder error,
   or unsupported MediaSource drops only the transient live preview and waits
   for the canonical file; it never re-runs paid TTS.
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
  2026-06-10** (1–20 hosts, all formats, per-host names/voices). Since
  2026-08-08 every pipeline agent routes through a `podcast.*` agent slot
  (DB-managed; admin console `/administration/agents/slots`) — adding or
  swapping an agent is a repin, not a code change.
- `docs/BLOG_PER_EPISODE.md` — rich SEO blog article per episode (≠ transcript).
  **Live 2026-06-11:** generate from the run page (`EpisodeContentStudio`),
  publish, public route `/podcast/[slug]/blog`. Show notes share the path
  (rendered inline on the episode page).
- Near-term: RSS feed per show, `file_id` persistence on episodes, search,
  embeddable player, automated heal (pg_cron). (Chapters + show notes are
  live — see 2026-08-08 / 2026-06-11 change-log entries.)

Much of the above is scaffolded in the UI as **"Coming soon"** (reusable
`components/coming-soon` primitive) so the vision is visible and the server side
is easy to fill in.

## Change log

- 2026-08-11 — **Chapters stream, and they are a Shape — the `media_chapters`
  kind end to end.** `useEpisodeChapters` ran through `useRunAgent`, which
  produces **no requestId at all**, so live rendering was structurally
  impossible and the user watched a spinner while the model wrote (class B in
  `docs/handoffs/live-run-streaming-sweep.md` §6, THE FLOATING LAW's exact
  violation). (1) **New kind `media_chapters` (+ child `media_chapter`)** —
  `features/content-ir/kinds/media-chapters.ts`,
  `migrations/kind_media_chapters_full.sql`, applied + ledgered + ACTIVE
  through the real dual gate (`content_ir.set_kind_activation`; the child
  correctly fails the render leg and stays inactive like every nested-only
  child). Reuse of `timeline` was checked FIRST and rejected: it is a
  two-level roadmap with per-event completion status, and mapping a flat
  playback index onto it needs an invented period level plus `date`
  overloaded as an offset. Field parity is exactly `PcEpisodeChapter`, so
  nothing is lossy. Named generically because the same index serves video.
  (2) **`MediaChaptersBlock` is its ONE component** — the panel's hand-rolled
  `<ol>` is deleted; saved chapters render through the same component the live
  window streams into, so what you watch and what reloads cannot drift
  (THE CANONICAL COMPONENT LAW). Rows become seek buttons wherever a surface
  passes `onSeek`. (3) **The agent emits the envelope** — `podcast.chapter_marker`
  (`2f600a25-…`, now v6 `e664397d-…`) is bound to the kind's portable block
  export and its prompt teaches the shape; the slot declares
  `output_kind="media_chapters"` + `required_output_keys`, and every version
  pin moved off the stale v2 seed (aidream `client_slots.py`, the generated
  runner, the placeholder seeder, the agent doc). (4) **The hook is
  `useLiveAgentRun` + `useOpenLiveRunWindow`** — floating, not inline, because
  this panel sits mid-page beside other cards and an inline block would shift
  them under the user's cursor. **Proven on a real run against production**
  (gemini-3.6-flash, the real "Why Is the Sky Blue?" episode script): a valid
  `media_chapters` envelope, first offset `00:00`, strictly increasing, all
  under the runtime, 6 chapters honoring the hint. That run also caught a real
  defect — **the model emits keys in the schema's declared property order, so
  `__kind` last means the discriminator arrives last and the window cannot
  route until the run is over.** The prompt asking for it first did NOT fix
  it; moving `__kind` to the front of `properties` did. **Verified end to end
  ON PRODUCTION** (v0.4.460, the same episode): Generate opened a `position:
  fixed` window titled "Marking chapters" — the page did not move — chapters
  rendered as `MediaChaptersBlock` rows with mono offset chips and never as
  raw JSON, the save landed on `metadata.chapters` with `__kind` stripped to
  the three `PcEpisodeChapter` fields, and after a reload the panel shows the
  same six offsets through the same component with the button flipped to
  Regenerate.

- 2026-08-11 — **Title options stream, and each option applies itself — the
  `episode_title_options` kind end to end.** `useEpisodeTitleOptions` ran
  through `useRunAgent`, which produces **no requestId at all**, so live
  rendering was structurally impossible and the user watched a spinner while
  the model wrote (class B in `docs/handoffs/live-run-streaming-sweep.md` §6,
  THE FLOATING LAW's exact violation). Three changes, one flow. (1) The
  `podcast.title_optimizer` agent (master `077108a1…`, now **v4**, re-authored
  via `agent_author`) emits the canonical `episode_title_options` envelope
  instead of a bare `{options:[…]}`; `slug` was dropped, because no consumer
  ever read it and a title edit deliberately never touches the episode slug or
  public URL. The slot is FLOATING (`use_latest`, no version pin) and the FE
  resolves the MASTER agent id, so its one consumer picked v4 up with no
  repin — there is no second usage anywhere in either repo. (2) The hook runs
  through `useLiveAgentRun` on the slot (`slotKey`, so `config_overrides`
  survive inside the canonical launcher) and opens the floating
  `LiveRunWindow` **before** the launch, so the window is what the user
  watches while the stream connects rather than something that appears after
  it. Floating rather than inline is forced: the panel sits mid-page, so an
  inline live block would shove the episode's own content down the instant a
  run starts. (3) Applying moved onto the streamed cards. Each card's "Use
  this title" fires `apply_surface_write` → the `episode_title` target →
  `podcastService.updateEpisode` — the ONE canonical path the panel's own
  "Use" button already used, so there is still no second way to set a title.
  `PodcastRunWriteTargets` now publishes the read half
  (`episode_title_selection`) that makes those cards interactive, and
  publishes it ONLY while the write would actually be accepted (episode saved,
  run no longer producing) — the handlers refuse otherwise, and a button that
  is always refused is worse than no button. Rendered anywhere else (chat, a
  share page) the same cards degrade to read-only with Copy. **Live-verified
  end to end** on run `64fa5cdb…` / episode `5a9634ae…`: window opened
  pending → four cards streamed in with rationales → "Use this title" →
  `pc_episodes.title` changed in the DB, `slug` untouched, the hero and the
  card's "Current" badge both reflected it. The kind, its component, and the
  dual-gate rows live in `features/content-ir/` — see that FEATURE.md.

- 2026-08-11 — **The two red errors on run `68605dd6` were TRUE, and one
  dropped socket now produces ONE of them.** Investigated whether the server
  holds `/podcast/generate` open past its terminal event (the D130
  `agent-stream-terminal-guard` shape) or whether the client mislabels a normal
  end-of-stream close. **Measured in production, neither.** A full instrumented
  run (`9fbc23e6`, 17/17 steps, script → 6 covers → 2 clips → audio → official
  video) logged `end` at t=321480ms and the body's clean `done` at t=321481ms —
  **1 ms**, no post-terminal hold — and the client captured **zero** errors on
  that close. A fast-failing run behaved identically (`end` t=890ms, close
  t=891ms). So `68605dd6`'s stream never reached a terminal event at all: it was
  severed mid-flight. The deliverables already existed, so the user
  saw success — but "the connection to the AI response was lost" was an honest
  report of a real transport failure and **must never be downgraded or filtered**.
  **The server was fine.** `detach_on_disconnect=True` did exactly its job:
  `chat.agent_run e505424c` (this studio run's backend row) kept working
  **18½ minutes** past the client drop — `compose_official_video` finished
  19:25:11Z, `status='completed'` and episode `58c01476` written 19:25:17Z.
  The drop was the browser↔Cloudflare leg, not a dead worker.
  **Fixed here:** `parseNdjsonStream` captured the failure as
  `agent-stream-transport` and re-threw, and `callApi`'s catch captured the same
  object again as `api-network` — one failure, two red rows, the second one
  poorer (no requestId/conversationId). `captureStreamTransportError` now marks
  the thrown value (WeakSet, nothing added to the error's shape) and
  `wasStreamErrorCaptured` stands the API chokepoint down. Pinned by
  `lib/diagnostics/captureStreamError.test.ts`. **Corrects the entry below:**
  "the run row never reaches a terminal status when the stream drops" is FALSE
  — it reaches it late (whenever the detached pipeline finishes), and a client
  that reads the row mid-flight sees `processing` for minutes. That window is
  what `run-truth.ts` covers; there is no missing terminal write.
  **The one aidream defect that WAS real — now CLOSED (verified live,
  2026-08-11 21:20 UTC):** `chat.agent_run_stage.cost` was NULL on all 980 rows
  while 172 carried a real `output.usage.cost_usd` — $13.59 of spend recorded
  nowhere queryable, and every `agent_run.total_cost` was `0`. The per-stage
  cost write (`_checkpoint.py`), the reconciliation sweep
  (`aidream/services/podcast/reconcile.py`) and `scripts/backfill_agent_run_cost.py`
  were written but uncommitted; they are now **committed, deployed and proven in
  production**. Live counts: **176 of 176** stages carrying payload money have
  the `cost` column set (gap = 0), 38 runs carry a non-zero `total_cost`, and
  the column sum equals the payload sum exactly ($13.6126). Both halves are
  proven independently — the backfill settled the history, and runs generated
  *after* the deploy (`ee295ea3`, `55850645`) recorded their cost through the
  live path with no backfill involved. The run this section names, `7f237d93`,
  now reads **$0.669998** instead of `0`. The reconciliation sweep is not merely
  registered but **scheduled and firing**: `scheduler.sch_task` +
  `sch_trigger` both `enabled=true` on `*/10 * * * *`, handler gate cleared, 7
  consecutive successful `sch_run` rows. **Consequence for this repo:** a run's
  cost is now a queryable column, so any studio surface that wants to show what
  an episode cost can read `agent_run.total_cost` / `agent_run_stage.cost`
  directly instead of digging through stage `output.usage` JSON.

- 2026-08-11 — **A finished episode is never shown as "interrupted": run status
  is DERIVED from the deliverable, not read from a column somebody forgot to
  write.** Run `68605dd6-e282-4d82-b04f-2a5c6286a10b` generated its script, six
  covers, two videos and its finished audio (create_audio completed, CDN URL
  written), then the streaming connection dropped seconds later. Nothing wrote
  the terminal status, so `agent_run.status` stayed `processing`, the server
  computed `liveness: "stalled"` from the stale heartbeat, and the run page
  offered **Resume** and **Re-run from source** over an episode that already
  existed — inviting the single most expensive action in the product because a
  socket closed. `runs/run-truth.ts` now owns the one rule (`trueLiveness` /
  `trueSummaryLiveness`): audio or an episode id means COMPLETED, whatever the
  row says; `cancelled` and `draft` describe what the USER did and no artifact
  overrides them; a failed stage is never laundered into success. The detail
  page (`mapping.detailToRunState`), the recovery banner (`recovery.ts`), the
  history card and the manage list all read it, so they cannot disagree about
  whether an episode exists. Pinned by `runs/__tests__/run-truth.test.ts` (11
  cases). **Correction (same day, verified live — see the entry above):** the
  run row DOES reach a terminal status after a stream drop; the detached
  pipeline writes it whenever it finishes (here, 18½ min later). What this
  feature actually needs `run-truth.ts` for is that MID-FLIGHT window, not a
  missing write. The `total_cost` half stands and is real: `0` on every run,
  `cost` NULL on every stage row, $13.59 of Gemini/GPT/FLUX/Kling/TTS spend
  reported as free — the writer exists in aidream but is uncommitted.

- 2026-08-11 — **Early runs keep a stable composition canvas and activity
  reflects real tool lifecycle.** `PodcastCompositionPlaceholder` mirrors the
  finished identity, production card, cover, and video regions before metadata
  arrives; `StudioRunView` reserves one viewport in that state, so the advanced
  Run details inspector cannot rise into the initial screen as the right rail
  grows. `ResearchActivityFeed` resolves history by canonical `call_id`: only
  the newest unresolved row spins (with a real `animate-spin`), and
  `tool_completed` / `tool_error` settles the call even when its optional
  message is absent. Focused tests pin started → progress → completed behavior.
- 2026-08-11 — **The Run page is agent-writable, and its reads now tell the
  truth.** `matrx-user/podcast-run` declares three ask-policy `entity` write
  targets, all on the FINISHED episode: `episode_title` and
  `episode_description` through `useStudioRun.applyEpisodeMetadata` → the
  canonical `podcastService.updateEpisode` (handlers in
  `studio/components/PodcastRunWriteTargets.tsx`), and `episode_chapters`
  through `podcastService.saveEpisodeChapters`, registered by
  `EpisodeChaptersPanel` itself because that panel owns the episode row and
  the chapter list. No raw supabase in the write path. Nothing that SPENDS
  money is writable: generating, resuming, re-running from source,
  regenerating an image or video slot, and adding an asset all stay behind
  the human press, matching `podcast-studio` (an agent fills the composer;
  the human hits Generate). The audio, the composed video, every media slot,
  the script, and the whole progress + diagnostics half stay read-only
  because they are the record of what the pipeline ACTUALLY did — writing a
  stage status or a run error would forge that record. Publishing and the
  slug stay human. `episode_title` is NOT a second title path: the page had
  already run the `podcast.title_optimizer` slot and let the user click "Use"
  on a ranked option, and the target lands through that same
  `updateEpisode` call — the difference is only who chooses.
  `episode_chapters` replaces the whole ordered list, so a matching
  `episode_chapters` READ value was added as its twin, specifically so an
  agent can reuse the existing `start_hint` timestamps: they are aligned to
  the rendered audio and cannot be re-derived. Re-segmenting from scratch is
  still the panel's Regenerate button. Every handler refuses while the run is
  still producing or before the episode row exists. Landing this also forced
  a real fix to the READ side: the page rebuilds from the RUN record
  (`detailToRunState` / `rowToRunState` in `studio/runs/mapping.ts` read
  `detail.title` / `row.title` — the metadata the pipeline generated) while
  every edit, human or agent, lands on `pc_episodes`. The two diverge the
  moment anyone edits, so after a reload the hero showed a title the episode
  no longer had — already true for the Title options panel's own "Use" and
  for admin episode-form edits, but intolerable once `episode_title` and
  `episode_description` became the values an agent checks its own work
  against. It surfaced live rather than in review: after a confirmed write,
  the agent, asked to change the title again, quoted the STALE title back.
  `useStudioRun` now overlays the persisted `pc_episodes` row once the
  episode is known and the stream is done writing it. Verified on a real
  finished run: two targets asked and applied in one message with the hero
  updating in place and `pc_episodes` matching exactly, all three chapter
  titles rewritten with every `start_hint` and summary preserved, "Keep as
  is" declining cleanly, `run_status` and `episode_slug` refused because they
  are not in the injected tool spec, and a bad `start_hint` returning the
  handler's own error with no chapters changed. The DB mirror
  (`ui.ui_surface_write_target`) is still pending a manifest sync.
- 2026-08-10 — **Fake "This run was interrupted" banner killed.** Root cause
  was server-side: `agent_run.last_heartbeat_at` was bumped only on stage
  commits, so any multi-minute video/audio render exceeded the 180s liveness
  threshold (`runsRepository.STALL_SECONDS`) and every non-stream reader
  (reload, phone unlock, background poll) judged a healthy run "stalled" →
  the interrupted banner. Server fix (aidream `podcast_generator.py` ticker +
  `RunCheckpointer.touch()`): DB heartbeat every ~30s for the whole pipeline.
  FE fix (`useStudioRun.watchInBackground`): no hard ~16-min poll cap while
  the server says "alive" — polls relax to 30s instead of giving up; only
  completed/failed/stalled ends observation.

- 2026-08-09 — **Agents can fill in the generator form.** `GeneratorForm` now
  registers write handlers for 5 new `matrx-user/podcast-studio` write targets
  (`source_text`, the composite `episode_shape` = language/format/theme/
  host_count, `target_audience`, `prep_instructions`, `show_blurb`), all
  `mode: "draft"` + `applyPolicy: "ask"`. Handlers set the same `useState` the
  user's own typing sets, validate against the real vocabulary constants
  (`LANGUAGE_OPTIONS`, `FORMAT_OPTIONS`, `MAX_HOST_COUNT`) and THROW on a bad
  shape — the writeback seam turns that into an error envelope the agent reads.
  **Generate stays a human press** (it costs real money) and so do the cast,
  the destination show, and the test/cost controls. `buildRequestBody()` is
  untouched, so nothing about what the form SENDS changed. Also fixed a
  read-side gap: `target_audience` has been on the form since 2026-08-08 but
  was never emitted to the surface. Live-verified end-to-end against a real
  agent run — see `features/surfaces/FEATURE.md` for the verification detail.
- 2026-08-08 (later) — **Title options panel, audience re-pitch, 10-host cap.**
  (1) Run page gained `EpisodeTitlePanel` (`useEpisodeTitleOptions`,
  `podcast.title_optimizer` slot — post-episode only so the agent always sees
  the FINAL script; applying updates `pc_episodes.title`, slug/URL untouched;
  toast reminds to regenerate blog/show notes). (2) GeneratorForm gained a
  "Target audience" input (`target_audience` on the generate request → server
  `audience_adaptation` stage via `podcast.audience_adapter`, runs before the
  pre-script transform). (3) `MAX_HOST_COUNT` 20 → 10: ElevenLabs
  `text_to_dialogue` hard-rejects >10 distinct voices (verified live —
  10-host e2e passed, 14/20 rejected at the provider); server fails fast too.
  Restore 11–20 when chunked dialogue audio ships (handoff). (4) Server now
  persists only the canonical script (dialogue + speaker_settings; 36 rows
  backfilled) and suggests rotated default cast names to script agents when a
  request names nobody. (5) Duplicate server slots `podcast.blog_writer` /
  `podcast.show_notes_generator` retired — `podcast_client.*` pair canonical.
- 2026-08-08 — **Large-cast (7–20 host) hardening: script stage verified live
  at 10/14/20.** Server (aidream): the solo/multihost/roundtable script agents
  now REQUIRE the `<speaker_settings>` declaration (name + gender; server owns
  voices) and follow a roster-first + count-check protocol; slots repinned
  (roundtable v4, multihost v6, solo v4); e2e matrix gained
  `roundtable_10/14/20`. Live prod runs hit the exact GATE 2 count at all
  three sizes with matching declarations. The same-day typed-LLMParams
  regression (broke all 3–20 host audio) is fixed AND deployed, as is the
  ElevenLabs 10-DISTINCT-voice cap found at 14/20 (speakers beyond 10 now share
  gender-matched voices; labels stay distinct). **10/14/20-host episodes all
  render end-to-end on prod** (runs `afd2d558`/`25031425`/`966bfb95`). Open
  product call: all-distinct voices at 11–20 would need multi-request render +
  stitch. Details: `docs/HANDOFF_PODCAST_SYSTEM.md` §5.1/§5.2.

- 2026-08-08 — **Chapter markers + pre-script processing went live (Coming
  Soon retired on both).** Run page: the Chapter markers ComingSoonCard is now
  `EpisodeChaptersPanel` → `useEpisodeChapters` — resolves the FLOATING
  `podcast.chapter_marker` slot client-side (`resolveAgentSlot`; the old
  version-pinned placeholder row was converted, since client slots must
  float), runs it one-shot (`useRunAgent`), parses `{chapters:[…]}` via the
  canonical `extractFirstObject`, and persists under
  `pc_episodes.metadata.chapters` via `podcastService.saveEpisodeChapters`
  (`PcEpisode.chapters` is mapped from metadata — NOT a column; never pass it
  to create/updateEpisode). Generator form: the Pre-script processing layer is
  interactive — one optional transform sent as `post_prep_option`
  (`translation` targets the episode's language / `summarization` /
  `expansion` / `fact_checking`), each backed by its own
  `podcast.post_prep_*` agent slot and applied server-side in
  `_apply_post_prep` (soft stage: failure keeps the original content).
  Post-script processing remains display-only Coming Soon.
- 2026-08-08 — **Live listening works for both podcast audio bands.** The
  ElevenLabs 3–20-host provider now emits each MP3 SDK chunk immediately on the
  existing `audio_stream_chunk` vocabulary while retaining those exact bytes
  for one canonical persisted file, then emits `audio_stream_end`. The studio
  adds a MediaSource MP3 player beside the Gemini PCM/Web Audio player and
  selects by `encoding`/`mime_type`; the same `LiveAudioPlayer` UI, seq/identity
  guards, and canonical-file handoff cover both. Focused tests prove the server
  emits before the provider iterator finishes and the client appends MP3 chunks
  in order before end-of-stream. `LiveAudioPlayer` snapshots the external player
  every 250 ms while mounted so provider bursts and inconsistent MediaSource
  progress events cannot leave Play/Pause or timing labels stale. Authenticated
  studio runs verified live playback and canonical handoff for 2-host Gemini and
  3-host ElevenLabs.
- 2026-08-08 — **Podcast agents are DB-managed slots; casts, styles, and
  languages stopped being one-size-fits-all.** Server (aidream, same-day):
  every pipeline agent (research, extraction, all script bands, both audio
  bands, metadata, image/video slots, feature-image pair) resolves through a
  `podcast.*` agent slot — repin from `/administration/agents/slots`, never a
  code constant; default cast names + voices now ROTATE per episode
  (gender-aware seeded draw on both the Gemini and ElevenLabs bands;
  cast-preview draws a fresh cast per form load — kills the eternal
  Alex/Sarah + orus/kore pair); feature image default style is `auto` (agent
  picks per episode). Frontend: `useEpisodeArticles` + `useSourceResolvers`
  resolve their agents via `resolveAgentSlot` (`podcast_client.blog_writer` /
  `show_notes` / `web_content_extractor` / `youtube_research`) — the four
  hardcoded agent-id constants are deleted; `featureImageStyles.ts` default
  flipped to `auto` (lockstep with the server); **all 24 languages enabled**
  in `LANGUAGE_OPTIONS` (generic script agents take `language`; Gemini +
  eleven_v3 TTS are natively multilingual; server maps locale codes → plain
  names). Server work committed to aidream main — **needs deploy** for the
  new cast preview/routing to reach prod. Jest 10/10; aidream gate tests 26/26.
- 2026-08-04 — **Podcast "failures" root-caused to a platform-wide DB write
  outage; runs can no longer be lost.** `history.row_versions` ran out of
  monthly partitions at 2026-08-01T00:00Z, so every write to a versioned table
  failed — including `chat.agent_run`. Consequences, in order: no durable run
  row → the pipeline emitted `run_id=""` → the client stored no
  `backend_run_id` → the runs list (which reads `agent_run`) was empty and the
  run page had nothing to resume; and separately every media persist failed, so
  the images AND the audio stage reported "An unexpected `<provider>` error
  occurred" for five different providers at once. **Images were never the
  cause** — they are soft-fail by design (`_run_asset_with_fallback`); only
  `create_audio` is fatal, and it failed for the same DB reason. DB fixed +
  auto-provisioned (root `FOUND_DEFECTS.md` D122). Frontend: `useStudioRun` now
  exposes **`orphaned`** (a row still claiming "running" with no durable record
  anywhere) and **`canRerun`**, and hydrates the re-run payload from the
  `pc_studio_runs.request` column — so `RunRecoveryBanner`'s new
  orphan state names the server fault and still offers Re-run from source
  instead of the page sitting on a run that will never finish. Server-side, a
  podcast run now REFUSES to start when its durable record can't be created
  (`RunCheckpointer.start(require_durable=True)` → `DurableRunUnavailable`), and
  a DB/ORM exception can no longer be laundered into a retryable provider
  `unknown_error` (`matrx_infrastructure_error`). 16 permanently-stuck
  `pc_studio_runs` rows were settled to `failed` with real explanations.
- 2026-07-28 — D99 fixed: useEpisodeArticles render-phase ref write removed; loading derived from fetch lifecycle.

- **2026-07-24 — Podcast generation supports durable source-entity identity.**
  The generic request type carries an optional context anchor. Research Outputs
  Studio sends its `research_topic` ID, so the podcast pipeline cannot switch
  organizations or fall back to personal scope when the user's active UI
  context changes.

- **2026-07-24 — One-shot podcast agents use the canonical scoped launcher.**
  Article generation and source resolvers now declare
  `matrx-frontend`/`podcast` attribution; `useRunAgent` supplies the active
  org/project/task through `callApi` instead of dropping request context.

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
  symlink (cartesia dep). Full status: `docs/HANDOFF_PODCAST_SYSTEM.md` (supersedes the archived `HANDOFF_2026-06-12.md`). Server work
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
  - `LiveAudioPlayer` consume `audio_stream_chunk`/`audio_stream_end`; early
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
  on read. Backend needs deploy to stop _new_ aborts; client heals existing ones.
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
  - RSS distribution settings persisted to new `pc_shows.rss_settings` jsonb
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
