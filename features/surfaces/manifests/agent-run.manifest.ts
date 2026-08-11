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
// The composer / title write vocabulary, from `chat.manifest.ts` — ONE
// definition, deliberately shared rather than re-declared. This surface's
// composer is not merely similar to chat's: it is the SAME `instanceUserInput`
// entry, written by the SAME `setUserInputText` action (both routes render
// `AgentConversationColumn`), and its title is the SAME `chat.conversation`
// row renamed by the SAME `renameConversation` thunk. Two copies of these
// bounds would be two advertised contracts over one enforced write path.
import {
  CHAT_CONVERSATION_TITLE_MAX,
  CHAT_DRAFT_WRITE_MODES,
  CHAT_INPUT_DRAFT_MAX,
} from "./chat.manifest";
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

// ---------------------------------------------------------------------------
// Write targets (2026-08-10) — the judgment bar, written down.
//
// This surface is a MEASURING INSTRUMENT. The user came here to exercise an
// agent and look at what it did, and almost everything declared above is
// either the agent's contract or the evidence of one run against it. That
// framing decides the list, and it rules out more than it lets in:
//
//   YES — `user_input_draft`: the next request, not yet sent. The textbook
//   authored field ("turn my notes into a proper request", "add the edge case
//   we just found"), and fully reversible because the user still presses send.
//
//   YES — `conversation_title`: an authored label over a run the agent can
//   already read end-to-end, and the field a user most often leaves at its
//   auto-generated default when a run history fills up.
//
//   YES — `variable_values`: the run's INPUTS. This is the one target this
//   surface earns that `matrx-user/chat` deliberately did not, and the reason
//   is declared right here: `agent_variable_definitions` is a first-class
//   value on this surface, so an agent can READ the contract (names,
//   requiredness, defaults) and then fill it — a real evidence loop rather
//   than guesswork. Chat left the same field out precisely because its agents
//   rarely declare variables and the happy path could not be exercised; on the
//   run page, exercising an agent's variables is the whole point of the route.
//
//   NO — RUNNING the agent. Send/Execute spends a turn and bills a model, and
//   on a page whose purpose is to judge an agent, an agent that could re-run
//   it could also grade its own retry. The human press stays the gate, as it
//   does for `podcast-studio`, `image-generate` and `matrx-user/chat`.
//
//   NO — the EVIDENCE. `user_request`, `agent_response`, `agent_reasoning`,
//   `all_messages`, `tool_calls`, `completion_stats`, `error_message`,
//   `is_streaming` / `is_executing` and `run_status` are the record of what
//   this agent actually did. The entire value of a run viewer is that its
//   readings were not written by the thing being measured; a write target on
//   any of them would let an agent edit its own exam paper.
//
//   NO — the AGENT'S DEFINITION. `agent_system_instruction`, `agent_model_id`,
//   `agent_tools`, `agent_variable_definitions`, `agent_version`,
//   `agent_json`, `agent_description`, `agent_name`. These change what the
//   agent IS and what it may reach, and this route is not their editor —
//   `matrx-user/agent-builder` is, and it draws exactly this line. Editing the
//   contract from inside the instrument that measures it is worse still: the
//   run on screen would no longer be a run of the agent now described.
//
//   NO — `context_entries` (assembled grounding, not typed state; overwritten
//   on the next assembly), and every identity value (`run_conversation_id`,
//   `agent_id`, `run_origin`, `run_source_feature`).
//
// PER-MOUNT POSTURE. `AgentRunnerPage` is the only component that mounts this
// surface, and it ALREADY refuses to claim it outside the standalone run route
// (`isAgentRunSurface = sourceFeature === "agent-runner"`). The same component
// backs the `/code` workspace under `sourceFeature: "code-editor"`, which
// mounts no provider here and therefore offers an agent none of these targets
// — the code workspace is its own surface with its own posture, and a draft
// staged there would be staged against a different feature's conversation.
// The gate is upstream of `getWriteHandlers`, so the handlers below inherit it
// without restating it.
//
// Every target is `applyPolicy: "ask"`. The draft and the variables are
// `draft` (nothing leaves the page until the user sends); the title is
// `entity`, matching what the user's own rename control does, and reversible
// by renaming again.
// ---------------------------------------------------------------------------

const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "user_input_draft",
    label: "User input draft",
    description: `Types text into THIS run's message box for the user to review and send. Value: { "text": string (1-${CHAT_INPUT_DRAFT_MAX} characters), "mode"?: ${CHAT_DRAFT_WRITE_MODES.map((m) => `"${m}"`).join(" | ")} } — \`text\` is required, \`mode\` is optional and defaults to "${CHAT_DRAFT_WRITE_MODES[0]}", which swaps the ENTIRE box. "${CHAT_DRAFT_WRITE_MODES[1]}" adds your text after whatever the user already typed, on a new line, leaving their words intact — read the \`user_input_draft\` value first and prefer append whenever it is non-empty. This ONLY stages text: nothing is sent, no turn is spent, no model is billed, and the user still presses send. It lands in the RUN PAGE's message box on screen — never in the message box of whatever agent run you are executing inside.`,
    valueType: "object",
    updatesValue: "user_input_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "run_request",
    sortOrder: 500,
  },
  {
    name: "conversation_title",
    label: "Conversation title",
    description: `Renames this run — the label it carries in the run history sidebar. Value: a plain non-empty string, trimmed, at most ${CHAT_CONVERSATION_TITLE_MAX} characters, REPLACING the current title outright (there is no append mode and no partial update — pass the complete new title). An empty or blank title is REFUSED: clearing a run's name back to Untitled is a human decision. Saves immediately through the canonical rename path, and is reversible by renaming again. Refused when this run has not been persisted yet — a fresh run holds a client-minted id and has no row until its first turn completes. This changes the label only and never touches a message.`,
    valueType: "string",
    updatesValue: "conversation_title",
    mode: "entity",
    applyPolicy: "ask",
    group: "run_identity",
    sortOrder: 510,
  },
  {
    name: "variable_values",
    label: "Variable values",
    description:
      'Fills in this agent\'s declared variables for the NEXT run. Value: an object of { "<variable name>": <value> } — a PARTIAL patch, so ONLY the keys you pass change and every variable you omit keeps whatever it currently has (pass an explicit empty string to blank one out). Read `agent_variable_definitions` FIRST: every key must be a variable that agent actually declares, and an unknown name is refused with the declared list while NOTHING is applied — no partial write. Values are staged into the run inputs the user can see and edit; nothing is sent and the user still presses send. Offered only when the agent declares variables. Note the read twin `variable_values` reports the RESOLVED result (user values layered over scope values and defaults) while this target writes the user-value layer, so a variable filled from scope will read back as yours only once you set it.',
    valueType: "object",
    updatesValue: "variable_values",
    mode: "draft",
    applyPolicy: "ask",
    group: "run_request",
    sortOrder: 520,
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
