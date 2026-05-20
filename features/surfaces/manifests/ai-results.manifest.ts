/**
 * Surface manifest — AI results / conversation history (`matrx-user/ai-results`).
 *
 * Cross-agent conversation history viewer. The user browses past agent runs
 * across all agents and opens one to inspect its output.
 *
 * Agents bound here operate on a selected past run — judge it, summarize it,
 * re-run a variation. Complements `matrx-user/agent-run` (a single live run);
 * this is the historical browser.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "selected_conversation_id",
    label: "Selected conversation ID",
    description:
      "UUID of the past conversation/run the user has selected. Empty when none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 300,
  },
  {
    name: "selected_conversation_title",
    label: "Selected conversation title",
    description:
      "Title of the selected past run. Empty when none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 80,
    sortOrder: 310,
  },
  {
    name: "selected_conversation_agent_id",
    label: "Selected run agent ID",
    description:
      "UUID of the agent that produced the selected run. Empty when none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 320,
  },
  {
    name: "selected_conversation_agent_name",
    label: "Selected run agent name",
    description:
      "Name of the agent that produced the selected run. Empty when none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 325,
  },
  {
    name: "selected_conversation_message_count",
    label: "Selected run message count",
    description:
      "Number of messages in the selected run. Zero when none is selected.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 330,
  },
  {
    name: "selected_run_status",
    label: "Selected run status",
    description:
      '"complete", "error", "cancelled", etc. — final status of the selected run. Empty when none is selected.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 335,
  },
  {
    name: "last_run_text",
    label: "Last run output",
    description:
      "Text of the final assistant message in the selected run. Empty when none is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    sortOrder: 340,
  },
  {
    name: "agent_filter",
    label: "Agent filter",
    description:
      "Array of agent IDs the history view is currently filtered to. Empty array when unfiltered.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 360,
  },
  {
    name: "grouping_mode",
    label: "Grouping mode",
    description:
      "How the history list is currently grouped (e.g. \"agent\", \"date\", \"none\"). Empty when default.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 365,
  },
  {
    name: "search_query",
    label: "Search query",
    description:
      "Active history search string. Empty when the search box is blank.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 60,
    sortOrder: 370,
  },
];

export const aiResultsManifest: SurfaceManifest = {
  surfaceName: "matrx-user/ai-results",
  values: mergeBaselineValues(
    pickBaseline("selection", "content", "context"),
    surfaceSpecific,
  ),
};

export function createAiResultsScope(values: {
  selection?: string;
  content?: string;
  context?: Record<string, unknown>;
  selected_conversation_id?: string;
  selected_conversation_title?: string;
  selected_conversation_agent_id?: string;
  selected_conversation_agent_name?: string;
  selected_conversation_message_count?: number;
  selected_run_status?: string;
  last_run_text?: string;
  agent_filter?: string[];
  grouping_mode?: string;
  search_query?: string;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
