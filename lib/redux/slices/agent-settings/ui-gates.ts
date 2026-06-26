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

export interface UiGates {
  /** Model supports tool / function calling (UI affordance; the authoritative
   *  gate is the model capability, enforced server-side). */
  tools?: boolean;
  /** Chat exposes the image-URL attachment input. */
  image_urls?: boolean;
  /** Chat exposes the file-URL attachment input. */
  file_urls?: boolean;
  /** Chat exposes the YouTube-URL attachment input. */
  youtube_videos?: boolean;
  // Extensible: future model-gated UI affordances are valid keys.
  [key: string]: boolean | undefined;
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
