/**
 * Surface manifest — Agent run viewer (`matrx-user/agent-run`).
 *
 * Live agent execution viewer at `/agents/[id]/run`. The user is looking at
 * one conversation with one agent — the agent definition that produced it,
 * the request, the transcript, tool calls, completion stats, status.
 *
 * Why this surface matters (the user's framing): this is where
 * "judge an agent" actions belong — an agent that takes (1) the agent
 * definition, (2) the request, and (3) the response, and grades the output.
 * All three are first-class declarations below.
 *
 * Distinct from `matrx-user/chat`: chat exposes a conversation; this surface
 * exposes one run of one agent WITH the agent's definition alongside it.
 *
 * Emitter: `features/agents/hooks/useAgentRunSurfaceScope.ts`, mounted as
 * `<SurfaceRuntimeProvider>` by `AgentRunnerPage` — but ONLY for the
 * standalone run route (`sourceFeature === "agent-runner"`). The same
 * component backs the `/code` workspace, which is a different surface and
 * must not claim this one.
 *
 * Honest availability: nothing is `alwaysAvailable`. The route carries the
 * agent id, but the emitter mounts before Redux has the agent record and
 * before a conversation exists, so every value can legitimately be absent.
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
    key: "run_identity",
    label: "Run identity",
    sortOrder: 100,
    description:
      "Which conversation this is, where it came from, and its lifecycle status.",
  },
  {
    key: "run_agent",
    label: "The agent that ran",
    sortOrder: 200,
    description:
      "The agent definition behind this run — what a judge grades the output against.",
  },
  {
    key: "run_request",
    label: "Request and inputs",
    sortOrder: 300,
    description:
      "What was asked: the user's message, the resolved variables, and the context slots that were filled.",
  },
  {
    key: "run_response",
    label: "Response and transcript",
    sortOrder: 400,
    description:
      "What came back: the latest answer, the full message transcript, tool calls, and completion stats.",
  },
  {
    key: "run_live_state",
    label: "Live state",
    sortOrder: 500,
    description:
      "Whether the run is still in flight and whether it failed — check before judging output.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Run identity (300-330) ────────────────────────────────────────────
  {
    name: "run_conversation_id",
    label: "Run conversation ID",
    description:
      "UUID of the conversation / execution instance for this run. Empty until the run route has minted or loaded a conversation.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "run_identity",
    sortOrder: 300,
  },
  {
    name: "run_status",
    label: "Run status",
    description:
      '"draft", "ready", "running", "streaming", "paused", "complete", "error", or "cancelled". Empty when the instance has not been created yet.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "run_identity",
    sortOrder: 310,
  },
  {
    name: "run_origin",
    label: "Run origin",
    description:
      'Where the run started: "manual", "shortcut", "test", "sub-agent". Empty when no instance exists yet.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    group: "run_identity",
    sortOrder: 315,
  },
  {
    name: "run_source_feature",
    label: "Run source feature",
    description:
      'Which product surface owns this run — "agent-runner" for the standalone run route. Lets an action tell a run page from an embedded runner.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    group: "run_identity",
    sortOrder: 318,
  },
  {
    name: "conversation_title",
    label: "Conversation title",
    description:
      "Title of this conversation as shown in the run history sidebar. Empty until the server names the conversation after the first turn.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    group: "run_identity",
    sortOrder: 320,
  },
  {
    name: "message_count",
    label: "Message count",
    description:
      "Number of messages currently loaded in this conversation. 0 on a fresh run before the first turn. Note it reflects LOADED history, which may be paged.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    group: "run_identity",
    sortOrder: 325,
  },

  // ── Agent definition (the AGENT that ran) (320-349) ───────────────────
  {
    name: "agent_id",
    label: "Agent ID",
    description:
      "UUID of the agent that produced this run. Taken from the route, so present whenever the run page is mounted.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "run_agent",
    sortOrder: 320,
  },
  {
    name: "agent_name",
    label: "Agent name",
    description:
      "Display name of the agent that produced this run. Empty until the agent record hydrates in Redux.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    group: "run_agent",
    sortOrder: 325,
  },
  {
    name: "agent_description",
    label: "Agent description",
    description:
      "The agent's stored description — its stated purpose, which a judge compares the output against. Empty when unset.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "run_agent",
    sortOrder: 328,
  },
  {
    name: "agent_version",
    label: "Agent version",
    description:
      "Integer version of the agent definition this run executed against. Pinned for shortcut / app launches.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "run_agent",
    sortOrder: 330,
  },
  {
    name: "agent_system_instruction",
    label: "Agent system instruction",
    description:
      "The system prompt the agent ran with. Lets a judge agent see exactly what the agent was instructed to do. Empty when the agent has no text system message.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 4000,
    group: "run_agent",
    sortOrder: 335,
  },
  {
    name: "agent_model_id",
    label: "Agent model ID",
    description:
      "UUID of the AI model used for this run. Empty when the agent has no model set.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "run_agent",
    sortOrder: 340,
  },
  {
    name: "agent_tools",
    label: "Agent tools",
    description:
      "Array of tool UUIDs the agent was allowed to call on this run. Empty array when the agent has no tools. Compare against `tool_calls` to see what it actually used.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "run_agent",
    sortOrder: 342,
  },
  {
    name: "agent_variable_definitions",
    label: "Agent variable definitions",
    description:
      "The agent's declared variables — names, types, requiredness, defaults. Pair with `variable_values` to see what was actually supplied. Empty array when the agent takes no variables.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    group: "run_agent",
    sortOrder: 344,
  },
  {
    name: "agent_json",
    label: "Agent as JSON",
    description:
      "Full agent definition (as currently loaded) serialized as JSON. The canonical input for 'judge this agent' actions — gives the judge the entire agent contract in one value.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    autoContext: false,
    group: "run_agent",
    sortOrder: 345,
  },

  // ── Request / inputs (350-369) ────────────────────────────────────────
  {
    name: "user_request",
    label: "User request",
    description:
      "Text of the most recent user message in this run — the request the response answers. Empty when no user turn has been sent yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    group: "run_request",
    sortOrder: 350,
  },
  {
    name: "user_input_draft",
    label: "User input draft",
    description:
      "What the user has typed into the message box but not sent yet. Empty when the input is blank.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "run_request",
    sortOrder: 355,
  },
  {
    name: "variable_values",
    label: "Variable values",
    description:
      "Object of resolved variable values that flowed into the agent's variables at run time (user values > scope values > defaults). Empty object when the agent had no variables.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    group: "run_request",
    sortOrder: 360,
  },
  {
    name: "context_entries",
    label: "Context entries",
    description:
      "Array of context slot entries available to the agent on this run, each with its key, value, and whether it matched a declared slot. Empty array when no context was attached.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    autoContext: false,
    group: "run_request",
    sortOrder: 365,
  },

  // ── Response / outputs (370-399) ──────────────────────────────────────
  {
    name: "agent_response",
    label: "Agent response",
    description:
      "The agent's answer text for the latest turn, with chain-of-thought stripped. Empty when the agent has not yet produced output.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    group: "run_response",
    sortOrder: 370,
  },
  {
    name: "agent_reasoning",
    label: "Agent reasoning",
    description:
      "The reasoning / thinking trace for the latest turn, when the model emitted one. Empty for models or turns without visible reasoning.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    group: "run_response",
    sortOrder: 372,
  },
  {
    name: "all_messages",
    label: "All messages",
    description:
      "Array of every loaded message in this run, in order, as `{ id, role, text }`. Includes user, assistant, system, and tool turns. Empty array before the first turn.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    group: "run_response",
    sortOrder: 375,
  },
  {
    name: "tool_calls",
    label: "Tool calls",
    description:
      "Array of tool lifecycle entries for the latest turn — tool name, args, result, and status. Empty array when no tools were called.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    group: "run_response",
    sortOrder: 380,
  },
  {
    name: "completion_stats",
    label: "Completion stats",
    description:
      "The completion payload for the latest turn — operation, status, and result (usage / timing). Empty until the turn finishes.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 400,
    group: "run_response",
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
    group: "run_live_state",
    sortOrder: 400,
  },
  {
    name: "is_executing",
    label: "Run is executing",
    description:
      "True while the run is in flight at all — request sent but not finished, including before the first token.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    group: "run_live_state",
    sortOrder: 405,
  },
  {
    name: "error_message",
    label: "Error message",
    description:
      "Error text for the latest turn when it failed. Empty when the run has not errored.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 300,
    group: "run_live_state",
    sortOrder: 410,
  },
];

/**
 * Write half — the run's INPUTS, and only the inputs.
 *
 * The judgment calls behind this list, written down because the surface is
 * unusually easy to over-declare:
 *
 * 1. **Sending the message / executing the run is NOT a target.** The
 *    `podcast-studio` and `image-generate` precedent applies with extra force
 *    here: a run spends real money and real time, and the human press is the
 *    gate. Sharper still on THIS surface — the caller is itself a running
 *    agent, so a `send_message` target would let an agent start another agent
 *    run unattended, recursively. Staging the composer is the whole offer;
 *    the user presses Send.
 *
 * 2. **The agent DEFINITION is not writable from here.** `agent_system_instruction`,
 *    `agent_model_id`, `agent_tools`, `agent_variable_definitions` are read-only
 *    evidence on this surface — `matrx-user/agent-builder` already owns writing
 *    them, and duplicating its targets here would give two surfaces two paths to
 *    the same record.
 *
 * 3. **Model OUTPUT is never writable.** `agent_response`, `agent_reasoning`,
 *    `all_messages`, `tool_calls`, `completion_stats` are the transcript. An
 *    agent editing the transcript it is being judged on is the one write this
 *    surface must never offer. Live status (`is_streaming`, `is_executing`,
 *    `error_message`) is observed, not set.
 *
 * 4. **`context_entries` did NOT earn a target.** Filling a context slot means
 *    naming a declared slot key, and this surface does not expose the agent's
 *    declared context slots as a value — the vocabulary is not in scope. That
 *    is exactly the `node_primary_keyword_id` case: an agent cannot honestly
 *    choose from a list it cannot see, so no declaration.
 *
 * 5. **`variable_values` DID earn one, and the vocabulary test is why.**
 *    `agent_variable_definitions` IS a declared value, and each entry carries
 *    `customComponent.options` (the allowed values), `required`, `defaultValue`
 *    and `helpText`. The agent can read the enum before it writes. Where the
 *    vocabulary genuinely is NOT visible — a Structured-List-bound variable
 *    (options hydrate from a list resource that never reaches scope), a
 *    scope-bound variable (the server resolves it authoritatively), or a media
 *    variable (the value is a MediaRef, not text) — the handler refuses that
 *    name rather than guessing.
 *
 * Two targets, which clears the skill's ~2-YES bar: together they are the
 * entire request half of a run (the message, and the variables that message
 * runs with), and they are the only page state a user can still review and
 * undo before anything is spent.
 *
 * Both are `draft` / `applyPolicy: "ask"` and both REFUSE while the run is in
 * flight (`is_streaming` / `is_executing`) — not out of caution but because
 * mid-run writes do not survive: the stream dispatches `resetUserVariableValues`
 * on completion, and a composer staged mid-run gets queued or steered into the
 * running turn by the next Enter rather than sent as a fresh request.
 *
 * Handlers are registered by `AgentRunnerPage` on its `SurfaceRuntimeProvider`
 * (`features/agents/components/run/AgentRunnerPage.tsx`).
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "user_input_draft",
    label: "User input draft",
    description:
      "Stages text into the run's message box, exactly as if the user had typed it — it is NOT sent. Value: a non-empty string, which REPLACES the whole composer contents (to add to what is there, read `user_input_draft` first and include it). The user reviews it in the composer and presses Send themselves; sending is never an agent action. Refused while the run is streaming or executing.",
    valueType: "string",
    updatesValue: "user_input_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "run_request",
    sortOrder: 355,
  },
  {
    name: "variable_values",
    label: "Variable values",
    description:
      "Fills the agent's declared variables for the next turn. Value: an object of { variableName: value } — a PARTIAL map that merges, so variables you omit keep their current value. Every name must be one the agent declares: read `agent_variable_definitions` first and use its `name`s. Values must match that definition — when it carries `customComponent.options` and `allowOther` is not true, the value must be one of those options (or an array drawn from them for multi-select); otherwise a string, number, boolean, null, or array of strings. Variables bound to a context slot, bound to a Structured List, or of a media type (image/audio/video/youtube/document) are REFUSED — their values are resolved elsewhere and their vocabulary is not visible here. Staged into the run's variable panel for the user to review; nothing is sent. Refused while the run is streaming or executing.",
    valueType: "object",
    updatesValue: "variable_values",
    mode: "draft",
    applyPolicy: "ask",
    group: "run_request",
    sortOrder: 360,
  },
];

export const agentRunManifest: SurfaceManifest = {
  surfaceName: "matrx-user/agent-run",
  readiness: "verified",
  label: "Agent Run",
  urlPattern: "/agents/[id]/run",
  intro: `<surface_intro>
The Agent Run surface is one conversation with one agent, viewed on its own
run page. The user came here to exercise an agent and look at what it did.

Read the values this way:
- The \`agent_*\` values describe the AGENT THAT RAN — its instruction, model,
  tools, and declared variables. That is the contract.
- \`user_request\`, \`variable_values\`, and \`context_entries\` are what actually
  went in on this run.
- \`agent_response\` is the answer for the latest turn; \`all_messages\` is the
  whole transcript; \`tool_calls\` is what the agent reached for.
- \`is_streaming\` / \`is_executing\` mean the run is not finished — do not grade
  a partial answer without saying so. \`error_message\` means it failed.

The canonical action here is judgement: compare what the agent was told to do
against what it actually produced, and cite specific turns.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

export function createAgentRunScope(values: {
  // alwaysAvailable: false throughout — the page mounts before the agent
  // record hydrates and before a conversation exists.
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  run_conversation_id?: string;
  run_status?: string;
  run_origin?: string;
  run_source_feature?: string;
  conversation_title?: string;
  message_count?: number;
  agent_id?: string;
  agent_name?: string;
  agent_description?: string;
  agent_version?: number;
  agent_system_instruction?: string;
  agent_model_id?: string;
  agent_tools?: string[];
  agent_variable_definitions?: unknown[];
  agent_json?: string;
  user_request?: string;
  user_input_draft?: string;
  variable_values?: Record<string, unknown>;
  context_entries?: unknown[];
  agent_response?: string;
  agent_reasoning?: string;
  all_messages?: Array<{ id: string; role: string; text: string }>;
  tool_calls?: unknown[];
  completion_stats?: Record<string, unknown>;
  is_streaming?: boolean;
  is_executing?: boolean;
  error_message?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
