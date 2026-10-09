import { configureStore } from "@reduxjs/toolkit";
import {
  seedAgentFromTemplate,
} from "@ai-matrx/chat/agents/redux/agent-definition/slice";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { setUserAuth } from "@/lib/redux/slices/userAuthSlice";
import { setOrganization } from "@/lib/redux/slices/appContextSlice";
import {
  applyOwnedAgentToolDelta,
} from "@/features/agents/redux/builder-tier.thunks";
import { supabase } from "@ai-matrx/chat/host/db";
import { selectModelById } from "@ai-matrx/agents/models";
import {
  resolveModelControls,
  supportsTools,
} from "@ai-matrx/chat/agents/hooks/useModelControls";

import {
  setAgentField,
} from "@/features/agents/redux/agent-builder.slice";
jest.mock("@ai-matrx/chat/host/db", () => ({
  supabase: { schema: jest.fn() },
}));
jest.mock("@ai-matrx/agents/models", () => ({
  ...jest.requireActual("@ai-matrx/agents/models"),
  selectModelById: jest.fn(),
}));
jest.mock("@ai-matrx/chat/agents/identity/model-catalog", () => ({ readModelRecords: () => ({}) }));
jest.mock("@ai-matrx/chat/agents/hooks/useModelControls", () => ({
  resolveModelControls: jest.fn(),
  supportsTools: jest.fn(),
}));

const base = {
  id: "agent-1",
  created_by: "owner-1",
  organization_id: "org-1",
  version: 7,
  tools: ["old", "kept"],
  model_id: "model-1",
  is_archived: false,
};
const ok = (data: unknown) => ({ data, error: null });
function store() {
  const testStore = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });
  testStore.dispatch(setUserAuth({ id: "owner-1" }));
  testStore.dispatch(setOrganization({ id: "org-1", name: "Org" }));
  return testStore;
}
function db(
  reads = [ok(base)],
  tools = ok([{ id: "new" }]),
  writes = [ok({ ...base, version: 8, tools: ["kept", "new"] })],
) {
  const read = [...reads],
    write = [...writes];
  const update = jest.fn(() => chain("write"));
  function chain(kind: string): Record<string, unknown> {
    const q: Record<string, unknown> = {
      eq: () => q,
      is: () => q,
      in: () => q,
      select: () => q,
      update,
      maybeSingle: () => (kind === "write" ? write.shift() : read.shift()),
      then: (resolve: (v: unknown) => unknown) =>
        resolve(kind === "tool" ? tools : ok([])),
    };
    return q;
  }
  jest
    .mocked(supabase.schema)
    .mockImplementation(
      (schema: string) =>
        ({ from: () => chain(schema === "tool" ? "tool" : "read") }) as never,
    );
  return update;
}
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(selectModelById).mockReturnValue({
    _fetchType: "full",
    is_deprecated: false,
    deleted_at: null,
    retired_at: null,
  } as never);
  jest
    .mocked(resolveModelControls)
    .mockReturnValue({ normalizedControls: {} } as never);
  jest.mocked(supportsTools).mockReturnValue(true);
});

