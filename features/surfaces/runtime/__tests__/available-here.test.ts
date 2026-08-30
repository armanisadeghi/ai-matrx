import { selectAvailableHere } from "../available-here";

const KEYS = (...names: string[]) => new Set(names);

describe("selectAvailableHere", () => {
  const item = (over: Record<string, unknown> = {}) => ({
    id: "a",
    label: "Summarize",
    valueMappings: {
      text: { mapType: "surface_value" as const, target: "selection" },
    },
    surfaceName: null,
    ...over,
  });

  it("offers an item whose every consumed key has a read path here", () => {
    const out = selectAvailableHere({
      items: [item()],
      surfaceName: "matrx-user/notes",
      availableKeys: KEYS("selection"),
    });
    expect(out.available.map((r) => r.label)).toEqual(["Summarize"]);
    expect(out.available[0].requirements).toEqual(["selection"]);
    expect(out.unavailable).toHaveLength(0);
  });

  it("refuses — and NAMES the missing key — when a key has no read path", () => {
    const out = selectAvailableHere({
      items: [item()],
      surfaceName: "matrx-user/notes",
      availableKeys: KEYS("file_name"),
    });
    expect(out.available).toHaveLength(0);
    expect(out.unavailable[0].refusal).toEqual({
      kind: "missing_keys",
      missing: ["selection"],
    });
  });

  it("honors the exclusion valve on an item that otherwise qualified", () => {
    const out = selectAvailableHere({
      items: [item()],
      surfaceName: "matrx-user/notes",
      availableKeys: KEYS("selection"),
      excludedItemIds: new Set(["a"]),
    });
    expect(out.available).toHaveLength(0);
    expect(out.unavailable[0].refusal).toEqual({ kind: "excluded" });
  });

  it("honors the authored scope hierarchy", () => {
    const pinned = item({ id: "b", surfaceName: "matrx-user/other" });
    const out = selectAvailableHere({
      items: [pinned],
      surfaceName: "matrx-user/notes",
      availableKeys: KEYS("selection"),
    });
    expect(out.unavailable[0].refusal.kind).toBe("out_of_scope");
  });

  it("drops inactive rows entirely — neither available nor refused", () => {
    const out = selectAvailableHere({
      items: [item({ isActive: false })],
      surfaceName: "matrx-user/notes",
      availableKeys: KEYS("selection"),
    });
    expect(out.available).toHaveLength(0);
    expect(out.unavailable).toHaveLength(0);
  });

  it("counts offered rows with no mandate identity — the loud, honest gap", () => {
    const out = selectAvailableHere({
      items: [item(), item({ id: "c", label: "Translate", mandateKey: "x.y" })],
      surfaceName: "matrx-user/notes",
      availableKeys: KEYS("selection"),
    });
    expect(out.available).toHaveLength(2);
    // One carries a mandate key; the other does not and must be counted, not
    // silently rendered as if coverage were known for it.
    expect(out.withoutMandateIdentity).toBe(1);
  });
});
