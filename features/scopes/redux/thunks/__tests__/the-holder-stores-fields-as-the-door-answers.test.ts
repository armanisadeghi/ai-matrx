/**
 * THE HOLDER STORES A TYPE'S FIELDS AS THE DOOR ANSWERS THEM (lane SCOPES-REVIEW-FIXES, 2026-10-09).
 * The field door answers each type's fields in their order (`sort`, then label) and the records
 * client sends one read for identical asks in flight, so the host keeps no sort and no in-flight map
 * of its own. RED before: `ensureScopeTypeItems` re-sorted the answer (the door's order lost) and a
 * refused read could leave a stale `loading` that a module map held.
 */
import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer, type RootState } from "@/lib/redux/rootReducer";
import { ensureScopeTypeItems } from "@/features/scopes/redux/thunks/ensureScopeTypeItems";
import { readScopeTypeFields, selectItemsByType } from "@/features/scopes/redux/contextItemCatalog";

const TYPE = "5155b79c-4c54-4694-b644-2e21ea6833b7";
const field = (id: string, label: string, sort: number) => ({ id, label, key: label.toLowerCase(), sort, scope_type_id: TYPE });

const mockFields = jest.fn();
jest.mock("@/features/scopes/service/scopeDoors", () => ({
  ...jest.requireActual("@/features/scopes/service/scopeDoors"),
  scopeDoors: () => ({ fields: (...a: unknown[]) => mockFields(...a), systemItems: jest.fn() }),
}));

function store() {
  return configureStore({ reducer: createSlimRootReducer(), middleware: (g) => g({ serializableCheck: false, immutableCheck: false }) });
}

beforeEach(() => mockFields.mockReset());

it("keeps the door's order and reads a ready type once", async () => {
  // The door's own order (a label tie broken by the store, not by the host).
  mockFields.mockResolvedValue({ ok: true, data: [field("b", "Zip", 1), field("a", "Address", 1)] });
  const s = store();
  await s.dispatch(ensureScopeTypeItems(TYPE));
  await s.dispatch(ensureScopeTypeItems(TYPE));
  expect(selectItemsByType(s.getState() as RootState, TYPE).map((f) => f.id)).toEqual(["b", "a"]);
  expect(mockFields).toHaveBeenCalledTimes(1);
});

it("a refused read is the reader's error, never an empty list", async () => {
  mockFields.mockResolvedValue({ ok: false, error: { code: "door", message: "You do not have access to this record." } });
  const s = store();
  await expect(s.dispatch(readScopeTypeFields(TYPE))).rejects.toThrow("You do not have access to this record.");
});
