/**
 * Model Settings Catalogue — the single source of truth for the STANDARD
 * settings list, and the one chokepoint that decides which keys it contains.
 *
 * ── The model (two distinct surfaces) ────────────────────────────────────────
 *   1. STANDARD list  — ONLY the keys the selected model explicitly declares in
 *      its `controls` config (i.e. the parameters this model actually supports).
 *      `buildSettingsRows()` returns exactly these, grouped + ordered. Catalogue
 *      keys the model does not declare are NOT shown here.
 *   2. CAUTION surface — settings the agent has SET that the model does NOT
 *      support. These are never hidden: they are flagged as "not valid for this
 *      model" and made repairable by the validation layer (the IssueTable, fed
 *      by the `unsupported_by_model` rule). They do NOT belong in the standard
 *      list — that is exactly the "showing all possible keys" bug.
 *
 * The catalogue exists so the standard list's labels, grouping and order live
 * in ONE place (previously copy-pasted as `textModelSettings` /
 * `booleanSettings` / ... into three components, each filtering by
 * `getControl(key)` inline — which drifted and regressed). Components map over
 * `buildSettingsRows()`; they must not filter by model themselves (ESLint
 * enforces). The original recurring bug — set values silently dropped when a
 * model didn't support them — is fixed by the CAUTION surface, not by dumping
 * every key into the standard list.
 *
 * Guardrail: `settings-catalogue.test.ts` asserts the standard list contains
 * ONLY supported keys (never the full catalogue), and `unsupported-by-model.
 * test.ts` asserts set-but-unsupported keys surface in the caution layer.
 */

import type { ControlDefinition, ControlType } from "./types";
import { UI_GATE_KEYS } from "./ui-gates";

const CONTROL_TYPES = [
  "number",
  "integer",
  "boolean",
  "string",
  "enum",
  "array",
  "string_array",
  "object_array",
] as const satisfies readonly ControlType[];

/** Type predicate so `type` narrows into a real `ControlDefinition`, not just a runtime check. */
function isControlDefinitionShape(
  value: Record<string, unknown>,
): value is Record<string, unknown> & { type: ControlType } {
  return typeof value.type === "string" && (CONTROL_TYPES as readonly string[]).includes(value.type);
}

// ── Group identity ─────────────────────────────────────────────────────────────

export type SettingsGroupId =
  | "text"
  | "featureFlags"
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

// NOTE: The model-gated input-capability flags (tools, file_urls, image_urls,
// youtube_videos) are NO LONGER settings rows — they moved to the dedicated
// FE-only `agent.uiGates` column and are edited via the UiGatesEditor
// (Input capabilities section) in AgentSettingsCore. They never appear in the
// settings catalogue or the AgentSettings type.

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
  "model", // chosen via the dedicated model picker, never a generic settings row
  "multi_speaker", // edited via the Voice editor alongside tts_voice
  // Model-gated UI flags live in the ui_gates column + UiGatesEditor, never as
  // settings rows — even when the model declares them as controls (e.g. every
  // model now declares `tools` for the tool-support capability).
  ...UI_GATE_KEYS,
]);

// ── Row building ────────────────────────────────────────────────────────────────

export interface SettingsRow {
  key: string;
  label: string;
  group: SettingsGroupId;
  /** The model's control definition for this key. Standard rows are always
   *  supported, so this is present; typed nullable for consumer convenience. */
  control: ControlDefinition | null;
  /** Always true for rows returned by buildSettingsRows (standard = supported). */
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
  const candidate = controls[key];
  if (
    candidate &&
    typeof candidate === "object" &&
    !Array.isArray(candidate)
  ) {
    const c = candidate as Record<string, unknown>;
    if (isControlDefinitionShape(c)) {
      return c as ControlDefinition;
    }
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
 * Build the STANDARD settings list for the selected model.
 *
 * CONTRACT: returns ONLY keys the model declares a control for (supported).
 * Catalogue keys the model does not declare are omitted — they are not "shown"
 * in the standard list. Set-but-unsupported keys are NOT returned here either;
 * the caution layer (validation IssueTable) surfaces and repairs those.
 *
 * The catch-all "Other" group carries supported keys the model declares that
 * the catalogue doesn't name yet — so a brand-new model control still appears
 * without a code change. Empty groups are returned (consumers skip them).
 */
export function buildSettingsRows(
  controls: ControlsLike,
  settings: Record<string, unknown> | null | undefined,
): RenderGroup[] {
  const groups: RenderGroup[] = SETTINGS_CATALOGUE.map((group) => ({
    id: group.id,
    label: group.label,
    rows: group.entries.flatMap((entry) => {
      const control = lookupControl(controls, entry.key);
      // Standard list = supported keys only. Unsupported keys never enter it;
      // if the agent has set one, the caution/validation layer surfaces it.
      if (!control) return [];
      return [
        {
          key: entry.key,
          label: entry.label,
          group: group.id,
          control,
          supported: true,
          hasValue: hasMeaningfulValue(settings, entry.key),
        },
      ];
    }),
  }));

  // ── Catch-all: keys the model DECLARES (supported) that the catalogue
  //    doesn't name. Unsupported keys never appear here. ──
  const declaredExtra: string[] = [];
  if (controls) {
    for (const key of Object.keys(controls as Record<string, unknown>)) {
      if (CATALOGUE_KEYS.has(key) || CATCHALL_EXCLUDED.has(key)) continue;
      if (lookupControl(controls, key)) declaredExtra.push(key);
    }
  }

  if (declaredExtra.length > 0) {
    const rows: SettingsRow[] = declaredExtra.sort().map((key) => ({
      key,
      label: humanizeSettingKey(key),
      group: "other" as const,
      control: lookupControl(controls, key),
      supported: true,
      hasValue: hasMeaningfulValue(settings, key),
    }));
    groups.push({ id: "other", label: "Other Settings", rows });
  }

  return groups;
}
