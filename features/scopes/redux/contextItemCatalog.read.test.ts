import { configureStore } from "@reduxjs/toolkit";
import { readScopeTypeFields } from "./contextItemCatalog";
import scopesReducer from "./scopesSlice";
import { scopeDoors } from "../service/scopeDoors";

jest.mock("../service/scopeDoors", () => ({
  scopeDoors: jest.fn(),
  unwrapRecords: (result: { ok: boolean; data?: unknown; error?: { message: string } }) => {
    if (!result.ok) throw new Error(result.error?.message);
    return result.data;
  },
}));

it("surfaces a store refusal, retries it, and reuses the accepted canonical catalog", async () => {
  const fields = jest.fn()
    .mockResolvedValueOnce({ ok: false, error: { message: "The store refused this request." } })
    .mockResolvedValueOnce({ ok: true, data: [] });
  jest.mocked(scopeDoors).mockReturnValue({ fields } as unknown as ReturnType<typeof scopeDoors>);
  const store = configureStore({ reducer: { scopesTree: scopesReducer } });
  await expect(store.dispatch(readScopeTypeFields("type-one"))).rejects.toThrow("The store refused this request.");
  await expect(store.dispatch(readScopeTypeFields("type-one"))).resolves.toEqual([]);
  await expect(store.dispatch(readScopeTypeFields("type-one"))).resolves.toEqual([]);
  expect(fields).toHaveBeenCalledTimes(2);
  expect(fields).toHaveBeenLastCalledWith(["type-one"]);
});
