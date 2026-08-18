# FEATURE.md — `education/media` (Generated Study Media: Audio Study + Mind Maps)

**Status:** `active` (FE complete. **Audio Study's real defect is generation OWNERSHIP, not TTS** —
see Known gaps. Every audio row in the DB is from 2026-07-14; nothing has exercised the pipeline
since, so the old "~86% failure" number describes a pipeline that has since been fixed twice and
is **not a current measurement**. Mind maps / summaries / memory aids generate fine. WP8 of the
education-platform program owns this — `common-docs/projects/education-platform/`)
**Tier:** `2`
**Last updated:** `2026-08-17`

---

## Purpose

Turn any study material (a flashcard deck, a note, or a topic) into consumable media:
broadcast-quality **audio** (podcast-style overviews, two-voice debates, multi-host panels, spoken
audio-review quizzes) and **visual concept maps** (mind maps / diagrams with clickable nodes that
resolve to the source card or open the AI tutor). Thin orchestration over the shipped platform
pipelines — it owns almost no generation code of its own.

Both tools persist to ONE canonical registry table, `education.study_media` (`media_kind` =
`audio | mind_map | summary`). It is P3 of the Education Hub.

---

## Entry points

**Routes** (`app/(core)/education/`)
- `audio-study/{page,new,[id],[id]/edit}` — library, create, artifact/run page.
- `mind-maps/{page,new,[id],[id]/edit}` — library, create, artifact page.

**Hooks**
- `audio/useAudioStudyCreate.ts` — start an audio study: build request → create `pc_studio_runs`
  run + `study_media` row → stash pending → navigate. The interactive create path.
- `mindmap/useGenerateMindMap.ts` — run the diagram_spec agent (single round-trip extraction).

**Services / core**
- `service.ts` — `studyMediaService` (direct-Supabase CRUD on `education.study_media`, RLS-gated).
- `audio/audioBrief.ts` — `buildAudioRequest` / `serializeDeck`: the ONE mapping from a format
  (overview/debate/panel) onto the reused podcast `PodcastGenerateRequest`.
- `audio/resolveAudioSource.ts` — deck/topic → content + TrustEnvelope + adaptive weak-area note.
- `audio/audioGenerator.ts` — the `audio` **converter generator** (P9/P4 fan-out): source text →
  audio study, self-registered on the convert registry (`education.audio_generate`).
- `mindmap/linkCards.ts` — resolves generated diagram nodes → their source cards (label/text
  match, precision-tuned ~9/10 on a deck-grounded map). Stamps `node.metadata.cardId`.
- `mindmap/mandates.ts` — the Study Mind Map mandate (`education.mindmap_generate`, emits
  `diagram_spec`; resolved live to the DB-bound agent — swap at `/agents/mandates`).

**Key components**
- `audio/components/` — `AudioStudyHome`, `AudioStudyNew`, `AudioStudyDetail` (live run + durable
  player, agent_run recovery), `AudioReviewSession` (spoken quiz → study spine).
- `mindmap/components/` — `MindMapHome`, `MindMapNew`, `MindMapDetail`, `MindMapView`
  (renders the diagram + owns the node-click panel).

---

## What it reuses (does NOT own)

- **Audio generation + recovery:** the entire `features/podcasts` studio pipeline
  (`studioRunsService`, `useStudioRun`, `LiveProgressRail`, `RunRecoveryBanner`) + the aidream
  `/podcast/generate` NDJSON stream. `buildAudioRequest` is the only P3-owned shaping.
- **Diagram rendering:** `components/mardown-display/blocks/diagram/InteractiveDiagramBlock`
  (content-IR / ReactFlow). P3 added an **opt-in `onNodeClick`** prop (other consumers unaffected).
- **Voice grading + study spine:** `gradeSpokenAnswer` + `studyService.recordAttempt`
  (`method: 'audio_review'`) — audio review is "FastFire in audio-only format".
- **Tutor affordance:** `features/education/tutor` `AskTutorButton` — a node click seeds it.
- **Trust:** `features/education/trust` `TrustEnvelope` / `SourceCitations` / `ConfidenceBadge`.

---

## Invariants

