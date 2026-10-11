# FEATURE.md — `education/media` (Generated Study Media: Audio Study, Mind Maps)

**Status:** `active`. Product status and the audio success-rate bar live in the education node (`common-docs/systems/education/STATE.md`).
**Tier:** `2`

## Purpose

Turn study material (a flashcard deck, a note, a topic) into media: podcast-style **audio**
(overview, two-voice debate, multi-host panel, spoken audio-review quiz) and clickable **mind
maps** that resolve nodes to source cards or the AI tutor. Thin orchestration over the podcast
studio pipeline. Both persist to ONE registry table, `education.study_media`
(`media_kind` = `audio | mind_map | summary | memory_aid`, see `types.ts`).

## Where it lives

- Routes (`app/(core)/education/`): `audio-study/{page,new,new/manual,[id],[id]/edit,review}`,
  `mind-maps/{page,new,new/manual,[id],[id]/edit}`; the shareable viewer `/education/media/[id]`.
- `service.ts` — `studyMediaService`, the only direct-Supabase CRUD on `study_media` (RLS-gated).
- `audio/` — `audioBrief.ts` (`buildAudioRequest`/`serializeDeck`: the one mapping from a format
  to the podcast `PodcastGenerateRequest`; also reused by the flashcard Convert affordance),
  `resolveAudioSource.ts`, `audioGenerator.ts` (the `audio` convert generator,
  capability `education.audio_generate`), `useAudioStudyCreate.ts`, `useAudioStudyRunPersistence.ts`.
- `mindmap/` — `useGenerateMindMap.ts` (`useFloatingAgentRun`, `diagram_spec`), `linkCards.ts`
  (nodes → source cards, stamps `node.metadata.cardId`), `mandates.ts` (`education.mindmap_generate`),
  `mindMapWrites.ts` (`withUniqueEdgeIds`).
- `components/MediaRouter.tsx` dispatches by `media_kind` to the audio, mind-map, memory
  (`memory/`) or summary (`onboard/`) detail. **A new media kind must be added to `EduMediaKind`
  AND to `MediaRouter`**, or its rows open the audio player.

## Reuses (does not own)

`features/podcasts` studio pipeline (`studioRunsService`, `useStudioRun`, `RunRecoveryBanner`) and
the aidream `/podcast/generate` stream; `InteractiveDiagramBlock` (opt-in `onNodeClick`);
`gradeSpokenAnswer` + `studyService.recordAttempt` (`method: 'audio_review'`);
`education/tutor` `AskTutorButton`; `education/trust`.

## Invariants

- One table, one service. No parallel store.
- Audio never persists an expiring URL: it stores a re-mintable `audio_file_id` or a durable
  `episode_id`. `AudioPlayback` resolves that through the media client and renders the shared
  `PodcastAudioPlayer` — never browser-native controls or a raw signed URL.
- `InteractiveDiagramBlock.onNodeClick` stays opt-in; never required of the shared block.
- Mind-map and audio artifacts carry a grounded `TrustEnvelope` derived from the source (their
  agents emit no citations) — never `trust: null`.
- A deck's `study_session.source_kind` is `'set'`, never `'deck'` (DB check constraint).
- Every stored mind map has unique, present edge ids: both creators go through
  `withUniqueEdgeIds`; the edit page refuses duplicates.
- A surface that creates an audio run MUST stream it. `audioGenerator` creates the run + row and
  stashes the request in module memory; a row nobody streams stays `generating` forever. The two
  hosts are `AudioStudyDetail` and `KitAudioRunner` (study-kit board), both writing the outcome
  through `useAudioStudyRunPersistence`.
- A failed audio study shows what failed plus a real retry (re-runs the stored request on the same row, status back to `generating`), or a regenerate door when no request exists.
- Mind-map node panel and Sources panel are docked (`MatrxDynamicPanelHost`), never a modal `Sheet`.
- `AudioReviewSession` quit marks its `study_session` `abandoned`; completion marks it `completed`.

## Known gap: generation is owned by a browser tab

The client creates `pc_studio_runs` + `study_media` rows and starts generation only when the
detail page mounts, so an unopened fan-out row runs nothing and a dead tab leaves `generating`
forever. The server-side owner is `education_media_reconcile` (mechanics:
`aidream/aidream/services/education_media/FEATURE.md`; contract: IC-6 in
`common-docs/systems/education/INTEGRATION_MAP.md`). It is suspended pending schedule approval
(`common-docs/systems/education/STATE.md`), so stuck rows are not currently healed.

Cross-repo system-of-record: /Users/armanisadeghi/code/common-docs/systems/education/STATE.md — read it before touching this feature in ANY repo.
