/**
 * GUARD — the lane toggles (Chat | Matrx | Auto | Plugins | Subagents) are an
 * independent AND gate ABOVE the source tree. Arman, 2026-09-18: the tree's
 * "Select all" re-admitted every outside and automated conversation, with no
 * easy way back. Whatever the tree selects, a lane that is off stays off.
 *
 * Drives the REAL reducer and the REAL filter composition the fetch thunk
 * uses (`historyFilterInputFromScope` → `applyHistoryFilters`) against a
 * recording stand-in for the PostgREST builder.
 */
import reducer, {
  configureScope,
  setScopeLanes,
  setScopeSourceFilter,
} from "../slice";
import {
  applyHistoryFilters,
  historyFilterInputFromScope,
  type HistoryFilterable,
} from "../history-filters";
import {
  DEFAULT_CONVERSATION_LANES,
  normalizeLanes,
  toggleLane,
} from "../lanes";
import type { ConversationHistoryState } from "../types";

type Call = [string, ...unknown[]];

class RecordingQuery implements HistoryFilterable<RecordingQuery> {
  calls: Call[] = [];
  neq(column: string, value: string) {
    this.calls.push(["neq", column, value]);
    return this;
  }
  or(filters: string) {
    this.calls.push(["or", filters]);
    return this;
  }
  in(column: string, values: readonly string[]) {
    this.calls.push(["in", column, [...values]]);
    return this;
  }
}

const SCOPE = "chat-sidebar";

function stateWithDefaultLanes(): ConversationHistoryState {
  let state = reducer(undefined, { type: "@@init" });
  state = reducer(state, configureScope({ scopeId: SCOPE }));
  return reducer(
    state,
    setScopeLanes({ scopeId: SCOPE, lanes: [...DEFAULT_CONVERSATION_LANES] }),
  );
}

function laneFilter(state: ConversationHistoryState): unknown {
  const q = new RecordingQuery();
  const out = applyHistoryFilters(
    q,
    historyFilterInputFromScope(state.scopes[SCOPE]),
  );
  if (out === null) return "NO_QUERY";
  const lane = q.calls.find((c) => c[0] === "in" && c[1] === "lane");
  return lane ? lane[2] : "NO_LANE_GATE";
}

describe("conversation lane gate", () => {
  it("defaults to Chat + Matrx", () => {
    expect(normalizeLanes(undefined)).toEqual(["chat", "matrx"]);
    expect(laneFilter(stateWithDefaultLanes())).toEqual(["chat", "matrx"]);
  });

  it("'Select all' in the source tree never re-admits an off lane", () => {
    // Exactly what the tree's Select all commits: every feature it knows,
    // plugin and sub-agent sources included, plus the Generic node.
    const state = reducer(
      stateWithDefaultLanes(),
      setScopeSourceFilter({
        scopeId: SCOPE,
        includeSourceFeatures: [
          "chat",
          "claude-code",
          "codex",
          "cursor",
          "vscode",
          "rag_pdf_page_cleaner",
          "server-run",
          "workflow_run",
        ],
        includeSourceApps: [],
        includeEmptySource: true,
      }),
    );
    expect(state.scopes[SCOPE].includeLanes).toEqual(["chat", "matrx"]);
    expect(laneFilter(state)).toEqual(["chat", "matrx"]);
  });

  it("a whole-app selection (code-plugin) cannot widen the lanes either", () => {
    const state = reducer(
      stateWithDefaultLanes(),
      setScopeSourceFilter({
        scopeId: SCOPE,
        includeSourceFeatures: [],
        includeSourceApps: ["code-plugin", "aidream", "matrx-scheduler"],
        includeEmptySource: false,
        includeOriginClasses: [],
      }),
    );
    expect(laneFilter(state)).toEqual(["chat", "matrx"]);
  });

  it("turning a hidden lane on is an explicit toggle", () => {
    const lanes = toggleLane(DEFAULT_CONVERSATION_LANES, "plugin");
    expect(lanes).toEqual(["chat", "matrx", "plugin"]);
    const state = reducer(
      stateWithDefaultLanes(),
      setScopeLanes({ scopeId: SCOPE, lanes }),
    );
    expect(laneFilter(state)).toEqual(["chat", "matrx", "plugin"]);
  });

  it("every lane off runs no query (the list is honestly empty)", () => {
    const state = reducer(
      stateWithDefaultLanes(),
      setScopeLanes({ scopeId: SCOPE, lanes: [] }),
    );
    expect(laneFilter(state)).toBe("NO_QUERY");
  });

  it("a surface without a lane gate (null) adds no lane filter", () => {
    let state = reducer(undefined, { type: "@@init" });
    state = reducer(state, configureScope({ scopeId: SCOPE }));
    expect(laneFilter(state)).toBe("NO_LANE_GATE");
  });
});
