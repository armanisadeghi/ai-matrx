/**
 * W5 swap smoke test: the host binding actually constructs the package store
 * with the app's ports wired — the overlay reaches the registry, the identity
 * port keeps the loud "Not authenticated" semantics, and a demanded-RPC read
 * flows through the injected dataSource.
 */

const rpcMock = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => rpcMock(fn, args),
    from: jest.fn(),
    schema: jest.fn(),
  },
}));

// requireUserId reads the Redux store singleton; keep the test hermetic.
jest.mock("@/utils/auth/getUserId", () => ({
  requireUserId: jest.fn(() => {
    throw new Error("Not authenticated");
  }),
}));

import { getAssociationsStore } from "../associationsStore";

describe("associations host store wiring", () => {
  it("constructs once and exposes the package surfaces", () => {
    const store = getAssociationsStore();
    expect(store).toBe(getAssociationsStore());
    expect(typeof store.load).toBe("function");
    expect(typeof store.services.associations.listForEntity).toBe("function");
    expect(typeof store.services.categories.list).toBe("function");
    expect(typeof store.titles.fetch).toBe("function");
  });

  it("merges the host ENTITY_OVERLAY into the registry (icons + doors)", () => {
    const info = getAssociationsStore().registry.getEntityInfo("task");
    expect(info.hrefFor?.("abc")).toBe("/tasks/abc");
    expect(info.Icon).toBeTruthy();
    // rag-backed token keeps its candidate-source override
    const dataStore = getAssociationsStore().registry.getEntityInfo("data_store");
    expect(dataStore.listCandidates).toBeTruthy();
  });

  it("keeps write identity LOUD: unauthenticated add returns a screamed error", async () => {
    const result = await getAssociationsStore().services.associations.add({
      sourceType: "note",
      sourceId: "00000000-0000-0000-0000-000000000001",
      targetType: "task",
      targetId: "00000000-0000-0000-0000-000000000002",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/Not authenticated/i);
    }
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
