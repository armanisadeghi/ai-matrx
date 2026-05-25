/**
 * Model Settings Catalogue — the single source of truth for WHICH settings the
 * Model Settings UI renders, and the one chokepoint that guarantees they are
 * ALWAYS rendered.
 *
 * ── The invariant this module exists to protect ──────────────────────────────
 *   Every setting in the catalogue is ALWAYS shown on the Settings tab,
 *   regardless of whether the selected model declares a control for it.
 *   A model's `controls` schema only DECORATES a row (supported vs. caution) —
 *   it must NEVER decide whether the row renders.
 *
 * Historically each settings panel kept its own `textModelSettings` /
 * `booleanSettings` / `imageVideoSettings` arrays AND filtered them by
 * `getControl(key)` before rendering. That filter is what hid most settings
 * when a model declared a sparse `controls` object, and because the arrays +
 * filter were copy-pasted into three components, fixing one never fixed the
 * others. This module replaces all of that: `buildSettingsRows()` returns
 * every catalogue entry (plus any extra valued / model-declared key) and has
 * no way to drop a row. Consumers map over its output — they cannot filter.
 *
 * Guardrail: `settings-catalogue.test.ts` asserts that an empty/sparse control
 * set still yields one row per catalogue entry. If anyone reintroduces
 * filtering here, that test fails.
 */

import type { ControlDefinition } from "./types";

// ── Group identity ─────────────────────────────────────────────────────────────

export type SettingsGroupId =
  | "text"
  | "featureFlags"
  | "inputCapabilities"
  | "imageVideo"
  | "audio"
  | "other";

export interface CatalogueEntry {
  key: string;
  label: string;
}

export interface CatalogueGroup {
  id: SettingsGroupId;
  /** Section header shown above the group. Empty string = no header (lead group). */
  label: string;
  entries: CatalogueEntry[];
}

// ── The catalogue ───────────────────────────────────────────────────────────────
// Labels and ordering are curated. Keys are AgentSettings / LLMParams field
// names (snake_case). Adding a key here makes it appear on every settings panel
// for every model automatically.

const TEXT_GROUP: CatalogueEntry[] = [
  { key: "response_format", label: "Response Format" },
  { key: "stop_sequences", label: "Stop Sequences" },
  { key: "temperature", label: "Temperature" },
  { key: "max_output_tokens", label: "Max Output Tokens" },
  { key: "top_p", label: "Top P" },
  { key: "top_k", label: "Top K" },
  { key: "thinking_budget", label: "Thinking Budget" },
  { key: "thinking_level", label: "Thinking Level" },
  { key: "reasoning_effort", label: "Reasoning Effort" },
  { key: "reasoning_summary", label: "Reasoning Summary" },
  { key: "verbosity", label: "Verbosity" },
  { key: "tool_choice", label: "Tool Choice" },
];

const FEATURE_FLAGS_GROUP: CatalogueEntry[] = [
  { key: "stream", label: "Stream Response" },
  { key: "store", label: "Store Conversation" },
  { key: "parallel_tool_calls", label: "Parallel Tool Calls" },
  { key: "include_thoughts", label: "Include Thoughts" },
  { key: "internal_web_search", label: "Internal Web Search" },
  { key: "internal_url_context", label: "Internal URL Context" },
  { key: "disable_safety_checker", label: "Disable Safety Checker" },
  { key: "clear_thinking", label: "Clear Thinking" },
  { key: "disable_reasoning", label: "Disable Reasoning" },
  { key: "generate_audio", label: "Generate Audio" },
  { key: "enhance_prompt", label: "Enhance Prompt" },
  { key: "include_rai_reason", label: "Include RAI Reason" },
];

