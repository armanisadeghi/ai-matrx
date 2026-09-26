import type { RootState } from "@/lib/redux/store";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import {
  selectActiveBattleColumns,
  selectMountedBattleSetId,
} from "../activeBattleColumns";

const baseState = createSlimRootReducer()(undefined, { type: "test/init" });

/**
 * Builds a state where BOTH the "model" slice and the "settings" slice carry
 * columns/an active set — the exact shape that used to fool the old
 * "first non-empty slice in a priority order" resolver. Only `mountedMode`
 * should decide which one comes back.
 */
function multiModeState(mountedMode: RootState["agentComparison"]["mountedMode"]): RootState {
  return {
    ...baseState,
    agentComparison: {
      ...baseState.agentComparison,
      mountedMode,
      columns: [
        { columnId: "open-col", conversationId: "open-conv", agentId: "agent-open", agentVersion: "current" },
      ],
      activeSetId: "set-open",
    },
    agentComparisonSettings: {
      ...baseState.agentComparisonSettings,
      locked: { agentId: "agent-settings", agentVersion: 2, agentVersionId: "v2" },
      columns: [
        { columnId: "settings-col", conversationId: "settings-conv", label: "Settings A", collapsed: false },
      ],
      activeSetId: "set-settings",
    },
    agentComparisonModel: {
      ...baseState.agentComparisonModel,
      locked: { agentId: "agent-model", agentVersion: "current", agentVersionId: null },
      columns: [
        { columnId: "model-col", conversationId: "model-conv", label: "Model A", collapsed: false },
      ],
      activeSetId: "set-model",
    },
    agentComparisonVariations: {
      ...baseState.agentComparisonVariations,
      locked: { sourceAgentId: "agent-variations", agentVersion: "current" },
      columns: [
        {
          columnId: "var-col",
          conversationId: "var-conv",
          label: "Variation A",
          collapsed: false,
          syntheticAgentId: "synthetic-1",
        },
      ],
      activeSetId: "set-variations",
    },
  } as unknown as RootState;
}

describe("selectActiveBattleColumns", () => {
  it("returns Settings' columns when Settings is mounted, even though Model also has columns", () => {
    const state = multiModeState("settings");
    const cols = selectActiveBattleColumns(state);
    expect(cols).toHaveLength(1);
    expect(cols[0]).toMatchObject({
      columnId: "settings-col",
      conversationId: "settings-conv",
      label: "Settings A",
      agentId: "agent-settings",
      agentVersion: 2,
      mode: "settings",
    });
  });

  it("returns Model's columns when Model is mounted, even though Settings also has columns", () => {
    const state = multiModeState("model");
    const cols = selectActiveBattleColumns(state);
    expect(cols).toHaveLength(1);
    expect(cols[0]).toMatchObject({
      columnId: "model-col",
      conversationId: "model-conv",
      label: "Model A",
      agentId: "agent-model",
      mode: "model",
    });
  });

  it("returns Variations' columns when Variations is mounted (the regression: it used to be missing entirely)", () => {
    const state = multiModeState("variations");
    const cols = selectActiveBattleColumns(state);
    expect(cols).toHaveLength(1);
    expect(cols[0]).toMatchObject({
      columnId: "var-col",
      conversationId: "var-conv",
      label: "Variation A",
      agentId: "agent-variations",
      mode: "variations",
    });
  });

  it("returns Open mode's columns with label undefined when Open is mounted", () => {
    const state = multiModeState("open");
    const cols = selectActiveBattleColumns(state);
    expect(cols).toHaveLength(1);
    expect(cols[0]).toMatchObject({
      columnId: "open-col",
      conversationId: "open-conv",
      agentId: "agent-open",
      agentVersion: "current",
      mode: "open",
    });
    expect(cols[0].label).toBeUndefined();
  });

  it("returns an empty array when no mode is mounted, regardless of other slices' columns", () => {
    const state = multiModeState(null);
    expect(selectActiveBattleColumns(state)).toEqual([]);
  });
});

describe("selectMountedBattleSetId", () => {
  it("returns Settings' active set id when Settings is mounted", () => {
    expect(selectMountedBattleSetId(multiModeState("settings"))).toBe("set-settings");
  });

  it("returns Model's active set id when Model is mounted", () => {
    expect(selectMountedBattleSetId(multiModeState("model"))).toBe("set-model");
  });

  it("returns Variations' active set id when Variations is mounted", () => {
    expect(selectMountedBattleSetId(multiModeState("variations"))).toBe("set-variations");
  });

  it("returns Open mode's active set id when Open is mounted", () => {
    expect(selectMountedBattleSetId(multiModeState("open"))).toBe("set-open");
  });

  it("returns null when no mode is mounted", () => {
    expect(selectMountedBattleSetId(multiModeState(null))).toBeNull();
  });
});
