import { getFieldFormat } from "../registry";
import { formatFieldValue } from "../format";

describe("attachment format", () => {
  const def = getFieldFormat("attachment")!;
  it("is a rich array format with its own editor", () => {
    expect(def.base).toBe("array");
    expect(def.editor).toBe("attachment");
    expect(def.rich).toBe(true);
  });
  it("parses a list of ids from an array, a JSON string or a comma list", () => {
    expect(def.parse?.(["a", " b ", ""], {})).toEqual(["a", "b"]);
    expect(def.parse?.('["a","b"]', {})).toEqual(["a", "b"]);
    expect(def.parse?.("a, b", {})).toEqual(["a", "b"]);
    expect(def.parse?.("", {})).toBeNull();
  });
  it("names the count as text, never the ids", () => {
    expect(formatFieldValue(["a"], { id: "attachment" }, "array").text).toBe("1 file");
    expect(formatFieldValue(["a", "b"], { id: "attachment" }, "array").text).toBe("2 files");
    expect(formatFieldValue([], { id: "attachment" }, "array").text).toBe("");
  });
});