// Frontend capability flags — what input types the UI offers. These are
// model-independent by design (stripped before the API call), so they ALWAYS
// belong on the panel. Previously they only appeared via the "Other Settings"
// catch-all when a model happened to declare them.
const INPUT_CAPABILITIES_GROUP: CatalogueEntry[] = [
  { key: "tools", label: "Tools" },
  { key: "file_urls", label: "File URLs" },
  { key: "image_urls", label: "Image URLs" },
  { key: "youtube_videos", label: "YouTube Videos" },
];

const IMAGE_VIDEO_GROUP: CatalogueEntry[] = [
  { key: "size", label: "Size" },
  { key: "quality", label: "Quality" },
  { key: "count", label: "Count" },
  { key: "steps", label: "Steps" },
  { key: "guidance_scale", label: "Guidance Scale" },
  { key: "seed", label: "Seed" },
  { key: "width", label: "Width" },
  { key: "height", label: "Height" },
  { key: "fps", label: "FPS" },
  { key: "seconds", label: "Duration (s) [legacy string]" },
  { key: "output_quality", label: "Output Quality" },
  { key: "negative_prompt", label: "Negative Prompt" },
  { key: "aspect_ratio", label: "Aspect Ratio" },
  { key: "ratio", label: "Aspect Ratio (Together/Runway)" },
  { key: "resolution", label: "Resolution" },
  { key: "image_size", label: "Image Size" },
  { key: "num_outputs", label: "Outputs" },
  { key: "number_of_images", label: "Number of Images" },
  { key: "render_quality", label: "Render Quality" },
  { key: "background", label: "Background" },
  { key: "input_fidelity", label: "Input Fidelity" },
  { key: "output_compression", label: "Output Compression" },
  { key: "moderation", label: "Moderation" },
  { key: "partial_images", label: "Partial Images" },
  { key: "output_mime_type", label: "Output MIME Type" },
  { key: "person_generation", label: "Person Generation" },
  { key: "image_format", label: "Image Format" },
  { key: "style", label: "Style" },
  { key: "reference_strength", label: "Reference Strength" },
  { key: "duration_seconds", label: "Duration (s)" },
  { key: "duration", label: "Duration" },
  { key: "encode_quality", label: "Encode Quality" },
  { key: "video_action", label: "Video Action" },
  { key: "reference_images", label: "Reference Images" },
  { key: "frame_images", label: "Frame Images" },
  { key: "image_loras", label: "Image LoRAs" },
];

// Voice (tts_voice) is rendered by a dedicated editor in AgentSettingsCore, but
// it still lives in the catalogue so it is always present and counted. Consumers
// that lack the custom editor render it as a normal row.
const AUDIO_GROUP: CatalogueEntry[] = [
  { key: "tts_voice", label: "Voice" },
  { key: "audio_format", label: "Audio Format" },
];

export const SETTINGS_CATALOGUE: CatalogueGroup[] = [
  { id: "text", label: "", entries: TEXT_GROUP },
  { id: "featureFlags", label: "Feature Flags", entries: FEATURE_FLAGS_GROUP },
  {
    id: "inputCapabilities",
    label: "Input Capabilities",
    entries: INPUT_CAPABILITIES_GROUP,
  },
  { id: "imageVideo", label: "Image / Video Settings", entries: IMAGE_VIDEO_GROUP },
  { id: "audio", label: "Audio Settings", entries: AUDIO_GROUP },
];

/** Flat set of every key the catalogue declares. */
export const CATALOGUE_KEYS: ReadonlySet<string> = new Set(
  SETTINGS_CATALOGUE.flatMap((g) => g.entries.map((e) => e.key)),
);

// Keys that should never become their own catch-all row: bookkeeping fields,
// identity, and keys edited through a coupled control elsewhere.
const CATCHALL_EXCLUDED = new Set<string>([
  "rawControls",
  "unmappedControls",
  "model_id",
  "multi_speaker", // edited via the Voice editor alongside tts_voice
]);

// ── Row building ────────────────────────────────────────────────────────────────

