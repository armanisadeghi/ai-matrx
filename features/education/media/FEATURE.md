# FEATURE.md — `education/media` (Generated Study Media: Audio Study + Mind Maps)

**Status:** `active` (FE complete; live generation blocked by a backend outage — see Known gaps)
**Tier:** `2`
**Last updated:** `2026-07-10`

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
- `mindmap/agents.ts` — the Study Mind Map agent id (`d13184d4…`, emits `diagram_spec`).

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

- **[CRITICAL, backend-owned] Live audio GENERATION is unproven end-to-end.** The FE path is
  complete and exercised up to the backend handoff, but the aidream podcast script agent currently
  returns prose instead of a `<podcast_dialogue>` block (fails EVERY deck), and the whole agent-run
  pipeline fails `resolve_call_profile` for every model. Both filed as critical feedback. `0` rows
  of `media_kind='audio'` have reached `status='ready'`. Re-verify a full generation once fixed.
- **[HIGH, backend-owned] Live mind-map GENERATION is blocked by the same agent-run outage.** The
  render + node-click + card-link + trust path is verified against real prior agent-generated
  diagrams (a clickable demo map exists); a *fresh* generation must be re-verified once fixed.
- **Audio REVIEW → spine is PROVEN** (`study_attempt method='audio_review'` verified via SQL),
  driven programmatically through `studyService` (real mic capture can't run headlessly).

---

## Change log

- **2026-07-10** — P3 gap-closing pass. (1) Fixed a real bug: `AudioReviewSession` created its
  session with `sourceKind: 'deck'` (violates the `study_session` check constraint → silently
  orphaned attempts); now `'set'` + loud failure. (2) Mind-map **clickable nodes** shipped:
  `linkCards.ts` resolves nodes → source cards, `InteractiveDiagramBlock` gained an opt-in
  `onNodeClick`, `MindMapView` renders a node panel (source card + AskTutorButton). (3) Registered
  the `audio` **converter generator** so note→audio + the P9 upload-kit fan-out light up.
  (4) Trust envelopes now populate on the mind-map create paths. Verified: audio-review spine
  (SQL), diagram render + node-click + card-link (9/10 on a real diagram), converter registration.
  Blocked (backend): live audio + mind-map generation.
- **2026-07-07** — Initial P3 build: routes, `study_media` table + service, audio create/run/detail
  + recovery, mind-map create/view, both flipped `live` in `tools.ts`.
