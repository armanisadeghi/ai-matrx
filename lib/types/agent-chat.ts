/**
 * agent-chat.ts — Canonical type shim for the chat ↔ agent system boundary.
 *
 * As cx-chat migrates from the prompts-based system to the new agents system,
 * this file provides re-exports under both old names (for existing consumers that
 * haven't been updated yet) and new canonical names (for new code).
 *
 * Migration plan:
 *   Phase 1 (now): This shim unblocks all cx-chat files from compiling
 *                  without touching 20+ import sites.
 *   Phase 5:       One-shot sweep replaces all imports with the canonical
 *                  paths directly, then this file is deleted.
 *
 * Rule: New code should import from the canonical sources directly.
 *       Existing cx-chat code may continue to import from here until Phase 5.
 */

// ── Variable definitions ────────────────────────────────────────────────────

// Canonical: features/agents/redux/agent-definition/types.ts
export type {
  VariableDefinition,
  VariableCustomComponent,
  VariableComponentType,
} from "@/features/agents/types/agent-definition.types";

// Legacy alias — existing cx-chat code uses PromptVariable everywhere.
// VariableDefinition is a superset: defaultValue is `unknown` vs `string`.
// All existing string-defaultValue usage is safe.
export type { VariableDefinition as PromptVariable } from "@/features/agents/types/agent-definition.types";

// ── Model / LLM settings ────────────────────────────────────────────────────

// Canonical: lib/api/types.ts → LLMParams (auto-generated from Python)
export type { LLMParams } from "@/lib/api/types";

// Legacy alias — existing cx-chat code uses PromptSettings.
// PromptSettings is a subset of LLMParams plus a few deprecated frontend-only
// fields (image_urls, file_urls, etc.). Using LLMParams directly is correct
// for all API-bound usage; the deprecated fields can be dropped.
export type { LLMParams as PromptSettings } from "@/lib/api/types";

// ── Resources ───────────────────────────────────────────────────────────────

// Canonical resource shape — now lives in features/agents/resources/types.ts.
// Re-exporting here keeps the import path consistent for existing consumers.
export type { Resource } from "@/features/agents/resources/types";

// ── Agent identity ──────────────────────────────────────────────────────────

// AgentDefinitionRecord from the new agents system — for components that need
// the full definition record (sidebar, picker).
export type {
  AgentDefinition,
  AgentDefinitionRecord,
  AgentType,
} from "@/features/agents/types/agent-definition.types";
