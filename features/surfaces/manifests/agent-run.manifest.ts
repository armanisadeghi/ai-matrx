/**
 * Surface manifest — Agent run viewer (`matrx-user/agent-run`).
 *
 * Live agent execution viewer. The user is looking at a single agent run —
 * the agent definition that produced it, the user's request, the messages
 * the agent emitted, tool calls, status, timing.
 *
 * Why this surface matters (the user's framing): this is where
 * "judge an agent" actions belong — an agent that takes (1) the agent
 * definition, (2) the request, and (3) the response, and grades the
 * output. All three are first-class declarations below.
 *
 * Distinct from `matrx-user/chat`: chat exposes a conversation; this
 * surface exposes one specific run with full agent-definition context.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  // ── Run identity (300-319) ────────────────────────────────────────────
  {
    name: "run_conversation_id",
    label: "Run conversation ID",
    description:
      "UUID of the conversation / execution instance for this run. Empty when no run is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "run_status",
    label: "Run status",
    description:
      '"draft", "ready", "running", "streaming", "paused", "complete", "error", or "cancelled". Empty when no run is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 310,
  },
  {
    name: "run_origin",
    label: "Run origin",
    description:
      'Where the run started: "manual", "shortcut", "test", "sub-agent". Empty when no run is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 315,
  },

  // ── Agent definition (the AGENT that ran) (320-349) ───────────────────
  {
    name: "agent_id",
    label: "Agent ID",
    description:
      "UUID of the agent that produced this run. Empty when no run is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 320,
  },
  {
    name: "agent_name",
    label: "Agent name",
    description:
      "Display name of the agent that produced this run. Empty when no run is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 325,
  },
  {
    name: "agent_version",
    label: "Agent version",
    description:
      "Integer version of the agent definition this run executed against. Pinned for shortcut / app launches.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 330,
  },
  {
    name: "agent_system_instruction",
    label: "Agent system instruction",
    description:
      "The system prompt the agent ran with. Lets a judge agent see exactly what the agent was instructed to do. Empty when no run is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    sortOrder: 335,
  },
  {
    name: "agent_model_id",
    label: "Agent model ID",
    description:
      "UUID of the AI model used for this run. Empty when no run is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 340,
  },
  {
    name: "agent_json",
    label: "Agent as JSON",
    description:
      "Full agent definition (the version that ran) serialized as JSON. The canonical input for 'judge this agent' actions — gives the judge the entire agent contract in one value.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 345,
  },

  // ── Request / inputs (350-369) ────────────────────────────────────────
  {
    name: "user_request",
    label: "User request",
    description:
      "The user message / prompt that triggered this run. Empty when the run had no user-facing input (e.g. autoRun shortcuts).",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 350,
  },
  {
    name: "variable_values",
    label: "Variable values",
    description:
      "Object of resolved variable values that flowed into the agent's variables at run time (after surface mapping + user overrides). Empty when the agent had no variables.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    sortOrder: 360,
  },
  {
    name: "context_entries",
    label: "Context entries",
    description:
      "Array of `{ key, value }` context slot entries that were available to the agent at run time. Empty when the agent had no context slots.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 365,
  },

  // ── Response / outputs (370-399) ──────────────────────────────────────
  {
    name: "agent_response",
    label: "Agent response",
    description:
      "Text of the most recent assistant message in this run — typically the final answer. Empty when the agent has not yet produced output.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    sortOrder: 370,
  },
  {
    name: "agent_response_json",
    label: "Agent structured response",
    description:
      "Parsed structured output (when the agent's output_schema is set) as JSON. Empty when the agent produced freeform text or no run is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    sortOrder: 372,
  },
  {
    name: "all_messages",
    label: "All messages",
    description:
      "Array of every message in this run, in order, with role + text. Includes user, assistant, system, and tool turns.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    sortOrder: 375,
  },
  {
    name: "tool_calls",
    label: "Tool calls",
    description:
      "Array of tool calls the agent made during this run, with tool id, input args, output, and duration. Empty array when no tools were called.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    sortOrder: 380,
  },
  {
    name: "completion_stats",
    label: "Completion stats",
    description:
      "Object with token usage, timing, and tool-call stats from the completed run. Empty until the run finishes.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    sortOrder: 385,
  },

  // ── Live state (400-449) ──────────────────────────────────────────────
  {
    name: "is_streaming",
    label: "Run is streaming",
    description:
      "True while the agent is still producing output. Lets a judge action wait or refuse mid-flight.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 400,
  },
  {
    name: "error_message",
    label: "Error message",
    description:
      "When `run_status` is `error`, the error text. Empty otherwise.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 410,
  },
];

export const agentRunManifest: SurfaceManifest = {
  surfaceName: "matrx-user/agent-run",
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

export function createAgentRunScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  run_conversation_id?: string;
  run_status?: string;
  run_origin?: string;
  agent_id?: string;
  agent_name?: string;
  agent_version?: number;
  agent_system_instruction?: string;
  agent_model_id?: string;
  agent_json?: string;
  user_request?: string;
  variable_values?: Record<string, unknown>;
  context_entries?: Array<{ key: string; value: unknown }>;
  agent_response?: string;
  agent_response_json?: string;
  all_messages?: Array<{ id?: string; role: string; text: string }>;
  tool_calls?: unknown[];
  completion_stats?: Record<string, unknown>;
  is_streaming?: boolean;
  error_message?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