- One table (`education.study_media`), one service (`studyMediaService`). No parallel store.
- Audio never persists an expiring URL: it stores a re-mintable `audio_file_id` **or** a durable
  `episode_id` (recovery path). Playback via `InlineMediaRef` / episode `audio_url`, never a raw
  signed URL (see `features/files/handler`).
- `InteractiveDiagramBlock.onNodeClick` is **opt-in** — never make node clicks a required behavior
  of the shared block.
- Mind-map + audio artifacts carry a grounded `TrustEnvelope` derived from the source (their
  agents emit no citations) — never `trust: null`.
- The `study_session.source_kind` for a deck is `'set'`, never `'deck'` (DB check constraint).

---

## Known gaps (LOUD — unverified / blocked)

- **CORRECTED 2026-08-17 (WP8): the "D40 TTS stall" story above was wrong on both counts.**
  (1) **There is no D40** — no such entry has ever existed in aidream's `FOUND_DEFECTS.md`
  (verified with `git log -S`); the id was invented here and then cited by four other documents.
  (2) **The TTS stall was fixed weeks ago** — segmentation + per-segment retry + partial recovery
  landed in matrx-ai on 2026-07-10 (`83a94245d`) and a 750-char cap for `gemini-3.1-flash-tts` on
  2026-08-11 (`4a217c611`). Every failing row in the DB predates those. Only a *first-segment*
  total stall still hard-aborts.
- **[REAL, open] The generation is owned by a BROWSER TAB, and that is the actual defect.** The
  client creates `pc_studio_runs` + `study_media` rows and stashes the request **in memory**;
  generation only starts when the detail page mounts. So: a kit/convert fan-out that is never
  opened runs **nothing at all** (no `chat.agent_run` row is ever created, which also makes it
  unreachable by every server recovery path — `/podcast/resume` 404s on it); and a tab that dies
  mid-run leaves the row stamped `generating` forever, because the terminal status is written
  client-side, best-effort. Live proof: a row still says `generating` while its run says `failed`.
  **WP8 fix LANDED 2026-08-17:** `education_media_reconcile` (aidream
  `services/education_media/reconcile.py`, scheduler task `…388`, every 10 min) mirrors terminal
  run state onto `study_media` and starts never-started rows headlessly (bounded: <24h old,
  once-only via a CAS-stamped `metadata.reconcile_started_at`, 5 starts/sweep). Proven on the live
  divergent row — `generating`+run `failed` → `error` carrying the run's own reason. **Live audio
  rows claiming `generating` falsely: 0.** The seed ships handler-gated (`enabled=false`) and
  `activate_registered_system_tasks()` flips it at boot — no manual step. Contract: IC-6 in
  `common-docs/projects/education-platform/INTEGRATION_MAP.md`. **Still unverified at runtime: the
  headless START branch**, which spends money and was proven only up to its pre-launch guards.
- **[CLOSED 2026-08-17] A failed audio study is no longer a dead end.** The detail surface now
  shows what failed plus a real retry (re-runs the stored request, reusing the row) or a
  regenerate door when there is no request to replay, and writes `status` back to `generating`
  the moment a retry streams so the library stops showing "Failed" during a live re-run.
- **[CLOSED 2026-08-17] The convert/kit fan-out no longer reports success for unproduced audio.**
  `ConvertResult.pending` / `KitTargetState.stillGenerating` carry the truth; the kit counts only
  artifacts that actually exist.
- **Not yet measured:** the >95% success bar in WP8's definition of done. No audio has been
  generated since 2026-07-14, so the success rate must be **measured by generating new artifacts**,
  not inferred from the old rows. Do not quote a success rate until that run happens.
- **Live mind-map GENERATION is PROVEN (2026-07-10).** A *fresh* deck→diagram_spec run (agent
  `d13184d4…`) produced 10 nodes / 11 edges, `linkDiagramToCards` linked **all 10 nodes → real cards**
  (every `metadata.cardId` resolves to an `fc_card` row), grounded `TrustEnvelope`, persisted to
  `education.study_media` (`media_kind='mind_map'`, `diagram_kind='diagram_spec'`, `status='ready'`).