describe("applyOwnedAgentToolDelta", () => {
  it("freshly reads and CAS writes only tools/version while preserving other tools and dirty state", async () => {
    const update = db();
    const s = store();
    s.dispatch(seedAgentFromTemplate({ id: base.id, name: "Agent" }));
    s.dispatch(
      setAgentField({ id: base.id, field: "description", value: "dirty" }),
    );
    await expect(
      s
        .dispatch(
          applyOwnedAgentToolDelta({
            agentId: base.id,
            addToolIds: ["new"],
            removeToolIds: ["old"],
          }),
        )
        .unwrap(),
    ).resolves.toMatchObject({ version: 8 });
    expect(update).toHaveBeenCalledWith({ tools: ["kept", "new"], version: 8 });
    expect(
      s.getState().agentDefinition.agents[base.id]._dirtyFields.description,
    ).toBe(true);
  });
  it("lets an owner change the tools of an agent in ANOTHER organization than the active one", async () => {
    // Law: the active organization never decides access to a record — the agent's own org does.
    const elsewhere = { ...base, organization_id: "org-2" };
    const update = db([ok(elsewhere)], ok([{ id: "new" }]), [
      ok({ ...elsewhere, version: 8, tools: ["kept", "new"] }),
    ]);
    await expect(
      store()
        .dispatch(applyOwnedAgentToolDelta({ agentId: base.id, addToolIds: ["new"], removeToolIds: ["old"] }))
        .unwrap(),
    ).resolves.toMatchObject({ version: 8 });
    expect(update).toHaveBeenCalled();
  });
  it.each([
    [ok([]), [ok(base)], /unavailable or inactive/],
    [
      ok([{ id: "new" }]),
      [ok({ ...base, created_by: "other" })],
      /Only the agent owner/,
    ],
    [
      ok([{ id: "new" }]),
      [ok({ ...base, is_archived: true })],
      /Restore this archived/,
    ],
  ])(
    "refuses invalid, foreign, or archived rows before update",
    async (tools, reads, message) => {
      const update = db(reads as never, tools);
      await expect(
        store()
          .dispatch(
            applyOwnedAgentToolDelta({ agentId: base.id, addToolIds: ["new"] }),
          )
          .unwrap(),
      ).rejects.toMatchObject({
        name: "AgentToolAssignmentError",
        message: expect.stringMatching(message),
      });
      expect(update).not.toHaveBeenCalled();
    },
  );
  it("refuses unavailable and incapable models before update", async () => {
    jest.mocked(selectModelById).mockReturnValue(undefined);
    let update = db();
    await expect(
      store()
        .dispatch(
          applyOwnedAgentToolDelta({ agentId: base.id, addToolIds: ["new"] }),
        )
        .unwrap(),
    ).rejects.toMatchObject({
      name: "AgentToolAssignmentError",
      message: expect.stringMatching(/model is not available/),
    });
    expect(update).not.toHaveBeenCalled();
    jest.mocked(selectModelById).mockReturnValue({
      _fetchType: "full",
      is_deprecated: false,
      deleted_at: null,
      retired_at: null,
    } as never);
    jest.mocked(supportsTools).mockReturnValue(false);
    update = db();
    await expect(
      store()
        .dispatch(
          applyOwnedAgentToolDelta({ agentId: base.id, addToolIds: ["new"] }),
        )
        .unwrap(),
    ).rejects.toMatchObject({
      name: "AgentToolAssignmentError",
      message: expect.stringMatching(/does not support tools/),
    });
    expect(update).not.toHaveBeenCalled();
  });
  it("retries a phantom version miss but conflicts on tools, model, owner, org, or archive changes", async () => {
    let update = db(
      [ok(base), ok({ ...base, version: 9 })],
      ok([{ id: "new" }]),
      [ok(null), ok({ ...base, version: 10, tools: [...base.tools, "new"] })],
    );
    await expect(
      store()
        .dispatch(
          applyOwnedAgentToolDelta({ agentId: base.id, addToolIds: ["new"] }),
        )
        .unwrap(),
    ).resolves.toMatchObject({ rebased: true });
    expect(update).toHaveBeenCalledTimes(2);
    for (const changed of [
      { tools: ["other"] },
      { model_id: "other" },
      { created_by: "other" },
      { organization_id: "other" },
      { is_archived: true },
    ]) {
      update = db(
        [ok(base), ok({ ...base, version: 9, ...changed })],
        ok([{ id: "new" }]),
        [ok(null)],
      );
      await expect(
        store()
          .dispatch(
            applyOwnedAgentToolDelta({ agentId: base.id, addToolIds: ["new"] }),
          )
          .unwrap(),
      ).rejects.toMatchObject({
        name: "AgentToolAssignmentConflictError",
        message: expect.stringMatching(/changed while you were editing/),
      });
      expect(update).toHaveBeenCalledTimes(1);
    }
  });
});
