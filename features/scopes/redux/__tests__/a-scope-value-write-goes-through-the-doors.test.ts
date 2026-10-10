// A person's value edit leaves the holder as ONE ContextValueWrite through scopeDoors().writeValue
// (the doors are mocked; the network never is), and the holder's cell takes the store's version.

import { configureStore } from "@reduxjs/toolkit";
import type { ContextValueWrite } from "@ai-matrx/records/scopes";

const writeValue = jest.fn();
jest.mock("@/features/scopes/service/scopeDoors", () => ({
  scopeDoors: () => ({ writeValue }),
  unwrapRecords: <T,>(r: { ok: boolean; data?: T; error?: { message: string } }) => {
    if (r.ok) return r.data as T;
    throw new Error(r.error?.message);
  },
  readScopeFileText: jest.fn(),
}));

import contextValues from "@/features/scopes/redux/contextValuesSlice";
import { setScopeContextValue } from "@/features/scopes/redux/scopeContextView";

describe("a scope value write", () => {
  beforeEach(() => writeValue.mockReset());

  it("sends exactly the ContextValueWrite (manual) and stores the written cell", async () => {
    writeValue.mockResolvedValue({ ok: true, data: { scope_id: "s1", field_id: "f1", version: 4, source_type: "manual" } });
    const store = configureStore({ reducer: { contextValues } });
    const write: ContextValueWrite = { scope_id: "s1", field_id: "f1", kind: "string", value: "Formal, brief" };
    const out = await store.dispatch(setScopeContextValue(write) as never);
    expect(writeValue).toHaveBeenCalledTimes(1);
    expect(writeValue).toHaveBeenCalledWith({ source_type: "manual", ...write });
    expect((out as { type: string }).type).toBe("contextValues/setScopeContextValue/fulfilled");
    const cell = store.getState().contextValues.byScope.s1?.values.f1;
    expect(cell).toMatchObject({ value: "Formal, brief", version: 4, kind: "string" });
    expect(store.getState().contextValues.savingPairs).toEqual({});
  });

  it("a refusal comes back in the store's words and nothing is stored", async () => {
    writeValue.mockResolvedValue({ ok: false, error: { code: "refused_by_rule", message: "This value is too long." } });
    const store = configureStore({ reducer: { contextValues } });
    const out = await store.dispatch(
      setScopeContextValue({ scope_id: "s1", field_id: "f1", kind: "string", value: "x" }) as never,
    );
    expect((out as { error?: { message?: string } }).error?.message).toBe("This value is too long.");
    expect(store.getState().contextValues.byScope.s1?.values.f1).toBeUndefined();
  });
});
