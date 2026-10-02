// features/tool-call-visualization/renderers/topical-map/topicalMapResult.test.ts
//
// The `topical_map` tool's result envelope is the RPC's JSON under `action` +
// `map_id` (aidream tools/topical_map_tool.py `_shape`), and the reader must
// (1) find the tree under `topics` (whole map) or `topic` (one subtree),
// (2) keep the change-mode `note` — the sentence a rehearsed write must show,
// (3) put EVERYTHING else in `rest` so nothing is hidden. Watched failing
// first with `note` dropped from the reader: a `propose`-mode upsert rendered
// as if it had written.

import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { DOCUMENTED_MAP_TREE } from "@/features/marketing/seo/topical-map/proposals/__fixtures__/mapTopicProposalDocumented";

import { TOPICAL_MAP_ACTION_LABELS, readTopicalMapResult, topicalMapActionOf } from "./topicalMapResult";

function entry(args: Record<string, unknown>, result: unknown): ToolLifecycleEntry {
  return {
    callId: "call-1",
    toolName: "topical_map",
    displayName: "topical_map",
    status: "completed",
    arguments: args,
    startedAt: "2026-09-18T00:00:00Z",
    completedAt: "2026-09-18T00:00:01Z",
    latestMessage: null,
    latestData: null,
    result,
    resultPreview: null,
    errorType: null,
    errorMessage: null,
    isDelegated: false,
    events: [],
  };
}

describe("readTopicalMapResult", () => {
  it("reads a whole-map tree under `topics`", () => {
    const read = readTopicalMapResult(
      entry({ action: "tree", map: DOCUMENTED_MAP_TREE.map_id }, { action: "tree", ...DOCUMENTED_MAP_TREE }),
    );
    expect(read?.action).toBe("tree");
    expect(read?.mapId).toBe(DOCUMENTED_MAP_TREE.map_id);
    expect(read?.tree?.map((t) => t.slug)).toEqual(["recycling"]);
    expect(read?.rest).toEqual({ total_topics: 5 });
  });

  it("reads one subtree under `topic` for `get`", () => {
    const subtree = DOCUMENTED_MAP_TREE.topics[0].children![0];
    const read = readTopicalMapResult(
      entry({ action: "get" }, { action: "get", map_id: "m", root: "metals", topic: subtree, capped: true }),
    );
    expect(read?.tree?.[0].slug).toBe("metals");
    expect(read?.capped).toBe(true);
    expect(read?.rest).toEqual({});
  });

  it("keeps the outline text and the change-mode note, and leaves the rest untouched", () => {
    const read = readTopicalMapResult(
      entry({ action: "outline" }, { action: "outline", map_id: "m", outline: "# Map\n- Recycling", note: "Rehearsed only." }),
    );
    expect(read?.outline).toBe("# Map\n- Recycling");
    expect(read?.note).toBe("Rehearsed only.");
    expect(read?.tree).toBeNull();

    const write = readTopicalMapResult(
      entry({ action: "upsert" }, { action: "upsert", map_id: "m", created: ["a"], updated: [], unchanged: [] }),
    );
    expect(write?.rest).toEqual({ created: ["a"], updated: [], unchanged: [] });
  });

  it("parses a JSON-string result and falls back to the argument for the action", () => {
    const read = readTopicalMapResult(entry({ action: "maps" }, JSON.stringify({ maps: [] })));
    expect(read?.action).toBe("maps");
    expect(topicalMapActionOf(entry({ action: "search" }, null))).toBe("search");
  });

  it("labels every action the tool implements", () => {
    const actions = [
      "maps", "create_map", "update_map", "use_map", "outline", "tree", "get", "search", "associations",
      "graph", "diagnostics", "upsert", "replace_section", "patch", "move", "merge", "split", "retire",
      "set_facet", "facet_values", "add_facet_values", "map_pages", "page_intents", "set_page_intents",
      "topic_gaps", "reject_topics", "map_history", "create_planned_page",
    ];
    for (const action of actions) expect(TOPICAL_MAP_ACTION_LABELS[action]).toBeDefined();
    expect(actions).toHaveLength(28);
  });
});
