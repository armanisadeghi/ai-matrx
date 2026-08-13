/**
 * Surface manifest — Audio Study (`matrx-user/education-audio-study`).
 *
 * The Audio Study tool at `/education/audio-study`: turns a flashcard deck or
 * a free-text topic into produced audio (a narrated overview, a two-voice
 * debate, or a multi-host panel) persisted as an `education.study_media` row
 * with `media_kind='audio'`. A separate live "Audio review" mode quizzes the
 * learner out loud over a deck and grades answers on meaning.
 *
 * WHY THIS MANIFEST EXISTS AT ALL. `route-to-surface.ts` already mapped
 * `/education/audio-study` → `matrx-user/education-audio-study`, and `ui.ui_surface`
 * already carried an ACTIVE row with a `url_pattern` — but there was no manifest
 * and no `SurfaceRuntimeProvider` anywhere in `features/education/media/audio/**`.
 * Same failure class as `education-memory` before it was closed: agents were
 * bindable here and blind here (empty scope, silent "Running without live page
 * context" fallback). This manifest plus three emitters close it for the
 * generate/browse/listen path.
 *
 * FOUR ROUTES, ONE SURFACE (mostly) — plus a documented emitter gap:
 *
 *   list    /education/audio-study            AudioStudyHome    — the library
 *   new     /education/audio-study/new         AudioStudyNew     — the generate form
 *   detail  /education/audio-study/[id]        AudioStudyDetail  — live run + player
 *           /education/audio-study/[id]/edit   AudioStudyDetail  — same component,
 *           server EDIT-gated (`requireAccess`) so a view-only sharee is redirected
 *           to the read-only `[id]` URL. There is no separate editor UI — `view`
 *           reports `"detail"` on both routes, same reasoning as
 *           `education-memory` / `education-mind-maps`.
 *   review  /education/audio-study/review       AudioReviewSession — a LIVE voice
 *           quiz (mic capture, spoken grading, FSRS-adaptive ordering) built on
 *           entirely different machinery (`useCartesiaSpeaker`, continuous mic
 *           capture, `gradeSpokenAnswer`) than the other three views. This
 *           manifest declares its `review_*` values (view state agents can read
 *           to explain what's happening) but does NOT mount a
 *           `SurfaceRuntimeProvider` there in this pass — the phase machine
 *           (setup → asking → answering → grading → result → summary) mutates on
 *           timers and a warm mic mid-session, and a synchronous `getScope`
 *           wiring deserves its own review pass rather than a bolt-on here. The
 *           grading step already runs its own agent conversation via
 *           `gradeSpokenAnswer` / `useLiveRunHandle`, independent of this surface.
 *
 * Curated groups (band 0-899):
 *
 *   tool_view           Which view is open (the discriminator) — read first
 *   audio_library        The saved audio studies listed on /education/audio-study
 *   generation_request   The /new composer — source, format, options
 *   audio_record         The open study's identity, playback, and run state
 *   audio_trust          What the open study is grounded in (READ-ONLY evidence)
 *   review_session        Read-only state of a live Audio Review session
 *
 * NO WRITE TARGETS — same reasoning as `education-memory`: the only editable
 * fields are the /new composer's source/format/options, consumed by ONE
 * metered, human-pressed Generate button (`education.audio_generate`). Nothing
 * on the detail view is editable (regenerate routes back to /new). The Audio
 * Review setup form (deck + adaptive toggle) is a second small composer but the
 * view has no emitter in this pass, so no write target is declared against it.
 *
 * Emitters: `AudioStudyHome.tsx` (list), `AudioStudyNew.tsx` (new),
 * `AudioStudyDetail.tsx` (detail) — all in
 * `features/education/media/audio/components/`.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "tool_view",
    label: "Tool view",
    sortOrder: 100,
    description:
      "Which of the Audio Study views the learner is on. Read this first — it tells you which of the other groups carry values at all.",
  },
  {
    key: "audio_library",
    label: "Audio library",
    sortOrder: 200,
    description:
      "The audio studies the learner owns or can see, as listed on the tool's home page.",
  },
  {
    key: "generation_request",
    label: "Generation request",
    sortOrder: 300,
    description:
      "The composer on /education/audio-study/new — source, format, and options. Nothing here is generated yet.",
  },
  {
    key: "audio_record",
    label: "Audio study",
    sortOrder: 400,
    description:
      "The open audio study's identity, playback readiness, and live-generation run state.",
  },
  {
    key: "audio_trust",
    label: "Grounding",
    sortOrder: 500,
    description:
      "What the open audio study was built from and how confident that grounding is. Derived evidence — never authored here.",
  },
  {
    key: "review_session",
    label: "Audio review session",
    sortOrder: 600,
    description:
      "Read-only state of a live spoken review session on /education/audio-study/review. No emitter is mounted here yet — see the manifest header.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Tool view ──────────────────────────────────────────────────────────
  {
    name: "view",
    label: "Current view",
    description:
      'Which Audio Study view is open: "list" (the saved-studies home), "new" (the generation composer), "detail" (one study open — player or live run), or "review" (a live spoken quiz session). Always present when the surface emits at all — the read-only `/[id]/edit` access-gate route renders the same detail view and reports "detail".',
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 300,
    group: "tool_view",
  },

  // ── Audio library (list view) ─────────────────────────────────────────
  {
    name: "library_loaded",
    label: "Library loaded",
    description:
      "True once the saved audio studies have finished loading on the list view. False while still in flight — do not describe the library as empty until this is true. Absent on the other views.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "audio_library",
  },
  {
    name: "audio_count",
    label: "Saved audio studies",
    description:
      "How many audio studies the learner can see, after RLS filtering. 0 when the library is genuinely empty. Only present on the list view once loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 310,
    group: "audio_library",
  },
  {
    name: "audio_library",
    label: "Audio library",
    description:
      "Every saved audio study on the list view, as { id, title, format, source_title, status } — status is 'ready' | 'error' | in-progress. Empty array when the learner has none. Only present on the list view.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 320,
    group: "audio_library",
  },

  // ── Generation request (new view) ─────────────────────────────────────
  {
    name: "request_source_kind",
    label: "Source kind",
    description:
      'Which source mode the composer is in: "deck" (build audio from one of the learner\'s flashcard decks) or "topic" (build it from free text they type). Only present on the new view.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "generation_request",
  },
  {
    name: "request_deck_id",
    label: "Selected deck",
    description:
      "UUID of the flashcard deck the audio will be built from. Absent when the composer is in topic mode or no deck has been picked yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
    group: "generation_request",
  },
  {
    name: "request_topic",
    label: "Topic",
    description:
      'The free-text topic the learner typed to build audio from (e.g. "The causes of the French Revolution"). Absent in deck mode or while the box is still empty.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 320,
    group: "generation_request",
  },
  {
    name: "request_format",
    label: "Format",
    description:
      '"overview" (narrated walkthrough), "debate" (two opposing voices), or "panel" (multi-host roundtable). Always present on the new view — the composer opens on "overview" by default.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 330,
    group: "generation_request",
  },
  {
    name: "request_host_count",
    label: "Host count",
    description:
      "How many voices the produced audio will use — 2 by default, 3-6 for a panel. Always present on the new view.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 1,
    sortOrder: 340,
    group: "generation_request",
  },
  {
    name: "request_adaptive",
    label: "Target weak areas",
    description:
      'True when the "target my weak areas" option is checked (deck mode only) — biases the produced audio toward concepts the learner has been struggling with, from FSRS study history. Always present in deck mode on the new view; meaningless in topic mode.',
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 350,
    group: "generation_request",
  },
  {
    name: "generation_request",
    label: "Generation request",
    description:
      "The whole composer state as one object — source kind, the deck id or typed topic, format, host count, and the weak-areas toggle. The composite twin of the values above; present on the new view whenever any of them is.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 260,
    sortOrder: 360,
    group: "generation_request",
  },
  {
    name: "available_decks",
    label: "Available decks",
    description:
      "The flashcard decks offered in the composer's deck picker, each with its id and name. Empty array when the learner has no decks; absent until the picker's list has loaded. Only present on the new view.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1200,
    sortOrder: 370,
    group: "generation_request",
  },

  // ── Audio study (detail view) ──────────────────────────────────────────
  {
    name: "record_loaded",
    label: "Study loaded",
    description:
      "True once the open audio study's row has finished loading on the detail view. False while it is in flight or when the id is missing/denied — in which case the record values below are absent. Absent on the other views.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 300,
    group: "audio_record",
  },
  {
    name: "audio_id",
    label: "Audio study id",
    description:
      "UUID of the audio study the learner has open (its `education.study_media` row id). Present on the detail view from the first render, before the row itself has loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
    group: "audio_record",
  },
  {
    name: "audio_title",
    label: "Audio study title",
    description:
      "Title of the open audio study, as generated and stored. Absent until the row has loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 320,
    group: "audio_record",
  },
  {
    name: "audio_format",
    label: "Format",
    description:
      '"overview", "debate", "panel", or "review" — the format this study was generated in. Absent until the row has loaded.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 330,
    group: "audio_record",
  },
  {
    name: "audio_status",
    label: "Study status",
    description:
      '"ready" once produced audio exists, "error" if generation failed, otherwise still generating. Absent until the row has loaded.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 9,
    sortOrder: 340,
    group: "audio_record",
  },
  {
    name: "audio_is_ready",
    label: "Playback ready",
    description:
      'True when a durable audio file (or a produced episode) exists and the ready player renders. False while a run is live/being recovered, in which case the page shows the streaming generation view instead. Absent until the row has loaded.',
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 350,
    group: "audio_record",
  },
  {
    name: "audio_is_owner",
    label: "Viewer owns this study",
    description:
      "True when the current user owns the open audio study and therefore sees the regenerate / share / delete controls. False for a shared viewer listening to someone else's audio. Absent until access has resolved.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 360,
    group: "audio_record",
  },
  {
    name: "audio_source_kind",
    label: "Built from",
    description:
      '"deck" or "topic" — what the open study was generated from. Absent until the row has loaded.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 370,
    group: "audio_record",
  },
  {
    name: "audio_source_title",
    label: "Source name",
    description:
      'Human name of the deck or topic the open study was built from, shown as "from …" above the title. Absent when the stored row recorded no source title.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 50,
    sortOrder: 380,
    group: "audio_record",
  },
  {
    name: "audio_source_id",
    label: "Source id",
    description:
      "UUID of the deck the open study was built from. Absent for a free-text topic source, which has no record to point at.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    sortOrder: 390,
    group: "audio_record",
  },
  {
    name: "run_status",
    label: "Live run status",
    description:
      'The streaming generation run\'s status when the study is not yet ready — "running", "error", or absent once `audio_is_ready` is true (the page renders the durable player instead). Absent on the ready path and until the row has loaded.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 400,
    group: "audio_record",
  },

  // ── Grounding ──────────────────────────────────────────────────────────
  {
    name: "audio_confidence",
    label: "Grounding confidence",
    description:
      'How well the open study is grounded in real source material — "grounded" when built from a deck with citations, "inferred" when built from a typed topic. Absent when the row carries no trust envelope.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 300,
    group: "audio_trust",
  },
  {
    name: "audio_citations",
    label: "Cited sources",
    description:
      "The passages the open study is grounded in, from its stored trust envelope. Empty array for an inferred (topic-built) study. Derived evidence — never authored on this page.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    autoContext: false,
    sortOrder: 310,
    group: "audio_trust",
  },

  // ── Audio review session (review view — declared, no emitter yet) ─────
  {
    name: "review_phase",
    label: "Review phase",
    description:
      '"setup" (picking a deck), "asking" (question read aloud), "answering" (learner speaking), "grading" (spoken answer being graded), "result" (verdict shown), or "summary" (session complete). No emitter mounts this surface on /education/audio-study/review yet, so this value is currently NEVER emitted at runtime — declared for when that gap closes.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 9,
    sortOrder: 300,
    group: "review_session",
  },
  {
    name: "review_deck_id",
    label: "Review deck",
    description:
      "UUID of the flashcard deck the live review session is drawing questions from. Not currently emitted — see review_phase.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
    group: "review_session",
  },
  {
    name: "review_card_index",
    label: "Review progress",
    description:
      "0-based index of the card currently being asked, out of the session's card count. Not currently emitted — see review_phase.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 2,
    sortOrder: 320,
    group: "review_session",
  },
];

export const educationAudioStudyManifest: SurfaceManifest = {
  surfaceName: "matrx-user/education-audio-study",
  readiness: "partial",
  readinessNote:
    "Manifest + three emitters (list, new, detail) shipped, targeting a live DB row that previously had no manifest at all. NOT yet: DB sync has not been run; the Audio Review live-voice session (/education/audio-study/review) declares review_* values but has no SurfaceRuntimeProvider mount (its phase machine deserves its own pass, see manifest header); this surface declares no write targets (composer fields are consumed by a single metered, human-pressed Generate button — same judgment as education-memory) and no agent roles; no data-surface-value Locate anchors are tagged; no live-agent-run verification or Matrx-vs-matrix test has been performed.",
  label: "Audio Study",
  urlPattern: "/education/audio-study",
  intro: `<surface_intro>
You are in Audio Study at /education/audio-study — the tool that turns flashcard decks or topics into produced audio (a narrated overview, a two-voice debate, or a multi-host panel), plus a separate live spoken-review mode. Read \`view\` FIRST — it is "list", "new", "detail", or "review", and it decides which other values are even present.
On "list" you see the learner's saved audio studies (\`audio_library\`, \`audio_count\`). Wait for \`library_loaded\` before calling the library empty.
On "new" the learner is composing a generation request: \`request_source_kind\` is "deck" or "topic", \`request_format\` is overview/debate/panel, and \`generation_request\` carries the whole composer state including host count and the weak-areas toggle. Nothing has been generated yet, and generating spends a metered allowance, so help them decide what to ask for — suggest a format, a sharper topic, or which deck is worth turning into audio — and leave the Generate button to them.
On "detail" one stored study is open. \`audio_is_ready\` tells you whether the durable player is showing or a live run is still producing (\`run_status\`). \`audio_confidence\` and \`audio_citations\` are derived grounding evidence — cite them, never claim to change them.
"review" is a live spoken quiz session (mic capture, spoken grading) built on separate machinery; this surface currently emits nothing there, so treat any review_* value you see as stale/absent until told otherwise.
You cannot WRITE anything here — this surface declares no write targets, and nothing on the detail view is editable (the learner's path to different audio is Regenerate, which routes back to /new).
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** One entry in `audio_library`. */
export interface AudioLibraryEntry {
  id: string;
  title: string;
  format: string | null;
  source_title: string | null;
  status: string;
}

