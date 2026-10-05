/**
 * GRIDS REVIEW 3 (2026-09-30), the Sheet's typed-value majors, at the seam every Sheet door reads through:
 *   · "(150)" in a Money cell was stored EMPTY — the cell sent Money words to the look's own loose parse
 *     (`parseFieldInput`), which reads brackets as nothing. Every number look now reads through the one
 *     reader (`typedReaderKind` → `readCellWord` → `@ai-matrx/records` readTypedNumber).
 *   · a pasted / defaulted date & time was kept as zone-less words; it is now the absolute instant.
 * Forced west of UTC.
 */
import { parseFieldInput } from "@ai-matrx/design-system/field-formats";

import { readCellWord } from "../cell-word";
import { typedReaderKind } from "../components/EditableCell";
import { isTypedNumberColumn, readRowFormWords } from "../row-form-words";

jest.mock("../service", () => ({}));
jest.mock("@/components/ui/use-toast", () => ({ toast: jest.fn() }));

const money = { display_name: "Copay", data_type: "number", metadata: { format: { id: "currency" } } };

describe("a typed money word or date is read by the one reader", () => {
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/Los_Angeles";
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("is what the look's own parse got wrong: (150) read as nothing", () => {
    // The old path — kept here as the measured cause, so a return to it is visible.
    expect(parseFieldInput("(150)", { id: "currency" }, "number")).toBeNull();
  });

  it("sends every number look to the number reader", () => {
    for (const id of ["number", "decimal", "integer", "currency", "percent", "progress", "duration", "file_size", "rating"] as const) {
      expect(typedReaderKind({ id } as never, "number")).toBe("number");
    }
    expect(typedReaderKind(null, "datetime")).toBe("datetime");
    expect(typedReaderKind({ id: "date" } as never, "date")).toBe("date");
  });

  it("reads money as a person writes it", () => {
    expect(readCellWord("(150)", money)).toEqual({ ok: true, value: -150 });
    expect(readCellWord("-$150", money)).toEqual({ ok: true, value: -150 });
    expect(readCellWord("$1,250.50", money)).toEqual({ ok: true, value: 1250.5 });
  });

  it("reads a row form's number box on Save, and refuses what it cannot read", () => {
    expect(isTypedNumberColumn(money)).toBe(true);
    const read = readRowFormWords([{ ...money, field_name: "copay" }], { copay: "(150)" });
    expect(read).toEqual({ data: { copay: -150 }, refusals: {} });
    const bad = readRowFormWords([{ ...money, field_name: "copay" }], { copay: "twelve" });
    expect(bad.refusals.copay).toMatch(/Copay holds a number/);
  });

  it("keeps a pasted date & time as the absolute instant", () => {
    const col = { display_name: "Serviced at", data_type: "datetime" };
    expect(readCellWord("10/03/2026 12:00 PM", col)).toEqual({ ok: true, value: "2026-10-03T19:00:00.000Z" });
    expect(readCellWord("2026-10-03", { display_name: "Due", data_type: "date" })).toEqual({ ok: true, value: "2026-10-03" });
  });
});
