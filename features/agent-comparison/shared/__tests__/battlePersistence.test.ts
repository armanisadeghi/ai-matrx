import type { RootState } from "@/lib/redux/store";
import { OrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";

const createComparisonSet = jest.fn();
const replaceEntries = jest.fn();
const updateComparisonSetMetadata = jest.fn();
const renameComparisonSet = jest.fn();

jest.mock("../../service/comparisonSetsService", () => ({
  createComparisonSet: (...args: unknown[]) => createComparisonSet(...args),
  replaceEntries: (...args: unknown[]) => replaceEntries(...args),
  updateComparisonSetMetadata: (...args: unknown[]) =>
    updateComparisonSetMetadata(...args),
  renameComparisonSet: (...args: unknown[]) => renameComparisonSet(...args),
}));

const selectUserId = jest.fn();
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: (...args: unknown[]) => selectUserId(...args),
}));

import {
  createBattlePersistence,
  NOTHING_TO_SAVE,
  persistForRun,
  type BattlePersistenceConfig,
} from "../battlePersistence";

const FAKE_STATE = {
  agentDefinition: { agents: { "agent-1": { name: "Support Agent" } } },
} as unknown as RootState;

function baseConfig(
  overrides: Partial<BattlePersistenceConfig> = {},
): BattlePersistenceConfig {
  return {
    typePrefix: "agentComparisonModel",
    modeLabel: "Model battle",
    selectActiveSetId: () => null,
    selectActiveSetName: () => null,
    selectNamingAgentId: () => "agent-1",
    buildMetadata: () => ({ note: "locked axis" }),
    buildEntries: () => [
      {
        conversationId: "conv-1",
        displayOrder: 0,
        agentId: "agent-1",
        agentVersion: null,
        agentVersionSnapshotId: null,
      },
    ],
    setActive: (payload) => ({ type: "agentComparisonModel/setActive", payload }),
    ...overrides,
  };
}

const dispatch = jest.fn();
const getState = jest.fn(() => FAKE_STATE);

beforeEach(() => {
  jest.clearAllMocks();
  selectUserId.mockReturnValue("user-1");
  getState.mockReturnValue(FAKE_STATE);
});

describe("createBattlePersistence(...).persist", () => {
  it("creates a set, replaces entries, and dispatches setActive when there is no active set", async () => {
    createComparisonSet.mockResolvedValue({ id: "new-set-id", name: "auto name" });
    const config = baseConfig();
    const { persist } = createBattlePersistence(config);

    const result = await persist()(dispatch, getState, undefined).unwrap();

    expect(createComparisonSet).toHaveBeenCalledTimes(1);
    const createArgs = createComparisonSet.mock.calls[0][0];
    expect(createArgs.userId).toBe("user-1");
    expect(createArgs.metadata).toEqual({ note: "locked axis" });
    expect(createArgs.name).toContain("Support Agent");
    expect(createArgs.name).toContain("Model battle");

    expect(replaceEntries).toHaveBeenCalledWith(
      "new-set-id",
      config.buildEntries(FAKE_STATE),
    );
    expect(updateComparisonSetMetadata).not.toHaveBeenCalled();

    const setActiveDispatch = dispatch.mock.calls.find(
      (call) => call[0]?.type === "agentComparisonModel/setActive",
    );
    expect(setActiveDispatch?.[0].payload).toEqual({
      id: "new-set-id",
      name: "auto name",
    });
    expect(result.id).toBe("new-set-id");
    expect(result.created).toBe(true);
  });

  it("updates metadata and replaces entries on an existing set, and never creates or re-activates", async () => {
    const config = baseConfig({
      selectActiveSetId: () => "existing-set-id",
      selectActiveSetName: () => "Existing Battle",
    });
    const { persist } = createBattlePersistence(config);

    const result = await persist()(dispatch, getState, undefined).unwrap();

    expect(updateComparisonSetMetadata).toHaveBeenCalledWith("existing-set-id", {
      note: "locked axis",
    });
    expect(replaceEntries).toHaveBeenCalledWith(
      "existing-set-id",
      config.buildEntries(FAKE_STATE),
    );
    expect(createComparisonSet).not.toHaveBeenCalled();
    const setActiveDispatch = dispatch.mock.calls.find(
      (call) => call[0]?.type === "agentComparisonModel/setActive",
    );
    expect(setActiveDispatch).toBeUndefined();
    expect(result.created).toBe(false);
    expect(result.id).toBe("existing-set-id");
  });

  it("rejects with NOTHING_TO_SAVE and writes nothing when there are no entries to save", async () => {
    const config = baseConfig({ buildEntries: () => [] });
    const { persist } = createBattlePersistence(config);

    await expect(
      persist()(dispatch, getState, undefined).unwrap(),
    ).rejects.toMatchObject({ message: NOTHING_TO_SAVE });

    expect(createComparisonSet).not.toHaveBeenCalled();
    expect(replaceEntries).not.toHaveBeenCalled();
    expect(updateComparisonSetMetadata).not.toHaveBeenCalled();
  });
});

describe("persistForRun", () => {
  it("resolves {cancelled:false,error:null} when the run succeeds", async () => {
    const result = await persistForRun(async () => ({
      id: "set-1",
      name: "n",
      created: true,
    }));
    expect(result).toEqual({ cancelled: false, error: null });
  });

  it("resolves {cancelled:false,error:<message>} on a normal error", async () => {
    const result = await persistForRun(async () => {
      throw new Error("Could not reach the database.");
    });
    expect(result).toEqual({
      cancelled: false,
      error: "Could not reach the database.",
    });
  });

  it("resolves {cancelled:true,error:null} when the organization picker was cancelled", async () => {
    const result = await persistForRun(async () => {
      throw new OrganizationSelectionCancelled();
    });
    expect(result).toEqual({ cancelled: true, error: null });
  });
});
