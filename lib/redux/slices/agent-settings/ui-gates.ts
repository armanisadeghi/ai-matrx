/**
 * UI Gates — canonical model-gated UI flags.
 *
 * FE-ONLY. These flags NEVER reach the server. They gate what the chat / agent
 * builder UI exposes for the currently-selected model (e.g. whether to offer the
 * image-URL, file-URL or YouTube attachment inputs) — which in turn shapes the
 * request the client constructs. The flags themselves are not model parameters,
 * so the backend neither receives nor cares about them.
 *
 * Persisted in the dedicated `agx_agent.ui_gates` / `agx_version.ui_gates` jsonb
 * column — NEVER inside `settings` (which holds only server-consumed params).
 *
 * This module is the SINGLE SOURCE OF TRUTH that replaced the `UI_CAPABILITY_KEYS`
 * sets formerly copy-pasted across the execution selectors, the manual-execute
 * thunk, the validation rules/resolve-config, and the model-controls parser.
 * The concept is intentionally generic and open to growth: any future
 * "show X in the UI when the model supports it" affordance lands here.
 */

import { z } from "zod";

/**
 * UI-only agent/run configuration. This schema is the source of truth for the
 * persisted `ui_gates` JSONB boundary; never mirror it with an interface.
 * New product UI capabilities are added here, never to the Python parameter
 * contract. Unknown persisted keys are stripped at this boundary.
 */
export const uiGatesSchema = z
  .object({
    tools: z.boolean().optional(),
    image_urls: z.boolean().optional(),
    file_urls: z.boolean().optional(),
    youtube_videos: z.boolean().optional(),
  });

export type UiGates = z.infer<typeof uiGatesSchema>;

/** Parse persisted/UI-boundary data. Invalid shapes fail loudly. */
export function parseUiGates(value: unknown): UiGates {
  return uiGatesSchema.parse(value ?? {});
}

/** Every gate key the UI currently understands. Extend here, nowhere else. */
export const UI_GATE_KEYS = [
  "tools",
  "image_urls",
  "file_urls",
  "youtube_videos",
] as const;

export type UiGateKey = (typeof UI_GATE_KEYS)[number];

/**
 * The gates a USER toggles per-agent (the chat-attachment affordances).
 *
 * `tools` is intentionally **excluded**: tool support is a MODEL capability
 * (resolved from `ai_model.controls.tools` via `supportsTools` in
 * `useModelControls`), not a per-agent UI gate. `tools` remains in
 * `UI_GATE_KEYS` so any legacy `ui_gates.tools` value is still recognized and
 * stripped before the API call — it is just never offered as an editable toggle.
 */
export const UI_GATE_EDITABLE_KEYS = [
  "image_urls",
  "file_urls",
  "youtube_videos",
] as const satisfies readonly UiGateKey[];

export type UiGateEditableKey = (typeof UI_GATE_EDITABLE_KEYS)[number];

const UI_GATE_KEY_SET: ReadonlySet<string> = new Set(UI_GATE_KEYS);

/** True when `key` is a model-gated UI flag (belongs in ui_gates, not settings). */
export function isUiGateKey(key: string): boolean {
  return UI_GATE_KEY_SET.has(key);
}

/** The empty default — a record with no gates set. */
export const EMPTY_UI_GATES: UiGates = {};

/** Read a single gate as a strict boolean (absent ⇒ false). */
export function gateEnabled(gates: UiGates | null | undefined, key: UiGateKey): boolean {
  return gates?.[key] === true;
}
