/**
 * topicalMapResult.ts — reading ONE `topical_map` tool result (28 actions).
 *
 * The tool (aidream `tools/topical_map_tool.py`) is an action dispatcher whose
 * every result is the seo RPC's own JSON passed through under the contract's
 * keys, plus `action` and `map_id` — and, when a `propose` change mode turned
 * a write into a rolled-back rehearsal, a `note` the screen MUST show
 * (CONTRACTS §6). `tree` / `get` carry a `seo.map_tree` payload (`topics` for
 * the whole map, `topic` for one subtree, `capped: true` when the output
 * budget cut it); `outline` carries the text an agent reads.
 *
 * Pure — no React — so the labels and the parse are testable, and so the
 * canvas registry can ask "did this call make something the canvas can show"
 * without importing a component.
 */

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import type { MapTreeNode } from "@/features/marketing/seo/topical-map/types";

import { getArg, resultAsObject } from "../_shared";

export interface TopicalMapToolResult {
  action: string | null;
  mapId: string | null;
  /** `map_tree`'s nodes — whole map or the one subtree — when the action read a tree. */
  tree: MapTreeNode[] | null;
  /** The text outline when the action was `outline`. */
  outline: string | null;
  /** The change-mode gate's note (a write rehearsed, not applied). */
  note: string | null;
  /** True when the tool cut the tree to fit its output budget. */
  capped: boolean;
  /** Everything else the result carried, action / map_id removed. Never hidden. */
  rest: Record<string, unknown>;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function isTreeNode(value: unknown): value is MapTreeNode {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { slug?: unknown }).slug === "string" &&
    typeof (value as { name?: unknown }).name === "string"
  );
}

/** The verb-phrase labels for the slim row, per action. Unknown actions humanize. */
export const TOPICAL_MAP_ACTION_LABELS: Readonly<
  Record<string, { running: string; complete: string }>
> = {
  maps: { running: "Listing topical maps", complete: "Listed topical maps" },
  create_map: { running: "Creating a topical map", complete: "Created a topical map" },
  update_map: { running: "Updating the map", complete: "Updated the map" },
  use_map: { running: "Pointing the site at a map", complete: "Pointed the site at a map" },
  outline: { running: "Reading the map outline", complete: "Read the map outline" },
  tree: { running: "Reading the map tree", complete: "Read the map tree" },
  get: { running: "Reading a topic", complete: "Read a topic" },
  search: { running: "Searching topics", complete: "Searched topics" },
  associations: { running: "Reading a topic's attachments", complete: "Read a topic's attachments" },
  graph: { running: "Reading the map graph", complete: "Read the map graph" },
  diagnostics: { running: "Checking the map's health", complete: "Checked the map's health" },
  upsert: { running: "Writing topics", complete: "Wrote topics" },
  replace_section: { running: "Replacing a section", complete: "Replaced a section" },
  patch: { running: "Editing topics", complete: "Edited topics" },
  move: { running: "Moving a topic", complete: "Moved a topic" },
  merge: { running: "Merging topics", complete: "Merged topics" },
  split: { running: "Splitting a topic", complete: "Split a topic" },
  retire: { running: "Retiring topics", complete: "Retired topics" },
  set_facet: { running: "Setting a facet", complete: "Set a facet" },
  facet_values: { running: "Listing facet values", complete: "Listed facet values" },
  add_facet_values: { running: "Adding facet values", complete: "Added facet values" },
  map_pages: { running: "Placing pages on topics", complete: "Placed pages on topics" },
  page_intents: { running: "Reading page intents", complete: "Read page intents" },
  set_page_intents: { running: "Setting page intents", complete: "Set page intents" },
  topic_gaps: { running: "Finding topics with no page", complete: "Found topics with no page" },
  reject_topics: { running: "Rejecting topics", complete: "Rejected topics" },
  map_history: { running: "Reading the map's history", complete: "Read the map's history" },
  create_planned_page: { running: "Planning a page", complete: "Planned a page" },
};

/** Actions that CREATE or CHANGE the map — the ones a canvas pane is offered for. */
export const TOPICAL_MAP_WRITING_ACTIONS: ReadonlySet<string> = new Set([
  "create_map",
  "upsert",
  "replace_section",
  "patch",
  "move",
  "merge",
  "split",
  "retire",
  "reject_topics",
  "set_facet",
  "add_facet_values",
]);

export function humanizeAction(action: string | null): string {
  if (!action) return "Topical map";
  return action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function topicalMapActionOf(entry: ToolLifecycleEntry): string | null {
  const result = resultAsObject(entry);
  return str(result?.action) ?? getArg<string>(entry, "action") ?? null;
}

export function readTopicalMapResult(entry: ToolLifecycleEntry): TopicalMapToolResult | null {
  const result = resultAsObject(entry);
  if (!result) return null;
  const action = str(result.action) ?? getArg<string>(entry, "action") ?? null;

  let tree: MapTreeNode[] | null = null;
  if (Array.isArray(result.topics) && (action === "tree" || action === "get")) {
    tree = result.topics.filter(isTreeNode);
  } else if (isTreeNode(result.topic)) {
    tree = [result.topic];
  }

  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(result)) {
    if (key === "action" || key === "map_id") continue;
    if (tree && (key === "topics" || key === "topic" || key === "root" || key === "capped")) continue;
    if (action === "outline" && key === "outline") continue;
    if (key === "note") continue;
    rest[key] = value;
  }

  return {
    action,
    mapId: str(result.map_id) ?? getArg<string>(entry, "map") ?? null,
    tree,
    outline: action === "outline" ? str(result.outline) : null,
    note: str(result.note),
    capped: result.capped === true,
    rest,
  };
}
