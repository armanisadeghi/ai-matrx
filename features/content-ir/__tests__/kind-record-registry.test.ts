/**
 * THE RECORD-DISPOSITION REGISTRY's two invariants.
 *
 * The whole point of the registry is that the host's chrome is keyed by kind
 * SLUG and nothing else — so the failing-then-passing proof that matters is:
 * a kind that has NOT declared the disposition must draw no chrome, and the
 * declared one must, with no code path naming `wine_tasting`.
 */
import {
  clearKindRecordDispositions,
  listKindRecordDispositions,
  registerKindRecordDisposition,
  resolveKindRecordDisposition,
} from "../records/kind-record-registry";

describe("kind-record-registry", () => {
  afterEach(() => clearKindRecordDispositions());

  it("an undeclared kind resolves to nothing — the host draws no chrome", () => {
    registerKindRecordDisposition({
      kind: "wine_tasting",
      disposition: "record",
      label: "Wine Tasting",
      labelPlural: "Wine Tastings",
    });
    expect(resolveKindRecordDisposition("flashcard_set")).toBeNull();
    expect(resolveKindRecordDisposition(null)).toBeNull();
    expect(resolveKindRecordDisposition(undefined)).toBeNull();
  });

  it("a declared kind carries the words the chrome prints", () => {
    registerKindRecordDisposition({
      kind: "wine_tasting",
      disposition: "record",
      label: "Wine Tasting",
      labelPlural: "Wine Tastings",
    });
    const entry = resolveKindRecordDisposition("wine_tasting");
    expect(entry).toEqual({
      kind: "wine_tasting",
      disposition: "record",
      label: "Wine Tasting",
      labelPlural: "Wine Tastings",
    });
  });

  it("a second kind inherits the mechanism with no new branch anywhere", () => {
    registerKindRecordDisposition({
      kind: "wine_tasting",
      disposition: "record",
      label: "Wine Tasting",
      labelPlural: "Wine Tastings",
    });
    registerKindRecordDisposition({
      kind: "tasting_note",
      disposition: "record",
      label: "Tasting Note",
      labelPlural: "Tasting Notes",
    });
    expect(
      listKindRecordDispositions()
        .map((d) => d.kind)
        .sort(),
    ).toEqual(["tasting_note", "wine_tasting"]);
  });

  it("refuses an unaddressable entry", () => {
    expect(() =>
      registerKindRecordDisposition({
        kind: "   ",
        disposition: "record",
        label: "x",
        labelPlural: "xs",
      }),
    ).toThrow(/non-empty/);
  });

  it("the shipped declaration registers wine_tasting", async () => {
    clearKindRecordDispositions();
    await import("../records/record-kinds");
    expect(resolveKindRecordDisposition("wine_tasting")?.labelPlural).toBe(
      "Wine Tastings",
    );
  });
});
