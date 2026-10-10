import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { readScopeTypeFields } from "./contextItemCatalog";
import { scopeDoors } from "../service/scopeDoors";

jest.mock("../service/scopeDoors", () => ({ scopeDoors: jest.fn() }));

it("surfaces a store refusal, retries it, and reuses the accepted canonical catalog", async () => {
  const fields = jest.fn()
    .mockResolvedValueOnce({ ok: false, error: { code: "door", message: "The store refused this request." } })
    .mockResolvedValueOnce({ ok: true, data: [] });
  jest.mocked(scopeDoors).mockReturnValue({ fields } as unknown as ReturnType<typeof scopeDoors>);
  // The app's own root reducer, so the thunk's `RootState` is the store's state.
  const store = configureStore({ reducer: createSlimRootReducer() });
  await expect(store.dispatch(readScopeTypeFields("type-one"))).rejects.toThrow("The store refused this request.");
  await expect(store.dispatch(readScopeTypeFields("type-one"))).resolves.toEqual([]);
  await expect(store.dispatch(readScopeTypeFields("type-one"))).resolves.toEqual([]);
  expect(fields).toHaveBeenCalledTimes(2);
  expect(fields).toHaveBeenLastCalledWith(["type-one"]);
});