- **Audio REVIEW → spine is PROVEN** (`study_attempt method='audio_review'` verified via SQL),
  driven programmatically through `studyService` (real mic capture can't run headlessly).

---

## Change log

- **2026-08-18** — all AI steps resolve through mandates (IC-1); UUID registry deleted
  (`mindmap/agents.ts` → `mindmap/mandates.ts`, `education.mindmap_generate`).
- **2026-08-17** — **Status header corrected (WP12, education-platform program):** "blocked by a
  backend outage" was stale — generation runs but the audio TTS stage fails ~86% live (5 error /
  1 generating / 1 ready measured). WP8 owns the pipeline fix + user-visible retry.
- **2026-08-11** — **Mind maps and audio review stream (THE FLOATING LAW).** `useGenerateMindMap` runs through `useFloatingAgentRun`, so the `diagram_spec` renders as its kind component in the floating `LiveRunWindow` token-by-token (live-verified on `/education/mind-maps/new`). `AudioReviewSession`'s per-answer grading renders `LiveRunDisplay` inline in the centered grading state — the earned exception: mid-session the wait IS the whole screen, so a floating window over an empty voice screen would be worse.
- **2026-07-14** — Cross-surface orphan-on-interrupt fix (same pattern as
  `education/spoken-practice`'s GAP 2, `54d379d53`). `AudioReviewSession.endSession` already
  marked the `study_session` terminal (`completed`) synchronously with no async enrichment after
  it, but `quit()` (back button / "Quit" mid-session) never touched session status at all —
  leaving `status='active'` forever with attempts recorded but no terminal state whenever a
  learner left early. `quit()` now mirrors `useSpokenPractice.quit()`: marks the session
  `'abandoned'` + `ended_at`, loud-recovering (`console.error`) on failure; `endSession` also now
  loud-recovers (console + toast) if the completed-status write itself fails. Verified via
  Supabase MCP by driving both the completed and abandoned paths programmatically against
  `education.study_session` (real mic capture can't run headlessly): both reach a terminal
  status, and the live `audio_review` session set shows zero `active` rows after.
- **2026-07-10** — P3 gap-closing pass. (1) Fixed a real bug: `AudioReviewSession` created its
  session with `sourceKind: 'deck'` (violates the `study_session` check constraint → silently
  orphaned attempts); now `'set'` + loud failure. (2) Mind-map **clickable nodes** shipped:
  `linkCards.ts` resolves nodes → source cards, `InteractiveDiagramBlock` gained an opt-in
  `onNodeClick`, `MindMapView` renders a node panel (source card + AskTutorButton). (3) Registered
  the `audio` **converter generator** so note→audio + the P9 upload-kit fan-out light up.
  (4) Trust envelopes now populate on the mind-map create paths. Verified: audio-review spine
  (SQL), diagram render + node-click + card-link (9/10 on a real diagram), converter registration.
  Blocked (backend): live audio + mind-map generation.
- **2026-07-10 (post-outage)** — Live re-verification after the aidream backend recovered, via a real
  supabase-js session driving the true client contracts. **Mind-map: PASS** — fresh deck→diagram_spec
  (agent `d13184d4…`): 10 nodes / 11 edges, all 10 nodes linked to real `fc_card` rows, grounded trust,
  persisted `study_media` `media_kind='mind_map'` `status='ready'` (`542c4b3d…`). **Audio: FAIL, root
  cause MOVED** — script agent now emits a valid `<podcast_dialogue>`; the audio stage streams ~4449
  chunks over ~6 min then aborts `tts_stall_timeout` (Google TTS mid-stream stall, no retry), so still
  `0` `ready` audio episodes. Backend-owned; FE path verified up to handoff.
  *(Correction 2026-08-17: this entry cited a defect id "D40" that never existed in aidream's
  `FOUND_DEFECTS.md`, and the stall it describes was fixed in matrx-ai the same day this was
  written — `83a94245d`. Kept as the historical observation; see Known gaps for what is true now.)*
- **2026-07-10 (Convergence-B)** — `audioGenerator` now writes its `source` lineage edge through the
  shared `recordSourceLineage` (`features/education/convert`) instead of an inline
  `associationsService` call (same edge, one canonical writer). `audio/audioBrief.ts#serializeDeck`
  is now also reused by the flashcard-set detail's new **Convert** affordance (deck → other study
  artifacts), not just the audio overview — one deck-serialization mapping, two consumers.
- **2026-07-07** — Initial P3 build: routes, `study_media` table + service, audio create/run/detail
  + recovery, mind-map create/view, both flipped `live` in `tools.ts`.
