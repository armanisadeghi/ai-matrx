import { readFileSync } from "node:fs";
import { join } from "node:path";
import { wireItems } from "../referencePickerTypes";

describe("wireItems — what reaches the fence", () => {
  it("a link or delete item drops the picker's display label (pure identity)", () => {
    expect(wireItems("reference", [{ id: "a", label: "Kickoff" }])).toEqual([{ id: "a" }]);
    expect(wireItems("delete", [{ id: "a", label: "Kickoff" }])).toEqual([{ id: "a" }]);
  });

  it("a create/update payload keeps `label` — for a note it is the title column", () => {
    // The real catalog: the note noun's title column is `label`, so stripping
    // it would insert a button that creates an untitled note.
    const catalog = JSON.parse(
      readFileSync(
        join(process.cwd(), "docs/protocol/kind_directives_catalog.generated.json"),
        "utf8",
      ),
    ) as { nouns: Array<{ noun: string; title_column?: string }> };
    expect(catalog.nouns.find((n) => n.noun === "note")?.title_column).toBe("label");

    expect(wireItems("create", [{ label: "Meeting notes" }])).toEqual([
      { label: "Meeting notes" },
    ]);
    expect(wireItems("update", [{ id: "n1", label: "Renamed" }])).toEqual([
      { id: "n1", label: "Renamed" },
    ]);
  });
});
