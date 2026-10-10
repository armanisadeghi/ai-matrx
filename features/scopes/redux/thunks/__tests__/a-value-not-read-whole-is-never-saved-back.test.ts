/**
 * A SCOPE VALUE THAT WAS NOT READ WHOLE IS NEVER SAVED BACK AS IF IT WERE (lane 9, D1 follow-up).
 *
 * Use case: Castellano & Reyes' workers' compensation matter; the official QME report (~140,000
 * characters) is kept as a file. When the screen could not read the file, the cell shows the first
 * 1000 characters plus a sentence naming the file, and carries `value_incomplete`. Every scope value
 * editor (the value sheet, the inline autosave field) seeds its draft from that text and writes
 * through THE one write path, the `setContextValue` thunk.
 *
 * The break: the thunk writes the seeded partial — or the partial with an edit — over the real
 * report (today's code: no check). The door (`scopeStore.setContextValue`) is the network, stubbed
 * with what it answers; the thunk, the store state and the refusal rule are real.
 */
import { configureStore } from "@reduxjs/toolkit";

const writeValue = jest.fn();
jest.mock("@/features/scopes/service/scopeDoors", () => ({ scopeDoors: () => ({ writeValue }) }));

// eslint-disable-next-line import/first
import contextValuesReducer, { contextValuesActions } from "@/features/scopes/redux/contextValuesSlice";
// eslint-disable-next-line import/first
import { setContextValue } from "../setContextValue";
// eslint-disable-next-line import/first
import type { ContextValue, IncompleteValue } from "@ai-matrx/records/scopes";

const REPORT = Array.from(
  { length: 900 },
  (_, i) => `Page ${i + 1}. Panel QME Dr. Miriam Okafor: whole person impairment ${8 + (i % 7)}% (AMA Guides, 5th edition).`,
).join("\n");
const HEAD = REPORT.slice(0, 1000);
const FILE = "0d4f6a2e-1111-4c3b-8e5f-9a8b7c6d5e4f";
const MATTER = "2645730c-97a9-4080-9471-2546d0ce2b66";
const REPORT_ITEM = "054c12b6-fac9-45b3-a022-5cedc24ed2b2";
const STATUS_ITEM = "b56e062d-3a24-471a-b18e-37c31a33b374";
const STATUS = "Open — awaiting rating from the Disability Evaluation Unit";

function cell(fieldId: string, text: string, incomplete: IncompleteValue | null = null): ContextValue {
  return {
    scope_id: MATTER, field_id: fieldId, key: fieldId, kind: "string", value: text, references: [], version: 4,
    set_at: "2026-09-25T09:12:24Z", source_type: "manual", authored_by: null, whole_value: null, incomplete,
  };
}

function storeWithMatter() {
  const store = configureStore({ reducer: { contextValues: contextValuesReducer } });
  store.dispatch(contextValuesActions.valuesFetchFulfilled({
    scopeId: MATTER,
    values: [
      // The package keeps a cell not read whole as its first words, with `incomplete` saying why.
      cell(REPORT_ITEM, HEAD, { head: HEAD, chars: [...REPORT].length, file_id: FILE, why: "404 Not Found" }),
      cell(STATUS_ITEM, STATUS),
    ],
  }));
  return store;
}

async function save(fieldId: string, text: string) {
  const store = storeWithMatter();
  const thunk = setContextValue({ scope_id: MATTER, field_id: fieldId, kind: "string", value: text, source_type: "manual" });
  return thunk(store.dispatch, store.getState as never, undefined);
}

beforeEach(() => {
  writeValue.mockReset();
  writeValue.mockImplementation(async (w: { scope_id: string; field_id: string }) => ({
    ok: true,
    data: { scope_id: w.scope_id, field_id: w.field_id, version: 5, source_type: "manual" },
  }));
});

describe("a cell that holds only the start of its value", () => {
  it.each([
    ["saved as it was shown", HEAD],
    ["saved as its first words with an edit", `${HEAD}\nAddendum: supplemental report requested 2026-10-01.`],
  ])("is refused when %s, and nothing is written", async (_how, draft) => {
    const res = await save(REPORT_ITEM, draft);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error.message).toBe("Only the start of this value loaded. Paste the whole text to replace it.");
    expect(writeValue).not.toHaveBeenCalled();
  });

  it("is written when the person replaces it with the whole revised report", async () => {
    const revised = REPORT.replace("whole person impairment 8%", "whole person impairment 9%");
    const res = await save(REPORT_ITEM, revised);
    expect(res.ok).toBe(true);
    expect(writeValue).toHaveBeenCalledWith(expect.objectContaining({ value: revised }));
  });
});

it("a value read whole is written as shown (the guard touches only cells not read whole)", async () => {
  const res = await save(STATUS_ITEM, STATUS);
  expect(res.ok).toBe(true);
  expect(writeValue).toHaveBeenCalledWith(expect.objectContaining({ value: STATUS }));
});
