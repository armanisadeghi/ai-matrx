/**
 * Surface manifest — Agent Run History (`matrx-user/agent-run-history`).
 *
 * The floating Run History window (overlay `agentRunHistoryWindow`,
 * `AgentRunHistoryWindow`): pick an agent, browse its past conversations
 * grouped by agent version (newest version first), and open one in the
 * conversation display pane to review or resume it.
 *
 * ── What this surface IS ───────────────────────────────────────────────────
 *
 * An INDEX over runs. The window's own data is the conversation LIST — the
 * roster of everything an agent has ever done, with the load state of that
 * roster — plus whichever single run the user clicked into. That framing
 * decides what is declared below and, just as much, what is not.
 *
 * ── Why there are no write targets ─────────────────────────────────────────
 *
 * Run history is a RECORD of what already happened. Derived evidence is
 * read-only by nature: there is no draft here for an agent to author into,
 * and nothing an agent could write would change what a past run did. That is
 * not a gap — a readable record is exactly what an agent diagnosing a failed
 * run needs, and read-only is the honest shape of it.
 *
 * The row context menu (`buildConversationMenu`) does expose rename /
 * favorite / archive / exclude-from-kg, so the window is not literally
 * write-free. Those were still declined as write targets, deliberately:
 * they are the conversation-row action registry's canonical operations,
 * available identically from every conversation list in the app (global
 * sidebar, chat, run page). Re-exposing them here would advertise a
 * per-surface contract over a write path this surface does not own, and
 * would make Run History the arbitrary one of five lists that got them.
 * If they are ever worth agent access they belong on the row-action
 * registry, once, not on this window.
 *
 * ── Documented exclusions (loaded, deliberately not emitted) ───────────────
 *
 * - THE AGENT DEFINITION. `selectAgentById` is read here, but only for the
 *   agent's NAME (window title + sidebar picker label). The instruction,
 *   model, tools, and variable contract are `matrx-user/agent-run`'s and
 *   `matrx-user/agent-builder`'s vocabulary. This window is an index over
 *   runs, not an agent editor; duplicating that vocabulary would fork it.
 *   `agent_id` is declared so an agent can look the definition up.
 *
 * - RAW MESSAGE CONTENT BLOCKS AND TOOL-CALL PAYLOADS. The pane renders the
 *   full transcript, including interleaved tool calls whose results are
 *   unbounded (a single scrape or file read can be megabytes).
 *   `selected_run_transcript` flattens to `{ id, role, text }` — the same
 *   projection `matrx-user/agent-run` uses for `all_messages` — so the
 *   transcript stays readable without an unbounded payload riding a 400ms
 *   poll. An agent that needs a specific tool result reads the run page.
 *
 * - `WindowPanel onCollectData`. The window already publishes
 *   `{ agentId, selectedConversationId }` to the window-panel system. That
 *   is a different channel with a different consumer; the surface scope
 *   supersedes it here rather than mirroring its shape.
 *
 * ── Emitter ────────────────────────────────────────────────────────────────
 *
 * `<SurfaceRuntimeProvider>` mounted INSIDE `AgentRunHistoryWindow`, building
 * through `agent-run-history-scope.ts`. Nested-inside-the-page is correct for
 * an overlay: the provider out-depths whatever page is behind the window, so
 * while the window is open ITS scope wins.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

/** Canonical `ui_surface.name`. The emitter imports this — never a literal. */
export const AGENT_RUN_HISTORY_SURFACE_NAME = "matrx-user/agent-run-history";

