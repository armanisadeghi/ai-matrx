/**
 * Surface manifest — Podcast Run (`matrx-user/podcast-run`).
 *
 * Drives `/podcast/studio/run/[id]` — the durable production record for one
 * podcast generation (`features/podcasts/studio/components/StudioRunView.tsx` →
 * `studio/runs/useStudioRun.ts`). It streams live when reached straight from
 * the composer and rebuilds itself from the saved run + episode rows on any
 * later return, so a creation is never lost.
 *
 * Deliberately SEPARATE from `matrx-user/podcast-studio`: that surface holds a
 * draft request and nothing produced; this one holds run status, stages, the
 * script, per-asset media, and the finished episode. The value sets are
 * disjoint and the useful agents differ (a run diagnostician / transcript +
 * show-notes writer here; a source and cast advisor there).
 *
 * MEDIA DOCTRINE — this surface NEVER emits a media URL. The run's audio,
 * covers, clips, and composed video arrive from the stream and the server as
 * URLs that are frequently SIGNED and expire (see root `FOUND_DEFECTS.md` D1
 * and `features/surfaces/manifests/files.manifest.ts` `durablePublicUrl`).
 * Only durable refs cross this boundary: `audio_file_id`, `cover_file_id`, and
 * per-slot `file_id`s, plus booleans for "does this asset exist yet". No
 * `storage_uri`, ever. Agents that need bytes resolve a file_id.
 *
 * The `run-a…f` / `run-dense` / `run-sharp` / `run-refine` / `run-reimagine`
 * route variants are UI-bakeoff weight and are NOT part of this contract —
 * `/podcast/studio/run/[id]` is the canonical route.
 *
 * ── THE WRITE HALF (2026-08-10) ───────────────────────────────────────────
 * Three ask-policy `entity` targets, and they are the ONLY three things on
 * this page an agent may change: `episode_title`, `episode_description`,
 * `episode_chapters`. Everything else on a run page is either OUTPUT or a
 * gate, and the reasoning is written down here rather than left to omission.
 *
 * 1. RE-RUNNING IS NOT A TARGET. Generating, resuming, re-running from
 *    source, regenerating an image/video slot, and adding a new asset all
 *    spend real money on models. The settled precedent is `podcast-studio`
 *    (an agent fills the composer; the human presses Generate) and
 *    `image-generate` ("**Generate is deliberately NOT a target**"), and this
 *    surface is the far side of exactly that press. An agent that thinks the
 *    episode should be remade says so; the human presses the button.
 *
 * 2. THE PRODUCED ARTEFACTS ARE OUTPUT AND HAVE NO WRITE PATH, EVER. The
 *    rendered audio, the composed episode video, every image/video slot, the
 *    full `script`/transcript and its previews, and the whole `run_progress`
 *    + `diagnostics` half (status, stages, liveness, tallies, errors, the
 *    original request, research activity) are the record of what the pipeline
 *    ACTUALLY did. This is the `markdown-editor` `processed_data`/`ast` rule:
 *    derived output moves by re-deriving it, never by an agent writing over
 *    it. Writing a stage status or an error string would forge the run's own
 *    honesty record, and the surface intro tells agents to diagnose from
 *    those exact fields.
 *
 * 3. PUBLISHING AND SHARING STAY HUMAN. `is_published`, the episode slug and
 *    its public `/podcast/[slug]` identity, `display_mode`, and the
 *    blog/show-notes publish toggles are all undeclared — the `html-page`
 *    precedent that going live is a human action, plus the plain fact that a
 *    slug is identity, not copy. Deleting anything is human by doctrine.
 *
 * 4. THE COVER IS NOT A TARGET. `selectCover` writes `pc_episodes.image_url`,
 *    but the surface deliberately emits durable file refs and never image
 *    URLs (see MEDIA DOCTRINE above), so an agent has no legal value to name
 *    — and choosing between rendered images is a visual judgment it cannot
 *    make from this scope anyway.
 *
 * RELATIONSHIP TO THE EXISTING "AI TITLE OPTIONS" PANEL. The run page already
 * has an AI title affordance: `EpisodeTitlePanel` runs the
 * `podcast.title_optimizer` slot and lists ranked options, and clicking "Use"
 * calls `useEpisodeTitleOptions.apply()` → `podcastService.updateEpisode(id,
 * { title })`. `episode_title` is NOT a second way to set the title: it lands
 * through that SAME canonical `podcastService.updateEpisode` call. The two
 * differ only in who chooses — the panel is a modal one-shot the user opens,
 * ranks, and picks from; the target is for the conversational agent in the
 * header popover, which has already read the script and the run. This is the
 * `mermaid-editor` shape (a surface that already had a bespoke agent path
 * keeps ONE commit path and adds no duplication). Landing it also closed the
 * panel's own staleness bug: both paths now reflect into the run state the
 * hero renders, so the page no longer shows the old title after an apply.
 *
 * `entity` rather than the preferred `draft` because this page has no editor
 * state and no Save bar to stage into — the `mermaid-editor` reasoning that
 * `draft`'s "nothing is saved until you save" would simply be a lie here.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "run_identity",
    label: "Run identity",
    sortOrder: 100,
    description:
      "Which run this is, what it was made from, and its lifecycle standing.",
  },
  {
    key: "run_progress",
    label: "Progress",
    sortOrder: 200,
    description:
      "How far the pipeline has got: stages, percentage, and live-stream health.",
  },
  {
    key: "episode",
    label: "Episode",
    sortOrder: 300,
    description:
      "The produced episode: its metadata, transcript, and public identity.",
  },
  {
    key: "media",
    label: "Media",
    sortOrder: 400,
    description:
      "Durable references to the run's rendered audio, covers, and clips. Refs only — never expiring URLs.",
  },
  {
    key: "diagnostics",
    label: "Diagnostics",
    sortOrder: 500,
    description:
      "Everything needed to answer 'what happened to this run': errors, recovery options, the original request, and live research activity.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Run identity ──────────────────────────────────────────────────────
  {
    name: "studio_run_id",
    label: "Studio run ID",
    description:
      "UUID of the pc_studio_runs row this page is showing. Always present — the route carries it.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 36,
    sortOrder: 300,
    group: "run_identity",
  },
  {
    name: "backend_run_id",
    label: "Backend run ID",
    description:
      "The server-side agent_run id backing this generation — the id used to resume and the key into the per-stage truth. Empty until the durable run detail has loaded (or when the backend never reported one).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 310,
    group: "run_identity",
  },
  {
    name: "run_status",
    label: "Run status",
    description:
      "Render-state of the run as the page sees it: idle | running | done | error. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 8,
    sortOrder: 320,
    group: "run_identity",
  },
  {
    name: "liveness",
    label: "Liveness",
    description:
      "The server's computed liveness for the run: alive | stalled | failed | completed | draft | cancelled — 'stalled' means no heartbeat, not failure. Empty until the durable run detail loads.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 330,
    group: "run_identity",
  },
  {
    name: "podcast_type",
    label: "Podcast type",
    description:
      "The backend style discriminator for this run: educational | news | persian (persian also drives right-to-left rendering). Empty when the run record hasn't loaded.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 340,
    group: "run_identity",
  },
  {
    name: "run_source",
    label: "Run source",
    description:
      "What this episode was generated FROM: { input_data_type, summary (topic text / filename / notes snippet), file_urls }. Empty until the durable run detail loads.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 350,
    group: "run_identity",
  },
  {
    name: "started_at",
    label: "Started at",
    description:
      "ISO timestamp of when this run began, used for the elapsed-time display. Empty when the run record carries no creation time.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 25,
    sortOrder: 360,
    group: "run_identity",
  },

  // ── Progress ──────────────────────────────────────────────────────────
  {
    name: "progress_percent",
    label: "Progress",
    description:
      "Honest completion: done stages / total steps * 100, and 100 on completion. Always present (0 before the first stage reports).",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 400,
    group: "run_progress",
  },
  {
    name: "total_steps",
    label: "Total steps",
    description:
      "Total pipeline steps this run reports (the max 'total' seen on stage events). Always present; 0 before the first stage event.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 410,
    group: "run_progress",
  },
  {
    name: "stages",
    label: "Stages",
    description:
      "Every pipeline stage the run has reported, in order: per stage its key, human label, status (running | done | failed), step, and total. Empty array before the first stage event.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 420,
    group: "run_progress",
  },
  {
    name: "current_stage_label",
    label: "Current stage",
    description:
      "Human label of the most recently started stage (e.g. 'Writing the script'). Empty when nothing is running.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 430,
    group: "run_progress",
  },
  {
    name: "streaming",
    label: "Streaming",
    description:
      "True while this page is attached to the live NDJSON generation stream. False on a durable-record reload of a finished or backgrounded run. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 440,
    group: "run_progress",
  },
  {
    name: "stalled",
    label: "Stalled",
    description:
      "True when the watchdog has seen no stream activity for its window — the connection went quiet. This is NOT failure: stalled runs frequently complete. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 450,
    group: "run_progress",
  },
  {
    name: "background_working",
    label: "Working in background",
    description:
      "True when the run is still progressing server-side while this page is not attached to the stream. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 460,
    group: "run_progress",
  },

  // ── Episode ───────────────────────────────────────────────────────────
  {
    name: "episode_title",
    label: "Episode title",
    description:
      "Generated title of the episode. Empty until the metadata stage lands.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 500,
    group: "episode",
  },
  {
    name: "episode_description",
    label: "Episode description",
    description:
      "Generated description/summary of the episode. Empty until the metadata stage lands.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 510,
    group: "episode",
  },
  {
    name: "script",
    label: "Transcript",
    description:
      "The FULL generated dialogue script of the episode — the source for transcript, blog, and show-notes work. Empty until the script stage completes. Bindable-only: a full episode script runs to tens of thousands of characters.",
    valueType: "document",
    alwaysAvailable: false,
    typicalCharCount: 20000,
    autoContext: false,
    sortOrder: 520,
    group: "episode",
  },
  {
    name: "script_preview",
    label: "Script preview",
    description:
      "The real ~500-character sneak peek of the script emitted when the script stage completes — safe to ship to an agent while the full script is not. Empty before that.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 530,
    group: "episode",
  },
  {
    name: "source_preview",
    label: "Source preview",
    description:
      "Preview of the prepared/researched source content the script was written from. Empty until the prep stage reports.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 540,
    group: "episode",
  },
  {
    name: "episode_chapters",
    label: "Chapter markers",
    description:
      "The episode's persisted chapter markers, in order: per chapter its start_hint (MM:SS or HH:MM:SS timestamp), title, and summary. Read from pc_episodes.metadata.chapters. Empty until the Chapter markers panel has generated and saved a set — which only happens on a finished episode.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 900,
    sortOrder: 545,
    group: "episode",
  },
  {
    name: "episode_id",
    label: "Episode ID",
    description:
      "UUID of the persisted pc_episodes row. Empty until the run finishes persisting — its presence is what makes the post-production toolkit (blog, show notes, cover selection) available.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 550,
    group: "episode",
  },
  {
    name: "episode_slug",
    label: "Episode slug",
    description:
      "Public slug of the persisted episode, used to build its public /podcast/[slug] link. Empty until the episode is persisted.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    sortOrder: 560,
    group: "episode",
  },
  {
    name: "show_id",
    label: "Show ID",
    description:
      "UUID of the show this episode was published into. Empty until the run resolves or creates one.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 570,
    group: "episode",
  },

  // ── Media (durable refs only) ─────────────────────────────────────────
  {
    name: "audio_available",
    label: "Audio ready",
    description:
      "True once the episode's rendered audio exists. A finished run WITHOUT audio is a real failure mode the UI offers to resume — treat false-on-done as broken, not as 'still working'. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 600,
    group: "media",
  },
  {
    name: "audio_file_id",
    label: "Audio file ID",
    description:
      "Durable file id of the rendered episode audio — the ONLY safe long-term reference to it (the playback URL is signed and expires). Empty when audio isn't rendered yet or the backend reported no file id.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 610,
    group: "media",
  },
  {
    name: "cover_file_id",
    label: "Cover file ID",
    description:
      "Durable file id of the selected cover image for this run. Empty until a cover is rendered/selected or when only an expiring URL is known.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 620,
    group: "media",
  },
  {
    name: "image_slots",
    label: "Image slots",
    description:
      "Every image slot of the run: per slot its index, status (pending | running | done | failed), the prompt it was rendered from, the model alias, and its durable file_id when known. No URLs. Empty array before the metadata stage plans them.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1400,
    sortOrder: 630,
    group: "media",
  },
  {
    name: "video_slots",
    label: "Video slots",
    description:
      "Every video-clip slot of the run, same shape as image_slots (index, status, prompt, model alias, durable file_id). No URLs. Empty array when the run rendered no clips.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 640,
    group: "media",
  },
  {
    name: "official_video_available",
    label: "Episode video ready",
    description:
      "True when the composed 'official' episode video (every still + clip stitched into one crossfaded MP4) exists. False on a finished multi-asset run means composition was skipped or failed — check run_error / the run inspector. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 650,
    group: "media",
  },

  // ── Diagnostics ───────────────────────────────────────────────────────
  {
    name: "run_error",
    label: "Run error",
    description:
      "The run-level error message, when one was reported. Empty on a healthy run. Note: individual failed image/video slots are NON-fatal and do not set this.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 700,
    group: "diagnostics",
  },
  {
    name: "recovery",
    label: "Recovery options",
    description:
      "What the user can still do with an interrupted run: { resumable, can_rerun_from_source, can_reconnect }. Empty until the durable run detail loads.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 710,
    group: "diagnostics",
  },
  {
    name: "stage_progress",
    label: "Stage tallies",
    description:
      "Server-side tallies for this run: { done, failed, total } stages. Empty until the durable run detail loads. Distinct from the live stage list, which only reflects what this page has seen.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 720,
    group: "diagnostics",
  },
  {
    name: "run_request",
    label: "Original request",
    description:
      "The exact PodcastGenerateRequest this run was started with — the absolute truth of what was asked for, and the payload a re-run from source replays. Empty until the durable run detail loads. Bindable-only: it duplicates the composer's whole request.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 730,
    group: "diagnostics",
  },
  {
    name: "research_activity",
    label: "Research activity",
    description:
      "The real tool activity the research child agent streamed on this run: search queries, URLs fetched, and scrape tallies. Empty array when the run did no research or sent no tool events. Bindable-only — it can run long on research-heavy runs.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 740,
    group: "diagnostics",
  },
];

/**
 * The write half. All three are `entity` + `ask`: this page persists straight
 * through `podcastService`, so the in-place confirm IS the review step.
 * Every handler additionally REFUSES while the run is still working
 * (streaming / background_working / run_status "running") or before the
 * episode row exists — a run mid-flight is still writing these very columns
 * from the pipeline, and a write that a later stage silently overwrites is
 * worse than a refusal.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "episode_title",
    label: "Episode title",
    description:
      "Replaces the finished episode's title (pc_episodes.title), through the same podcastService.updateEpisode call the Title options panel's 'Use' button makes. Value: { title: string } — one line, non-empty, 200 characters or fewer, no surrounding quotes. The episode SLUG and public URL are intentionally untouched, so the public link keeps working. Blog posts and show notes generated earlier keep the old title until they are regenerated. Refused while the run is still working and before the episode exists.",
    valueType: "object",
    updatesValue: "episode_title",
    mode: "entity",
    applyPolicy: "ask",
    group: "episode",
    sortOrder: 500,
  },
  {
    name: "episode_description",
    label: "Episode description",
    description:
      "Replaces the finished episode's description/summary (pc_episodes.description) — the paragraph shown under the title on this page and on the public episode page. Value: { description: string } — plain prose, non-empty, 2000 characters or fewer, no markdown headings. REPLACES the whole description; to extend the existing one, include it. Refused while the run is still working and before the episode exists.",
    valueType: "object",
    updatesValue: "episode_description",
    mode: "entity",
    applyPolicy: "ask",
    group: "episode",
    sortOrder: 510,
  },
  {
    name: "episode_chapters",
    label: "Chapter markers",
    description:
      "Replaces the episode's FULL ordered chapter list (pc_episodes.metadata.chapters), through the same podcastService.saveEpisodeChapters call the Chapter markers panel's Generate uses. Value: { chapters: [{ start_hint, title, summary }] } — 1 to 24 entries, each title non-empty and 120 characters or fewer, each summary 300 characters or fewer (empty string allowed), start_hint a MM:SS or HH:MM:SS timestamp. This REPLACES the whole list, so include every chapter you want to keep: read the current set from the episode_chapters value first and REUSE its start_hint timestamps verbatim — they are aligned to the rendered audio and you cannot re-derive them. Use this to rewrite chapter titles and summaries; use the panel's Regenerate button to re-segment the episode from scratch. Refused while the run is still working and before the episode exists.",
    valueType: "object",
    updatesValue: "episode_chapters",
    mode: "entity",
    applyPolicy: "ask",
    group: "episode",
    sortOrder: 545,
  },
];

export const podcastRunManifest: SurfaceManifest = {
  surfaceName: "matrx-user/podcast-run",
  readiness: "partial",
  readinessNote:
    "Manifest + emitter (StudioRunView) are wired against the live run state and durable run detail. Not yet DB-synced, not yet in route-to-surface.ts, and the declared agent roles have no default agents bound. Per-slot file_ids come from the durable run detail, so they are absent on a purely-live run until the detail loads.",
  label: "Podcast Run",
  urlPattern: "/podcast/studio/run/[id]",
  intro: `<surface_intro>
You are on a Podcast Run — the durable record of ONE podcast generation, from live production through to the finished episode. The user reaches it the moment they hit Generate and can return to it forever; it rebuilds itself from the saved run.
Read the run in this order: is it still working (run_status, streaming, stalled, background_working, progress_percent, stages), did it produce an episode (episode_id, episode_title, script, audio_available), and if something is wrong, why (run_error, recovery, stage_progress, research_activity, run_request).
Three things that are routinely misread here. stalled means the stream went quiet, NOT that the run failed — stalled runs frequently finish. A failed image or video slot is non-fatal and never fails the run. But a run that reports done with audio_available false IS broken, and the honest answer is to resume or re-run it.
Media is referenced, never linked: audio_file_id, cover_file_id, and per-slot file_ids are the durable handles. This surface deliberately emits no playback URLs, because the run's URLs are signed and expire. Never present a URL you did not receive here, and never persist one.
script is the full transcript and is bindable-only; use script_preview when you just need a taste of the episode.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
  agentRoles: [
    {
      name: "run_diagnostician",
      label: "Run diagnostician",
      description:
        "Explains what happened to a run from its stages, errors, tallies, and original request — and says whether to resume, re-run from source, or start over.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "episode_writer",
      label: "Episode writer",
      description:
        "Writes companion content from the finished episode's transcript: show notes, blog article, chapter summaries, social copy.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
};

/** One media slot as emitted in `image_slots` / `video_slots` — refs only. */
export interface PodcastRunSlotEntry {
  index: number;
  status: string;
  prompt: string | null;
  model_alias: string | null;
  file_id: string | null;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createPodcastRunScope(values: {
  studio_run_id: string;
  run_status: string;
  progress_percent: number;
  total_steps: number;
  streaming: boolean;
  stalled: boolean;
  background_working: boolean;
  audio_available: boolean;
  official_video_available: boolean;
  backend_run_id?: string;
  liveness?: string;
  podcast_type?: string;
  run_source?: Record<string, unknown>;
  started_at?: string;
  stages?: Array<Record<string, unknown>>;
  current_stage_label?: string;
  episode_title?: string;
  episode_description?: string;
  script?: string;
  script_preview?: string;
  source_preview?: string;
  episode_chapters?: Array<Record<string, unknown>>;
  episode_id?: string;
  episode_slug?: string;
  show_id?: string;
  audio_file_id?: string;
  cover_file_id?: string;
  image_slots?: PodcastRunSlotEntry[];
  video_slots?: PodcastRunSlotEntry[];
  run_error?: string;
  recovery?: Record<string, unknown>;
  stage_progress?: Record<string, unknown>;
  run_request?: Record<string, unknown>;
  research_activity?: Array<Record<string, unknown>>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
