/**
 * The Tool UI Component Generator's CONNECTION — nothing more.
 *
 * 🚨 THE GENERATOR'S SYSTEM PROMPT IS NOT IN THIS REPO. Until 2026-08-16 this
 * file exported a ~20k-character `COMPONENT_GENERATOR_SYSTEM_PROMPT` alongside
 * a raw agent UUID. The constant had NO consumer — every run went to the agent
 * row, whose own prompt was 43,886 characters and materially different — so the
 * file simultaneously claimed to define the agent and had no effect on it. That
 * is the worst version of this failure: a definition in code that reads as
 * authoritative and silently is not.
 *
 * The prompt lives on the agent the `tool_viz.component_generator` mandate
 * resolves to. Editing it (the runtime contract below, the allowed imports, the
 * output shape) is a builder-level operation against that agent — never a code
 * change here.
 *
 * The contract the generated components must satisfy — v2, consuming
 * `ToolLifecycleEntry` directly; the legacy `ToolCallObject[]` / `toolUpdates`
 * shape is dead — is enforced at runtime by the compiler in
 * `features/tool-call-visualization/` and described to the model by the agent's
 * own instructions. If you change that runtime contract, update the AGENT.
 */

/**
 * The mandate that decides which agent generates tool-result renderers.
 * Declared in aidream `services/mandates/client_mandates.py`; resolved inside
 * `useToolComponentAgent` via `launchMandate`. Never put an agent UUID here.
 */
export const TOOL_UI_COMPONENT_GENERATOR_MANDATE_KEY =
  "tool_viz.component_generator";
