/**
 * THE HUB TABLES READ THE HOLDER (lane SCOPES-REVIEW-FIXES r2, 2026-10-10). The hook used to keep a
 * React-state copy of fields and values and re-sort the fields; it now asks the holder's thunks and
 * reads `contextItemsByTypeId` / `contextValues.byScope`, in the door's order, and a refusal is its
 * error. Equal id sets in new arrays never ask again.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { useScopeTypeTables } from "./useScopeTypeTables";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockFields = jest.fn();
const mockValues = jest.fn();
jest.mock("@/features/scopes/service/scopeDoors", () => ({
  ...jest.requireActual("@/features/scopes/service/scopeDoors"),
  scopeDoors: () => ({ fields: (...a: unknown[]) => mockFields(...a), values: (...a: unknown[]) => mockValues(...a) }),
}));

const f = (id: string, sort: number) => ({ id, key: id, label: id, sort, scope_type_id: "type-a" });

function mount(typeIds: () => string[], scopeIds: () => string[]) {
  const store = configureStore({ reducer: createSlimRootReducer(), middleware: (g) => g({ serializableCheck: false, immutableCheck: false }) });
  const host = document.createElement("div");
  const root = createRoot(host);
  const out: { current?: ReturnType<typeof useScopeTypeTables> } = {};
  function Harness() {
    out.current = useScopeTypeTables(typeIds(), scopeIds());
    return null;
  }
  const render = () => act(async () => root.render(<Provider store={store}><Harness /></Provider>));
  return { out, render, unmount: () => act(() => root.unmount()) };
}

beforeEach(() => {
  mockFields.mockReset();
  mockValues.mockReset();
});

it("keeps the door's field order, reads once for equal id sets, and fills the cells", async () => {
  mockFields.mockResolvedValue({ ok: true, data: [f("z", 2), f("a", 1)] });
  mockValues.mockResolvedValue({ ok: true, data: [{ scope_id: "scope-a", field_id: "z", key: "z", kind: "string", value: "v", references: [], version: 1 }] });
  const m = mount(() => ["type-a"], () => ["scope-a"]);
  await m.render();
  await m.render();
  expect(m.out.current?.status).toBe("ready");
  expect(m.out.current?.itemsByType["type-a"]?.map((x) => x.id)).toEqual(["z", "a"]);
  expect(m.out.current?.valuesByScope["scope-a"]?.z?.value).toBe("v");
  expect(mockFields).toHaveBeenCalledTimes(1);
  expect(mockValues).toHaveBeenCalledTimes(1);
  m.unmount();
});

it("a refused read is the hook's error, never an empty table", async () => {
  mockFields.mockResolvedValue({ ok: false, error: { code: "door", message: "You do not have access to this record." } });
  mockValues.mockResolvedValue({ ok: true, data: [] });
  const m = mount(() => ["type-a"], () => ["scope-a"]);
  await m.render();
  expect(m.out.current?.status).toBe("error");
  expect(m.out.current?.error).toBe("You do not have access to this record.");
  m.unmount();
});