/** One entry in `available_decks`. */
export interface AudioDeckOption {
  id: string;
  name: string;
}

/** The `generation_request` composite value. */
export interface AudioGenerationRequest {
  source_kind: string;
  deck_id: string | null;
  topic: string | null;
  format: string;
  host_count: number;
  adaptive: boolean;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value declared
 * `alwaysAvailable: true`; optional keys mirror `alwaysAvailable: false`.
 *
 * Only `view` is guaranteed: the emitted views each supply only their own
 * group. `review` currently emits nothing at all (no mount).
 */
export function createEducationAudioStudyScope(values: {
  // alwaysAvailable: true → required
  view: "list" | "new" | "detail" | "review";
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  // list
  library_loaded?: boolean;
  audio_count?: number;
  audio_library?: AudioLibraryEntry[];
  // new
  request_source_kind?: string;
  request_deck_id?: string;
  request_topic?: string;
  request_format?: string;
  request_host_count?: number;
  request_adaptive?: boolean;
  generation_request?: AudioGenerationRequest;
  available_decks?: AudioDeckOption[];
  // detail
  record_loaded?: boolean;
  audio_id?: string;
  audio_title?: string;
  audio_format?: string;
  audio_status?: string;
  audio_is_ready?: boolean;
  audio_is_owner?: boolean;
  audio_source_kind?: string;
  audio_source_title?: string;
  audio_source_id?: string;
  run_status?: string;
  audio_confidence?: string;
  audio_citations?: unknown[];
  // review (declared, not emitted — see manifest header)
  review_phase?: string;
  review_deck_id?: string;
  review_card_index?: number;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
