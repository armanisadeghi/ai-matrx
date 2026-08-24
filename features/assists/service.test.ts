import { narrowRows } from "./service";
import type { AssistRow } from "./types";

describe("assist row validation", () => {
  it("keeps an invalid action visible to developers without reporting an incident", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const row = {
      id: "assist-1",
      source_key: "seo.keyword_meaning.worth",
      action: { kind: "apply_keyword_meaning" },
    } as AssistRow;

    expect(narrowRows([row])).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "[assists] row assist-1 (seo.keyword_meaning.worth) has an action that does not narrow — skipped",
    );
    expect(error).not.toHaveBeenCalled();

    warn.mockRestore();
    error.mockRestore();
  });
});