const groups: SurfaceValueGroup[] = [
  {
    key: "history_agent",
    label: "Agent under review",
    sortOrder: 100,
    description:
      "Which agent's run history is on screen. Identity only — the agent's definition lives on the Agent Run surface.",
  },
  {
    key: "run_index",
    label: "Run index",
    sortOrder: 200,
    description:
      "The roster of past runs for this agent, and how the window groups them by agent version.",
  },
  {
    key: "history_load_state",
    label: "History load state",
    sortOrder: 300,
    description:
      "Whether the roster actually loaded. An empty list and a failed fetch are different answers — check here before concluding an agent has never run.",
  },
  {
    key: "run_detail",
    label: "Selected run",
    sortOrder: 400,
    description:
      "The single past run open in the display pane, and its transcript once loaded.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Agent under review (300-319) ──────────────────────────────────────
  {
    name: "agent_id",
    label: "Agent ID",
    description:
      "UUID of the agent picked in the sidebar, exactly as selected. Empty when no agent has been picked yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "history_agent",
    sortOrder: 300,
  },
  {
    name: "agent_name",
    label: "Agent name",
    description:
      "Display name of the selected agent, from the agent-definition store. Empty when no agent is picked or the record has not hydrated yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 40,
    group: "history_agent",
    sortOrder: 305,
  },
  {
    name: "canonical_agent_id",
    label: "Canonical agent ID",
    description:
      "The parent agent id the history is actually fetched under — a versioned agent's runs are stored against its parent, which is why the list spans versions. Equals agent_id for an unversioned agent; absent when no agent is picked.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    autoContext: false,
    group: "history_agent",
    sortOrder: 310,
  },

  // ── Run index (320-359) ───────────────────────────────────────────────
  {
    name: "conversation_count",
    label: "Conversation count",
    description:
      "Number of past conversations loaded for the selected agent, across all versions. Absent until an agent is picked; 0 once loaded for an agent that has never run.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "run_index",
    sortOrder: 320,
  },
  {
    name: "run_history",
    label: "Run history",
    description:
      "Every loaded past run for this agent, newest first, as `{ conversation_id, title, status, updated_at, created_at, message_count, agent_version_number, last_model_id, origin_class, source_app, source_feature, is_favorite, excluded_from_kg }`. Empty array once loaded for an agent with no runs; absent while the fetch has not resolved.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6500,
    group: "run_index",
    sortOrder: 330,
  },
  {
    name: "run_versions",
    label: "Runs by agent version",
    description:
      "The sidebar's grouping, newest version first, as `{ version_number, conversation_count }`. This is how the window organizes the list; version 0 collects runs whose version was not recorded. Absent until the roster loads.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 240,
    group: "run_index",
    sortOrder: 340,
  },
  {
    name: "latest_run_at",
    label: "Latest run at",
    description:
      "ISO timestamp of the most recently updated run in the roster — when this agent last did anything. Absent when the roster has not loaded or contains no runs.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    group: "run_index",
    sortOrder: 350,
  },

  // ── History load state (360-379) ──────────────────────────────────────
  {
    name: "history_load_status",
    label: "History load status",
    description:
      "Fetch state of the roster: `idle`, `loading`, `succeeded`, or `failed`. Absent until an agent is picked. Read this before treating an empty run_history as 'this agent has never run'.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "history_load_state",
    sortOrder: 360,
  },
  {
    name: "history_load_error",
    label: "History load error",
    description:
      "Error text shown in the sidebar when the roster fetch failed. Absent whenever the fetch has not failed.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    group: "history_load_state",
    sortOrder: 365,
  },
  {
    name: "history_fetched_at",
    label: "History fetched at",
    description:
      "ISO timestamp of the last successful roster fetch, from the per-agent cache entry. Absent before the first successful fetch. Useful for judging whether a run that just finished would be in the list yet.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    autoContext: false,
    group: "history_load_state",
    sortOrder: 370,
  },

  // ── Selected run (400-439) ────────────────────────────────────────────
  {
    name: "selected_conversation_id",
    label: "Selected conversation ID",
    description:
      "UUID of the past conversation open in the display pane. Empty when none is selected and the pane is showing its placeholder.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    group: "run_detail",
    sortOrder: 400,
  },
  {
    name: "selected_run",
    label: "Selected run",
    description:
      "The full roster row for the open conversation — the same shape as a run_history entry. Absent when nothing is selected, or when the selection came in as a deep link the roster does not contain.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 320,
    group: "run_detail",
    sortOrder: 410,
  },
  {
    name: "selected_run_status",
    label: "Selected run status",
    description:
      "Lifecycle status of the open run as recorded on the conversation row (e.g. `active`, `archived`). Absent when nothing is selected or the row is not in the roster.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    group: "run_detail",
    sortOrder: 420,
  },
  {
    name: "selected_run_message_count",
    label: "Selected run message count",
    description:
      "Message count recorded on the open run's roster row. This is the SERVER's count and is available immediately on selection — it can exceed the length of selected_run_transcript while the transcript is still loading.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    group: "run_detail",
    sortOrder: 425,
  },
  {
    name: "selected_run_transcript",
    label: "Selected run transcript",
    description:
      "The open run's messages in order as `{ id, role, text }`, once loaded into the message store. Empty array for a run that genuinely has no messages; ABSENT while the transcript is still loading, so an empty transcript is never mistaken for an unloaded one. A tool turn — and the assistant turn that called it — carries `text: \"\"`, because tool payloads are deliberately not projected here; the assistant's actual answer arrives in the following turn.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 6000,
    autoContext: false,
    group: "run_detail",
    sortOrder: 430,
  },
];

export const agentRunHistoryManifest: SurfaceManifest = {
  surfaceName: AGENT_RUN_HISTORY_SURFACE_NAME,
  readiness: "partial",
  readinessNote:
    "Emitter wired and verified live in the Surface Context window: AgentRunHistoryWindow mounts SurfaceRuntimeProvider and every declared value is supplied by agent-run-history-scope.ts. Not `verified` because no agent has been bound to this surface, so the non-matching-name binding and Matrx-vs-matrix checks have not been run, and the DB manifest sync has not been applied for the new values.",
  overlayId: "agentRunHistoryWindow",
  label: "Agent Run History",
  intro: `<surface_intro>
You are on Agent Run History — a floating window for reviewing an agent's past
runs. It is an INDEX over runs, not a place where work is authored: everything
here is a record of something that already happened, and nothing on this
surface is writable.

Read the values this way:
- \`agent_id\` / \`agent_name\` say WHOSE history this is. The agent's definition
  (instruction, model, tools) is not here — look it up by \`agent_id\`.
- \`run_history\` is the roster: every past run, newest first, with its status,
  timestamps, message count, agent version, and model. \`run_versions\` is how
  the sidebar groups it. This is the main evidence on this surface.
- \`history_load_status\` gates all of it. An absent or empty \`run_history\` with
  status \`loading\` or \`failed\` does NOT mean the agent never ran — say so
  rather than concluding from an empty list.
- \`selected_run\` and \`selected_run_transcript\` are the one run the user
  clicked into. The transcript is ABSENT while it loads and \`[]\` only when the
  run truly has no messages; \`selected_run_message_count\` is the server's
  count and tells you what the transcript should eventually hold.

The canonical action here is diagnosis and recall: find the run that matters,
compare runs across agent versions, and explain what happened in one.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** One roster row, as the scope emits it. */
export interface AgentRunHistoryRow {
  conversation_id: string;
  title: string | null;
  status: string;
  updated_at: string;
  created_at?: string;
  message_count: number;
  agent_version_number?: number;
  last_model_id?: string | null;
  origin_class?: string;
  source_app?: string;
  source_feature?: string;
  is_favorite: boolean;
  excluded_from_kg: boolean;
}

/** One `run_versions` entry — the sidebar's version grouping. */
export interface AgentRunHistoryVersionSummary {
  version_number: number;
  conversation_count: number;
}

/** One transcript entry — the flattened projection, never raw content blocks. */
export interface AgentRunHistoryTranscriptEntry {
  id: string;
  role: string;
  text: string;
}

export function createAgentRunHistoryScope(values: {
  // alwaysAvailable: false throughout — the window opens with no agent
  // picked, and the roster is fetched after mount.
  agent_id?: string;
  agent_name?: string;
  canonical_agent_id?: string;
  conversation_count?: number;
  run_history?: AgentRunHistoryRow[];
  run_versions?: AgentRunHistoryVersionSummary[];
  latest_run_at?: string;
  history_load_status?: string;
  history_load_error?: string;
  history_fetched_at?: string;
  selected_conversation_id?: string;
  selected_run?: AgentRunHistoryRow;
  selected_run_status?: string;
  selected_run_message_count?: number;
  selected_run_transcript?: AgentRunHistoryTranscriptEntry[];
  selection?: string;
  context?: Record<string, unknown>;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