export interface SettingsRow {
  key: string;
  label: string;
  group: SettingsGroupId;
  /** The model's control definition for this key, or null when the model
   *  declares none. NEVER used to decide whether the row renders. */
  control: ControlDefinition | null;
  /** True when the selected model declares a control for this key. */
  supported: boolean;
  /** True when the current settings hold a non-null value for this key. */
  hasValue: boolean;
}

export interface RenderGroup {
  id: SettingsGroupId;
  label: string;
  rows: SettingsRow[];
}

/** A minimal structural view of a model's normalized controls. Accepts either
 *  NormalizedControls variant in the codebase (both are a key→ControlDefinition
 *  map plus rawControls/unmappedControls). */
type ControlsLike = Record<string, unknown> | null | undefined;

function lookupControl(
  controls: ControlsLike,
  key: string,
): ControlDefinition | null {
  if (!controls) return null;
  if (CATCHALL_EXCLUDED.has(key)) {
    // rawControls/unmappedControls live here too; never treat them as a control.
    if (key === "rawControls" || key === "unmappedControls") return null;
  }
  const candidate = (controls as Record<string, unknown>)[key];
  if (
    candidate &&
    typeof candidate === "object" &&
    !Array.isArray(candidate) &&
    "type" in (candidate as Record<string, unknown>)
  ) {
    return candidate as unknown as ControlDefinition;
  }
  return null;
}

function hasMeaningfulValue(
  settings: Record<string, unknown> | null | undefined,
  key: string,
): boolean {
  if (!settings) return false;
  const v = settings[key];
  return v !== undefined && v !== null;
}

/** Convert a snake_case / kebab key to a Title Case label for catch-all rows. */
export function humanizeSettingKey(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Build the full, ordered list of render groups for the Settings tab.
 *
 * GUARANTEE: every catalogue entry is present in the output exactly once,
 * regardless of `controls`. `controls` only sets each row's `supported` flag
 * and attaches its `control`. There is no code path that omits a catalogue row.
 *
 * Additionally surfaces an "Other" group for any key that has a value or is
 * declared by the model but is not already in the catalogue — so a value can
 * never be hidden, and brand-new model controls appear without a code change.
 */
export function buildSettingsRows(
  controls: ControlsLike,
  settings: Record<string, unknown> | null | undefined,
): RenderGroup[] {
  const groups: RenderGroup[] = SETTINGS_CATALOGUE.map((group) => ({
    id: group.id,
    label: group.label,
    rows: group.entries.map((entry) => {
      const control = lookupControl(controls, entry.key);
      return {
        key: entry.key,
        label: entry.label,
        group: group.id,
        control,
        supported: control !== null,
        hasValue: hasMeaningfulValue(settings, entry.key),
      };
    }),
  }));

  // ── Catch-all: keys with a value or a model control that the catalogue
  //    doesn't already cover. Guarantees no valued setting is ever hidden. ──
  const extraKeys = new Set<string>();

  if (settings) {
    for (const key of Object.keys(settings)) {
      if (CATALOGUE_KEYS.has(key) || CATCHALL_EXCLUDED.has(key)) continue;
      if (hasMeaningfulValue(settings, key)) extraKeys.add(key);
    }
  }
  if (controls) {
    for (const key of Object.keys(controls as Record<string, unknown>)) {
      if (CATALOGUE_KEYS.has(key) || CATCHALL_EXCLUDED.has(key)) continue;
      if (lookupControl(controls, key)) extraKeys.add(key);
    }
  }

  if (extraKeys.size > 0) {
    const rows: SettingsRow[] = [...extraKeys].sort().map((key) => {
      const control = lookupControl(controls, key);
      return {
        key,
        label: humanizeSettingKey(key),
        group: "other" as const,
        control,
        supported: control !== null,
        hasValue: hasMeaningfulValue(settings, key),
      };
    });
    groups.push({ id: "other", label: "Other Settings", rows });
  }

  return groups;
}
