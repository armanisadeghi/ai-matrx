/**
 * A FILE'S CONTEXT CELL SAYS A REFUSED READ (lane SCOPES-REVIEW-FIXES r2, 2026-10-10). The cells read a
 * private row-scope store that recorded `[]` for every row when the bulk tag read was refused, so a
 * refused page showed every file as "no context". The cells now read the holder
 * (`entityScopesByKey`), filled by `ensureEntityScopesBulk`: a refusal is the row's, and the cell
 * says so with the store's sentence. RED before: no holder entry, the cell read the private store.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { ensureEntityScopesBulk } from "@/features/scopes/redux/thunks/ensureEntityScopes";

const mockBulk = jest.fn();
jest.mock("@/features/scopes/service/scopesService", () => ({
  scopesService: { getEntityScopesBulk: (...a: unknown[]) => mockBulk(...a) },
}));
jest.mock("@/features/scopes/components/context-assignment/ContextStatusButton", () => ({
  ContextStatusButton: ({ knownScopeCount }: { knownScopeCount?: number }) => <span data-count={knownScopeCount}>tags</span>,
}));

import { FileContextCell } from "../FileContextCell";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  mockBulk.mockReset();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function store() {
  return configureStore({ reducer: createSlimRootReducer(), middleware: (g) => g({ serializableCheck: false, immutableCheck: false }) });
}

it("a refused page read shows the refusal in the cell, never 'no context'", async () => {
  mockBulk.mockResolvedValue({ ok: false, error: { code: "door", message: "You do not have access to this record." } });
  const s = store();
  await s.dispatch(ensureEntityScopesBulk("file", ["f1"]));
  await act(async () => root.render(<Provider store={s}><FileContextCell fileId="f1" fileName="QME.pdf" /></Provider>));
  const said = host.querySelector("[title]");
  expect(said?.textContent).toBe("Not loaded");
  expect(said?.getAttribute("title")).toBe("You do not have access to this record.");
  expect(host.querySelector("[data-count]")).toBeNull();
});

it("a read page shows each row's tag count", async () => {
  mockBulk.mockResolvedValue({ ok: true, data: { byEntity: { f1: ["s1", "s2"] } } });
  const s = store();
  await s.dispatch(ensureEntityScopesBulk("file", ["f1", "f2"]));
  await act(async () => root.render(<Provider store={s}><FileContextCell fileId="f1" fileName="QME.pdf" /></Provider>));
  expect(host.querySelector("[data-count]")?.getAttribute("data-count")).toBe("2");
  expect(mockBulk).toHaveBeenCalledWith("file", ["f1", "f2"]);
});
