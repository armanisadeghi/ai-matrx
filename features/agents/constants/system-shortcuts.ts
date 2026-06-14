import type { JsonExtractionConfig } from "@/features/agents/types/instance.types";

/**
 * System shortcut registry — hard-coded references to shortcuts that the
 * application code depends on.
 *
 * WHY THIS EXISTS
 * ----------------
 * A shortcut lives in the database and owns its agent reference, variable
 * mappings, display mode, and every other knob. Application code normally
 * should NOT know any of that — it should only know the shortcut id.
 *
 * But some features (like the AI Agent Generator) are themselves core
 * product surfaces that ship with a built-in shortcut. For those we need
 * a stable id in source. This registry is that — nothing more.
 *
 * RULES
 * ------
 * - One entry per shortcut the app code references.
 * - `feature` identifies the UI that owns this shortcut. One feature can
 *   own multiple shortcuts (e.g. primary + fallback generators).
 * - `id` is the ONLY thing callers should ever read. Everything else on
 *   the shortcut — agent id, variable mappings, display mode — lives in
 *   the database.
 * - `temporaryConfigs` is a deliberate escape hatch for things that don't
 *   yet live on the shortcut row. It's a REMINDER. Every item in here is
 *   migration debt; the goal is to drain it over time so this object only
 *   ever carries `id`.
 *
 * IF YOU ADD ONE
 * ---------------
 * 1. Create the shortcut in the DB first (via /administration/agent-shortcuts).
 * 2. Copy the id here under the right feature.
 * 3. Add a short description so the next engineer knows what it's for.
 * 4. If you need anything in `temporaryConfigs`, add a TODO linking the
 *    schema work that will move it onto the shortcut record.
 */

export type SystemShortcutFeature =
  | "agent-generator"
  | "agent-builder"
  | "code-editor"
  | "notes"
  | "chat-route"
  | "image-studio";

export interface SystemShortcutEntry {
  /** Short human name — for logs and debug UI only. */
  label: string;
  /** DB uuid. The only value callers should read for triggering. */
  id: string;
  /** Which UI owns this shortcut. */
  feature: SystemShortcutFeature;
  /** One-liner explaining what the shortcut does. */
  description: string;
  /**
   * Config that app code currently has to pass at launch because the
   * shortcut row can't hold it yet. Each key here is a TODO to migrate.
   */
  temporaryConfigs?: {
    /**
     * Opt-in structured-JSON extraction during streaming. Belongs on a
     * future `shortcut.jsonExtraction` column so the trigger site doesn't
     * need to know the agent's output shape.
     */
    jsonExtraction?: JsonExtractionConfig;
  };
}

export const SYSTEM_SHORTCUTS = {
  "agent-generator-01": {
    label: "AI Agent Generator — v1",
    id: "cfde5205-598f-41d5-a627-6774846f5879",
    feature: "agent-generator",
    description:
      "Turns a plain-English description (scope.selection) plus optional additional context (runtime.userInput) into a structured agent config JSON. Renders in direct display mode — the caller UI owns the panel.",
    temporaryConfigs: {
      jsonExtraction: {
        enabled: true,
        fuzzyOnFinalize: true,
        maxResults: 5,
      },
    },
  },
  "improve-system-prompt-01": {
    label: "Improve System Prompt",
    id: "45dc1b29-4869-4105-be4a-df71b64eaa2b",
    feature: "agent-builder",
    description: "Improves the system prompt for an agent.",
  },
  "image-studio-describe-01": {
    label: "Image Studio — Describe v1",
    id: "ed0a90f8-b406-4af8-8f47-c41c0c4ff086",
    feature: "image-studio",
    description:
      "Vision agent that takes an attached image (instance resource, blockType: 'image') and an optional context hint (runtime.userInput) and returns a structured JSON wrapped as { image_metadata: { filename_base, alt_text, caption, title, description, keywords, dominant_colors } }. jsonExtraction now lives on the shortcut row (agx_shortcut.json_extraction); the launch thunk reads it automatically.",
  },
} as const satisfies Record<string, SystemShortcutEntry>;

export type SystemShortcutKey = keyof typeof SYSTEM_SHORTCUTS;

/**
 * Helper — grab a system shortcut entry by its registry key. Throws if the
 * key is unknown (failing loud is better than silently firing the wrong
 * shortcut).
 */
export function getSystemShortcut(key: SystemShortcutKey): SystemShortcutEntry {
  const entry = SYSTEM_SHORTCUTS[key];
  if (!entry) {
    throw new Error(
      `[system-shortcuts] unknown key "${key}" — did you forget to register it?`,
    );
  }
  return entry;
}
