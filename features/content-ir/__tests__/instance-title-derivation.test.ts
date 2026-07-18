/**
 * Instance TITLE derivation — the cross-repo mirror contract
 * (`studio/instance-title.ts` ↔ aidream `kind_instance.derive_title` +
 * `kind_shared.kind_title_key`). Derivation ORDER is the contract:
 * explicit → the kind's `metadata.title_key` field (non-empty scalar) →
 * the shared `INSTANCE_TITLE_KEYS` list → null.
 */

import {
  INSTANCE_TITLE_KEYS,
  deriveInstanceTitle,
  kindTitleKeyFromMetadata,
} from "@/features/content-ir/studio/instance-title";

describe("deriveInstanceTitle — shared key list (server _TITLE_KEYS parity)", () => {
  it("explicit title wins over everything", () => {
    expect(deriveInstanceTitle({ title: "From Data" }, "Explicit")).toBe("Explicit");
    expect(
      deriveInstanceTitle({ wine_name: "Opus One" }, "Explicit", "wine_name"),
    ).toBe("Explicit");
  });

  it("probes the shared keys in order, trimming and skipping empties", () => {
    expect(deriveInstanceTitle({ title: "From Data" })).toBe("From Data");
    expect(deriveInstanceTitle({ name: "  Named  " })).toBe("Named");
    expect(deriveInstanceTitle({ customer: "Acme Corp", total: 5 })).toBe("Acme Corp");
    expect(deriveInstanceTitle({ title: "   ", name: "Real" })).toBe("Real");
    expect(deriveInstanceTitle({ total: 5 })).toBeNull();
  });

  it("the shared key list mirrors the server tuple verbatim", () => {
    expect([...INSTANCE_TITLE_KEYS]).toEqual([
      "title",
      "name",
      "label",
      "heading",
      "subject",
      "customer",
    ]);
  });
});

describe("deriveInstanceTitle — per-kind metadata.title_key override", () => {
  it("the override wins over the shared list", () => {
    expect(
      deriveInstanceTitle({ wine_name: "Opus One", name: "Generic" }, null, "wine_name"),
    ).toBe("Opus One");
  });

  it("non-string scalars stringify (mirror contract: booleans lowercase)", () => {
    expect(deriveInstanceTitle({ vintage: 1997 }, null, "vintage")).toBe("1997");
    expect(deriveInstanceTitle({ buy_again: true }, null, "buy_again")).toBe("true");
  });

  it("absent / empty / non-scalar override falls through to the shared list", () => {
    expect(deriveInstanceTitle({ name: "Fallback" }, null, "wine_name")).toBe("Fallback");
    expect(
      deriveInstanceTitle({ wine_name: "   ", name: "Fallback" }, null, "wine_name"),
    ).toBe("Fallback");
    expect(
      deriveInstanceTitle({ wine_name: { nested: 1 }, name: "Fb" }, null, "wine_name"),
    ).toBe("Fb");
    expect(deriveInstanceTitle({ wine_name: ["list"] }, null, "wine_name")).toBeNull();
    expect(deriveInstanceTitle({ nan: Number.NaN }, null, "nan")).toBeNull();
  });
});

describe("kindTitleKeyFromMetadata — defensive metadata read", () => {
  it("returns the trimmed key only for a non-empty string value", () => {
    expect(kindTitleKeyFromMetadata({ title_key: "wine_name" })).toBe("wine_name");
    expect(kindTitleKeyFromMetadata({ title_key: "  wine_name  " })).toBe("wine_name");
  });

  it("returns null for blank / non-string / missing / non-object metadata", () => {
    expect(kindTitleKeyFromMetadata({ title_key: "   " })).toBeNull();
    expect(kindTitleKeyFromMetadata({ title_key: 7 })).toBeNull();
    expect(kindTitleKeyFromMetadata({})).toBeNull();
    expect(kindTitleKeyFromMetadata(null)).toBeNull();
    expect(kindTitleKeyFromMetadata("title_key")).toBeNull();
    expect(kindTitleKeyFromMetadata([{ title_key: "x" }])).toBeNull();
  });
});
