// A TABLE SAVED FROM CHAT KEEPS ITS NUMBERS (lane HANDOVER, 2026-09-28).
//
// Cedar Ridge Physical Therapy asked the chat for five home exercises after knee surgery (Exercise,
// Body area, Sets, Reps) and pressed Convert to table. Every column was saved as text, so "Sets"
// (3, 3, 3, 2, 3) sorted as words and could not be summed or charted. A column is now typed by what
// EVERY value in it is; one value that is not ("10-15" in Reps) keeps the column text.

const created: Array<{ fields: Array<{ display_name: string; data_type: string }> }> = [];
jest.mock("../service", () => ({
  createTable: async (params: { fields: Array<{ display_name: string; data_type: string }> }) => {
    created.push(params);
    return { success: true, tableId: "5e8a1c3d-2f94-4b07-8d61-9c0e7a4f2b18" };
  },
  bulkWrite: async () => ({ data: { results: [{}, {}] } }),
}));
jest.mock("../resolve-unique-dataset-name", () => ({ resolveUniqueDatasetName: async (n: string) => n }));

import { columnTypeOf, createDatasetFromTable } from "../create-dataset-from-table";

it("Convert to table makes Sets a number column and keeps Reps as words", async () => {
  await createDatasetFromTable({
    name: "Post-knee surgery home exercises",
    headers: ["Exercise", "Body area", "Sets", "Reps"],
    rows: [
      { Exercise: "Quad sets", "Body area": "Thigh (quadriceps)", Sets: "3", Reps: "10-15" },
      { Exercise: "Ankle pumps", "Body area": "Lower leg/ankle", Sets: "2", Reps: "15-20" },
    ],
  });
  expect(created[0]!.fields.map((f) => [f.display_name, f.data_type])).toEqual([
    ["Exercise", "string"],
    ["Body area", "string"],
    ["Sets", "integer"],
    ["Reps", "string"],
  ]);
});

describe("a column is typed by every one of its values", () => {
  it("Sets is a whole number, Reps stays text, Exercise stays text", () => {
    expect(columnTypeOf(["3", "3", "3", "2", "3"])).toBe("integer");
    expect(columnTypeOf(["10-15", "10-12", "10-15", "15-20", "10-12"])).toBe("string");
    expect(columnTypeOf(["Quad sets", "Heel slides"])).toBe("string");
  });

  it("whole and decimal numbers together are a number; one word among them keeps it text", () => {
    expect(columnTypeOf(["2", "2.5", ""])).toBe("number");
    expect(columnTypeOf(["2", "2.5", "twice"])).toBe("string");
  });

  it("dates and yes/no only when every value is one; an all-blank column is text", () => {
    expect(columnTypeOf(["2026-09-28", "2026-10-05"])).toBe("date");
    expect(columnTypeOf(["true", "false", null])).toBe("boolean");
    expect(columnTypeOf(["", null, undefined])).toBe("string");
  });
});
