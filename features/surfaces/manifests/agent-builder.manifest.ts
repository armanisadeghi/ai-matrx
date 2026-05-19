/**
 * Surface manifest — Agent builder (`matrx-user/agent-builder`).
 *
 * The agent creation and editing interface (route `/agents/[id]`). Every
 * field on the agent definition is editable here: system instruction, model,
 * tools, custom tools, context slots, output schema, variable definitions,
 * tags, RAG config, MCP servers, settings.
 *
 * Why this surface matters: agent-builder is the natural home for
 * "judge an agent" / "improve this prompt" / "rewrite this system
 * instruction" actions. To work, those actions need to see the agent
 * being edited and the editor's local UI state (selected text, current
 * field). The manifest exposes both.
 *
 * The user explicitly called out four primary values:
 *   - selected text (from any textarea in the editor)
 *   - the system prompt
 *   - the user message (the test prompt being composed)
 *   - the entire agent as JSON
 *
 * All four are first-class declarations below. Surrounding values let
 * downstream actions reason about the agent without re-fetching.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Agent identity (300-339) ──────────────────────────────────────────
  {
    name: "agent_id",
    label: "Agent ID",
    description:
      "UUID of the agent being edited. Empty when the user is on the agent list with no agent selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "agent_name",
    label: "Agent name",
    description:
      "Human-readable name of the agent being edited. Empty when no agent is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 310,
  },
  {
    name: "agent_description",
    label: "Agent description",
    description:
      "The agent's stored description text. Empty when not set or no agent is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 320,
  },
  {
    name: "agent_type",
    label: "Agent type",
    description:
      'Agent type discriminator (e.g. "user", "system"). Drives which features are available to the agent.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 325,
  },
  {
    name: "agent_version",
    label: "Agent version",
    description:
      "Integer version number of the agent definition the user is currently editing. 1 for the first version, incremented on each publish.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 330,
  },
  {
    name: "agent_tags",
    label: "Agent tags",
    description:
      "Array of tag strings on the active agent. Empty array when no tags or no agent open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 100,
    sortOrder: 335,
  },

  // ── Agent definition body (340-379) — the high-value inputs ──────────
  {
    name: "system_instruction",
    label: "System instruction",
    description:
      "The agent's full system prompt / instructions, as currently saved on the row. Empty when no agent is open. This is the most-edited field on the page.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 340,
  },
  {
    name: "user_message_draft",
    label: "User message draft",
    description:
      "The test message the user is currently composing in the test-prompt input (the message that would be sent to the agent on the next test run). Empty when the input is blank or no agent is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 345,
  },
  {
    name: "agent_model_id",
    label: "Agent model ID",
    description:
      "UUID of the AI model the agent will use. Empty when no model is selected or no agent is open. Pairs with `agent_model_tiers` for fallback chains.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 350,
  },
  {
    name: "agent_tools",
    label: "Agent tools",
    description:
      "Array of tool UUIDs attached to this agent. Empty array when the agent has no tools or no agent is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 355,
  },
  {
    name: "agent_custom_tools",
    label: "Agent custom tools",
    description:
      "Array of inline custom tool definitions (JSON shape) attached to this agent. Empty array when none or no agent is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 360,
  },
  {
    name: "agent_mcp_servers",
    label: "Agent MCP servers",
    description:
      "Array of MCP-server UUIDs the agent is connected to. Empty array when none or no agent is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 363,
  },
  {
    name: "agent_context_slots",
    label: "Agent context slots",
    description:
      "Array of context slot definitions the agent expects at runtime. Each slot has a name, type, and source binding. Empty array when none or no agent is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 365,
  },
  {
    name: "agent_variable_definitions",
    label: "Agent variable definitions",
    description:
      "Array of variable definitions the agent exposes — these are what binding editors can wire surface values into. Empty array when none or no agent is open.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    sortOrder: 370,
  },
  {
    name: "agent_output_schema",
    label: "Agent output schema",
    description:
      "JSON Schema describing the structured output the agent produces. Null/empty when the agent produces freeform text or no agent is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    sortOrder: 375,
  },
  {
    name: "agent_settings",
    label: "Agent settings",
    description:
      "Object of agent-level settings (LLM params, response density, tool config, etc.). Empty object when defaults or no agent is open.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 378,
  },
  {
    name: "agent_json",
    label: "Agent as JSON",
    description:
      "Full agent definition serialized as a JSON string. Lets a judge / improve / refactor agent see EVERYTHING about the agent being edited in a single input. Empty when no agent is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 379,
  },

  // ── Editor focus / UI state (400-449) ─────────────────────────────────
  {
    name: "focused_field",
    label: "Focused field",
    description:
      'Identifier of the field the user is currently editing — e.g. "system_instruction", "description", "user_message". Empty when no editable input is focused.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 400,
  },
  {
    name: "is_dirty",
    label: "Has unsaved changes",
    description:
      "True when the editor has local changes that haven't been persisted to the agent row yet. False when the on-disk and in-editor states match.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 410,
  },
];

export const agentBuilderManifest: SurfaceManifest = {
  surfaceName: "matrx-user/agent-builder",
  values: mergeBaselineValues(
    pickBaseline("selection", "text_before", "text_after", "content", "context"),
    surfaceSpecific,
  ),
};

export function createAgentBuilderScope(values: {
  // alwaysAvailable: false → optional (this surface guarantees nothing
  // because the user may be on the list with no agent open)
  selection?: string;
  text_before?: string;
  text_after?: string;
  content?: string;
  context?: Record<string, unknown>;
  agent_id?: string;
  agent_name?: string;
  agent_description?: string;
  agent_type?: string;
  agent_version?: number;
  agent_tags?: string[];
  system_instruction?: string;
  user_message_draft?: string;
  agent_model_id?: string;
  agent_tools?: string[];
  agent_custom_tools?: unknown[];
  agent_mcp_servers?: string[];
  agent_context_slots?: unknown[];
  agent_variable_definitions?: unknown[];
  agent_output_schema?: Record<string, unknown>;
  agent_settings?: Record<string, unknown>;
  agent_json?: string;
  focused_field?: string;
  is_dirty?: boolean;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
