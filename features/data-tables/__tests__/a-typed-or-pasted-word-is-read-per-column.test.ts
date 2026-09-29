/**
 * BREAKER-2 B2-02, B2-03, B2-13 (DATA-V2-BASICS-2): a paste of visits was refused whole for "$30", for
 * "Yes", for "Neck, Shoulder"; a Whole number cell kept "7.5" as 7 without a word. One reader, per column.
 */
import { offListChoiceWords, readCellWord } from "../cell-word";

const col = (data_type: string, format?: Record<string, unknown>, display_name = "Column") => ({
  display_name,
  data_type,
  ...(format ? { metadata: { format } } : {}),
});
const choices = (id: string, values: string[], extra: Record<string, unknown> = {}) =>
  col(id === "multi_choice" ? "array" : "string", { id, options: { choices: values.map((value) => ({ value })), ...extra } }, "Visit Status");

describe("a typed or pasted word is read per column", () => {
  it("reads money as a number", () => {
    expect(readCellWord("$30", col("number", { id: "currency" }))).toEqual({ ok: true, value: 30 });
    expect(readCellWord("1,250.50", col("number", { id: "currency" }))).toEqual({ ok: true, value: 1250.5 });
  });
  it("reads yes and no words as a tick, and says what it cannot read", () => {
    expect(readCellWord("Yes", col("boolean"))).toEqual({ ok: true, value: true });
    expect(readCellWord("no", col("boolean"))).toEqual({ ok: true, value: false });
    const maybe = readCellWord("maybe", col("boolean", undefined, "Insurance Verified"));
    expect(maybe.ok).toBe(false);
    expect(!maybe.ok && maybe.why).toMatch(/Insurance Verified is ticked or left unticked/);
  });
  it("splits several choices and matches them however they are cased", () => {
    expect(readCellWord("neck,  SHOULDER", choices("multi_choice", ["Neck", "Shoulder", "Knee"]))).toEqual({ ok: true, value: ["Neck", "Shoulder"] });
    expect(readCellWord("Knee", choices("multi_choice", ["Neck", "Shoulder", "Knee"]))).toEqual({ ok: true, value: ["Knee"] });
  });
  it("matches one choice however it is spaced, and keeps an unknown word for the ask", () => {
    expect(readCellWord(" completed ", choices("choice", ["Completed", "No-show"]))).toEqual({ ok: true, value: "Completed" });
    const read = readCellWord("Rescheduled", choices("choice", ["Completed"]));
    expect(read).toEqual({ ok: true, value: "Rescheduled" });
    expect(offListChoiceWords((read as { value: unknown }).value, choices("choice", ["Completed"]))).toEqual(["Rescheduled"]);
  });
  it("says a whole-number column holds whole numbers", () => {
    const half = readCellWord("7.5", col("integer", { id: "integer" }, "Sessions Completed"));
    expect(half.ok).toBe(false);
    expect(!half.ok && half.why).toMatch(/holds whole numbers, and “7.5” is not one/);
    expect(readCellWord("12abc", col("integer", { id: "integer" })).ok).toBe(false);
    expect(readCellWord("99999999999999999999", col("integer", { id: "integer" })).ok).toBe(false);
  });
  it("says a date column holds dates", () => {
    expect(readCellWord("next tuesday", col("date", { id: "date" })).ok).toBe(false);
  });
});
