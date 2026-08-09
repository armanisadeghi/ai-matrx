/**
 * Surface manifest — Podcast Studio composer (`matrx-user/podcast-studio`).
 *
 * Drives `/podcast/studio/create` — the canonical compose surface
 * (`features/podcasts/studio/components/CreateView.tsx` →
 * `generator/components/GeneratorForm.tsx`). It collects ONE thing: the
 * `PodcastGenerateRequest`. Nothing has been produced yet on this surface; the
 * moment the user hits Generate a `pc_studio_runs` row is created and the route
 * hands off to `matrx-user/podcast-run`, which owns everything about the
 * produced episode.
 *
 * Deliberately NOT merged with `matrx-user/podcast-run`: different components,
 * disjoint value sets (a draft request vs a live production record), and
 * different agents — a source/topic/cast advisor belongs here, a run
 * diagnostician and show-notes writer belong there.
 *
 * MEDIA DOCTRINE: no media URLs are emitted. Uploaded/resolved sources are
 * emitted as TEXT (already-extracted) or as the user-entered public source URLs
 * they typed; never a signed S3 URL or a `storage_uri`. See
 * `features/surfaces/manifests/files.manifest.ts` `durablePublicUrl`.
 *
 * The `create-a…f` / `create-dense` / `create-sharp` / `create-refine` /
 * `create-reimagine` route variants are UI-bakeoff weight and are NOT part of
 * this surface's contract — `/podcast/studio/create` is the canonical route.
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
    key: "source_material",
    label: "Source material",
    sortOrder: 100,
    description:
      "What the episode will be made FROM — the chosen source kind and the text/URLs behind it.",
  },
  {
    key: "show_shape",
    label: "Show shape",
    sortOrder: 200,
    description:
      "How the episode should sound: language, conversational format, framing theme, and how many hosts.",
  },
  {
    key: "cast",
    label: "Cast",
    sortOrder: 300,
    description:
      "The per-host names, genders, and voices — layered by the user on top of the server's cast preview.",
  },
  {
    key: "destination",
    label: "Destination",
    sortOrder: 400,
    description: "Which show the finished episode is published into.",
  },
  {
    key: "production_settings",
    label: "Production settings",
    sortOrder: 500,
    description:
      "Advanced generation controls: extra instructions, media caps, feature-image style, dictionary, and test truncation.",
  },
  {
    key: "request",
    label: "Request",
    sortOrder: 600,
    description:
      "The composite request the Studio would submit, and whether it is submittable yet.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Source material ───────────────────────────────────────────────────
  {
    name: "source_kind",
    label: "Source kind",
    description:
      "Which source tile is selected: topic | partial_content | full_content | file_url | website_url | note | youtube | audio_file. Always present — the form defaults to 'topic'.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 15,
    sortOrder: 300,
    group: "source_material",
  },
  {
    name: "source_text",
    label: "Source text",
    description:
      "The text the user typed into the source box — a topic line for 'topic', or pasted partial/full content. Empty when the selected source resolves external content instead (website/note/YouTube/audio) or nothing has been typed. Bindable-only: full-content pastes can be very large.",
    valueType: "document",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    autoContext: false,
    sortOrder: 310,
    group: "source_material",
  },
  {
    name: "source_topic",
    label: "Source topic",
    description:
      "The short topic line, populated only when source_kind is 'topic' (this is the same text as source_text, exposed small enough to always ship to an agent). Empty for every other source kind.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 120,
    sortOrder: 315,
    group: "source_material",
  },
  {
    name: "source_urls",
    label: "Source URLs",
    description:
      "The publicly-accessible file URLs the user entered for the 'file_url' source, blanks removed. Empty array for every other source kind. These are user-entered public links, never signed storage URLs.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 320,
    group: "source_material",
  },
  {
    name: "resolved_source_text",
    label: "Resolved source text",
    description:
      "The editable text extracted from an external source (website scrape, note body, YouTube transcript, or audio transcription) that will be sent as input_data. Empty until a resolve-kind source finishes resolving. Bindable-only: full article/transcript sized.",
    valueType: "document",
    alwaysAvailable: false,
    typicalCharCount: 12000,
    autoContext: false,
    sortOrder: 330,
    group: "source_material",
  },
  {
    name: "source_resolving",
    label: "Source resolving",
    description:
      "True while an external source is being fetched/cleaned into resolved_source_text — Generate is blocked during this. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 340,
    group: "source_material",
  },

  // ── Show shape ────────────────────────────────────────────────────────
  {
    name: "language",
    label: "Language",
    description:
      "BCP-47 locale for the episode (e.g. en-US, fa-IR). Always present — the form defaults to English.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 6,
    sortOrder: 350,
    group: "show_shape",
  },
  {
    name: "format",
    label: "Format",
    description:
      "Conversational format handed to the script agent: educational | news | entertainment | interview | debate | panel | storytelling. Always present — defaults to educational (or the ?format= entryway param).",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 12,
    sortOrder: 360,
    group: "show_shape",
  },
  {
    name: "theme",
    label: "Theme",
    description:
      "Optional freeform framing for the script agent, e.g. 'debate: pro vs con'. Empty when the user hasn't set one.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 370,
    group: "show_shape",
  },
  {
    name: "host_count",
    label: "Host count",
    description:
      "How many speakers the episode will have (1-20). Drives BOTH script-agent routing (solo / two-host / multihost / roundtable) and the TTS provider band (<=2 Gemini, 3-20 ElevenLabs). Always present.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 2,
    sortOrder: 380,
    group: "show_shape",
  },

  // ── Cast ──────────────────────────────────────────────────────────────
  {
    name: "speaker_cast",
    label: "Speaker cast",
    description:
      "The complete cast that would be submitted, in turn order: per host a name, gender, and provider voice — the server's cast preview with the user's edits layered on. Empty when the cast preview hasn't loaded (generation then applies the server's own defaults).",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 390,
    group: "cast",
  },
  {
    name: "cast_provider",
    label: "Cast provider",
    description:
      "The TTS provider the SERVER resolved for this host count (from GET /podcast/cast-preview), e.g. gemini or elevenlabs. Empty when the preview failed to load — the frontend never infers it.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 400,
    group: "cast",
  },
  {
    name: "voice_catalog_size",
    label: "Voice catalog size",
    description:
      "How many voices the live voice catalog offers for the current provider band. Zero/empty while the catalog is loading or failed to load.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 410,
    group: "cast",
  },

  // ── Destination ───────────────────────────────────────────────────────
  {
    name: "show_id",
    label: "Target show",
    description:
      "UUID of the show the finished episode will be published into. Empty when the user hasn't picked one — the backend then creates or resolves a show itself.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 420,
    group: "destination",
  },
  {
    name: "available_shows",
    label: "Available shows",
    description:
      "The shows offered in the destination picker: per show its id, slug, and title. Empty array when the user has none yet.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 430,
    group: "destination",
  },
  {
    name: "first_show_info",
    label: "First-episode show info",
    description:
      "Freeform description the user supplies when this episode creates a brand-new show — used to write the show's identity. Empty when publishing into an existing show.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 440,
    group: "destination",
  },

  // ── Production settings ───────────────────────────────────────────────
  {
    name: "prep_instructions",
    label: "Extra instructions",
    description:
      "The user's freeform instructions to the prep/script agents (also carries the entryway's selected agent-profile note). Empty when none were given.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 450,
    group: "production_settings",
  },
  {
    name: "image_mode",
    label: "Image cap",
    description:
      "Per-run image cap chosen by the user: all (server default count) | one | skip. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 460,
    group: "production_settings",
  },
  {
    name: "video_mode",
    label: "Video cap",
    description:
      "Per-run video cap chosen by the user: all (server default count) | one | skip. Always present.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 470,
    group: "production_settings",
  },
  {
    name: "feature_image_style",
    label: "Feature image style",
    description:
      "Wire token for the transcript-derived feature image's visual style (e.g. infographic, auto). Always present — defaults to the server's default token, which is only sent when the user changes it.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 14,
    sortOrder: 480,
    group: "production_settings",
  },
  {
    name: "truncate_audio_for_testing",
    label: "Truncate audio (test mode)",
    description:
      "True when the script is trimmed to ~1 line per speaker before TTS — the cheap test render, not a real episode. Always present; the form defaults it ON.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 490,
    group: "production_settings",
  },
  {
    name: "dictionary_entry_count",
    label: "Dictionary entries",
    description:
      "How many Custom Dictionary entries (persistent rollup + per-run custom additions) will ride along so the script and TTS agents spell and pronounce terms correctly. Zero when the dictionary is empty for this surface.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 500,
    group: "production_settings",
  },

  // ── Request ───────────────────────────────────────────────────────────
  {
    name: "generate_request",
    label: "Generation request",
    description:
      "The composite PodcastGenerateRequest the Studio would POST right now (source, podcast_type, language/format/theme, host_count, cast, caps, instructions). Empty while the form is not submittable. Bindable-only — it duplicates the individual values above.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 510,
    group: "request",
  },
  {
    name: "can_generate",
    label: "Ready to generate",
    description:
      "True when the form is submittable — a source is filled in, nothing is resolving, and no run is being created. Always present.",
    valueType: "boolean",
    alwaysAvailable: true,
    typicalCharCount: 5,
    sortOrder: 520,
    group: "request",
  },
];

/**
 * Write half of the 360 loop — what an agent may WRITE into the compose form.
 *
 * Every target is `mode: "draft"`: it stages into `GeneratorForm`'s local form
 * state through the SAME setter the user's own typing/clicking uses, so the
 * change is visible in the control, editable, and thrown away if the user
 * navigates off. NOTHING here submits — Generate spends real money (script
 * agents, TTS, image/video providers) and stays a human decision, so there is
 * deliberately no entity-mode target on this surface and no way for an agent
 * to start a run.
 *
 * All targets are `applyPolicy: "ask"` — the user confirms each one in place.
 * These two clusters are exactly the surface's declared agent roles:
 * `source_advisor` owns podcast_source_text + podcast_theme, `cast_advisor`
 * owns podcast_format + podcast_speaker_cast.
 *
 * Handlers are registered by `features/podcasts/generator/components/GeneratorForm.tsx`
 * on its SurfaceRuntimeProvider.
 *
 * Deliberately NOT writable: host_count (it re-routes the script agent AND the
 * TTS provider band, and re-fetches the server cast preview — a structural
 * choice, not a draft), per-host `voice` (the SERVER owns voice resolution;
 * agents declare name + gender only, matching the pipeline's own
 * `<speaker_settings>` contract), show_id / first_show_info (destination and
 * identity), and every production cap / test-mode toggle (cost controls).
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "podcast_source_text",
    label: "Source text",
    description:
      "Replaces the ENTIRE text in the source box — the topic line for the 'topic' source, or the pasted notes/script for 'rough notes' and 'full script'. This is a full replacement, not an append: read source_text (or source_topic) first and include anything you want to keep. Only valid while a typed-text source is selected; it is refused for the file-URL, website, note, YouTube, and audio sources, which carry their own resolved text. Staged into the form for the user to review — nothing generates until they press Generate.",
    valueType: "string",
    updatesValue: "source_text",
    mode: "draft",
    applyPolicy: "ask",
    group: "source_material",
    sortOrder: 100,
  },
  {
    name: "podcast_theme",
    label: "Theme",
    description:
      "Sets the optional freeform framing handed to the script agent, e.g. 'skeptic vs optimist' or 'keep it beginner-friendly'. A short phrase, not a paragraph. Replaces any existing theme; pass an empty string to clear it. Staged into the form for the user to review.",
    valueType: "string",
    updatesValue: "theme",
    mode: "draft",
    applyPolicy: "ask",
    group: "show_shape",
    sortOrder: 200,
  },
  {
    name: "podcast_format",
    label: "Format",
    description:
      "Sets the conversational format the script agent is routed to. Exactly one of: educational | news | entertainment | interview | debate | panel | storytelling. Any other value is refused. Staged into the form for the user to review.",
    valueType: "string",
    updatesValue: "format",
    mode: "draft",
    applyPolicy: "ask",
    group: "show_shape",
    sortOrder: 210,
  },
  {
    name: "podcast_speaker_cast",
    label: "Speaker cast",
    description:
      "Sets the per-host NAMES and GENDERS, in turn order. Value: an array of objects [{name, gender}], one per host, whose length must exactly equal host_count — read host_count and speaker_cast first. `name` is a non-empty display name; `gender` is one of male | female | neutral and drives the server's gender-matched voice pick. You cannot set voices — the server owns voice resolution, and each host's existing voice choice is preserved. This replaces the full cast, so include every host you want kept. Staged into the form for the user to review.",
    valueType: "array",
    updatesValue: "speaker_cast",
    mode: "draft",
    applyPolicy: "ask",
    group: "cast",
    sortOrder: 300,
  },
];

export const podcastStudioManifest: SurfaceManifest = {
  surfaceName: "matrx-user/podcast-studio",
  readiness: "partial",
  readinessNote:
    "Manifest + emitter (GeneratorForm) are wired against every piece of state the compose form holds. Not yet DB-synced, not yet in route-to-surface.ts, and the declared agent roles have no default agents bound.",
  label: "Podcast Studio",
  urlPattern: "/podcast/studio/create",
  intro: `<surface_intro>
You are on the Podcast Studio composer. NOTHING has been generated here yet — every value on this surface is a DRAFT REQUEST the user is assembling, not a produced episode. The produced episode lives on the separate Podcast Run surface once the user hits Generate.
Read the surface in four parts: what the episode is made FROM (source_kind plus source_text / source_urls / resolved_source_text), how it should sound (language, format, theme, host_count), WHO speaks it (speaker_cast, cast_provider), and where it lands (show_id, available_shows).
Two server-owned facts you must not re-derive: cast_provider and the default cast come from the server's cast preview, and feature_image_style's default is the server's. Propose edits on top of them; never invent provider routing or voice defaults.
host_count is load-bearing — it selects both the script agent and the TTS provider. Changing it changes the whole production path.
truncate_audio_for_testing = true means this run is a cheap ~1-line-per-speaker test render, not a real episode; say so rather than describing the result as a finished show.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  agentRoles: [
    {
      name: "source_advisor",
      label: "Source advisor",
      description:
        "Sharpens the topic or source material into a brief worth producing — proposes the topic line, angle, and framing theme from what the user has entered.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 100,
    },
    {
      name: "cast_advisor",
      label: "Cast advisor",
      description:
        "Recommends host count, format, and per-host names/genders for the episode, working within the server-resolved provider band.",
      kind: "single",
      defaultAgentId: null,
      sortOrder: 110,
    },
  ],
  writeTargets,
};

/** One cast entry as emitted in `speaker_cast`. */
export interface PodcastStudioSpeakerEntry {
  name: string;
  voice: string;
  gender?: string;
}

/** One show entry as emitted in `available_shows`. */
export interface PodcastStudioShowEntry {
  id: string;
  slug: string;
  title: string;
}

/**
 * Type-safe payload helper — the "a UI cannot lie" enforcement.
 * Required keys ↔ every `alwaysAvailable: true` value above.
 */
export function createPodcastStudioScope(values: {
  source_kind: string;
  source_resolving: boolean;
  language: string;
  format: string;
  host_count: number;
  image_mode: string;
  video_mode: string;
  feature_image_style: string;
  truncate_audio_for_testing: boolean;
  can_generate: boolean;
  source_text?: string;
  source_topic?: string;
  source_urls?: string[];
  resolved_source_text?: string;
  theme?: string;
  speaker_cast?: PodcastStudioSpeakerEntry[];
  cast_provider?: string;
  voice_catalog_size?: number;
  show_id?: string;
  available_shows?: PodcastStudioShowEntry[];
  first_show_info?: string;
  prep_instructions?: string;
  dictionary_entry_count?: number;
  generate_request?: Record<string, unknown>;
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
