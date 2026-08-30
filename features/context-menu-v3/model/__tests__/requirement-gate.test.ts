/**
 * THE DERIVED GATE — unit tests for the pure primitives behind Phase 6.7
 * menu availability (`../requirement-gate.ts`).
 *
 * The behavioural end of this lives in
 * `hooks/__tests__/build-category-groups.test.ts` (what the menu actually
 * renders). This file pins the primitives themselves: what counts as a
 * requirement, how the one column encodes three scope rungs, and WHY the gate
 * refused — because a hidden item with no stated reason is exactly the defect
 * the red `legacyMatch` rows were papering over.
 */

import {
  buildAvailableKeys,
  decideOffer,
  domainOfSurfaceName,
  readMenuScope,
  requirementsOf,
  scopeReaches,
  writeMenuScope,
  type GateableItem,
} from "../requirement-gate";

const BASELINE = [
  "selection",
  "text_before",
  "text_after",
  "content",
  "context",
];

function item(over: Partial<GateableItem> = {}): GateableItem {
  return { id: "i", ...over };
}

describe("requirementsOf", () => {
  it("collects surface_value targets from the canonical DSL", () => {
    expect(
      requirementsOf(
        item({
          valueMappings: {
            a: { mapType: "surface_value", target: "raw_transcript_text" },
            b: { mapType: "surface_value", target: "selection" },
          },
        }),
      ).sort(),
    ).toEqual(["raw_transcript_text", "selection"]);
  });

  it("ignores direct_value, prompt_user, empty targets and reserved keys", () => {
    const valueMappings: NonNullable<GateableItem["valueMappings"]> = {
      a: { mapType: "direct_value", target: "a literal" },
      b: { mapType: "prompt_user", prompt: "Tone?" },
      c: { mapType: "surface_value", target: "   " },
    };
    Reflect.set(valueMappings, "__write_policies", { whatever: true });

    expect(
      requirementsOf(
        item({
          valueMappings,
        }),
      ),
    ).toEqual([]);
  });

  it("reads the legacy columns in their INVERSE direction (key = surface value)", () => {
    expect(
      requirementsOf(
        item({
          scopeMappings: { document_name: "doc", selection: "page_content" },
          contextMappings: { usr_scope_expertise: "expertise" },
        }),
      ).sort(),
    ).toEqual(["document_name", "selection", "usr_scope_expertise"]);
  });

  it("drops a legacy entry whose agent-side target is blank (half-authored)", () => {
    expect(requirementsOf(item({ scopeMappings: { foo: "" } }))).toEqual([]);
  });
});

describe("the scope hierarchy encoded in one column", () => {
  it("derives the domain from the first path segment", () => {
    expect(domainOfSurfaceName("matrx-user/notes")).toBe("matrx-user");
    expect(domainOfSurfaceName("matrx-admin/database")).toBe("matrx-admin");
    expect(domainOfSurfaceName(null)).toBeNull();
  });

  it("reads null / empty / '*' as GLOBAL", () => {
    for (const raw of [null, undefined, "", "   ", "*"]) {
      expect(readMenuScope(item({ surfaceName: raw })).level).toBe("global");
    }
  });

  it("reads a bare client or a '<client>/*' as DOMAIN", () => {
    expect(readMenuScope(item({ surfaceName: "matrx-user" }))).toEqual({
      level: "domain",
      domain: "matrx-user",
      surface: null,
    });
    expect(readMenuScope(item({ surfaceName: "matrx-user/*" }))).toEqual({
      level: "domain",
      domain: "matrx-user",
      surface: null,
    });
  });

  it("reads a full '<client>/<surface>' as SURFACE", () => {
    expect(readMenuScope(item({ surfaceName: "matrx-user/notes" }))).toEqual({
      level: "surface",
      domain: "matrx-user",
      surface: "matrx-user/notes",
    });
  });

  it("round-trips through the canonical write form", () => {
    for (const raw of [null, "matrx-user/*", "matrx-user/notes"]) {
      const scope = readMenuScope(item({ surfaceName: raw }));
      expect(readMenuScope(item({ surfaceName: writeMenuScope(scope) }))).toEqual(
        scope,
      );
    }
    // The bare form normalizes to the self-describing star form.
    expect(writeMenuScope(readMenuScope(item({ surfaceName: "matrx-user" })))).toBe(
      "matrx-user/*",
    );
  });

  it("inherits downward, and never leaks onto a surface the platform cannot name", () => {
    const global = readMenuScope(item({}));
    const domain = readMenuScope(item({ surfaceName: "matrx-user/*" }));
    const surface = readMenuScope(item({ surfaceName: "matrx-user/notes" }));

    expect(scopeReaches(global, "matrx-admin/database")).toBe(true);
    expect(scopeReaches(global, null)).toBe(true);

    expect(scopeReaches(domain, "matrx-user/notes")).toBe(true);
    expect(scopeReaches(domain, "matrx-user/tasks")).toBe(true);
    expect(scopeReaches(domain, "matrx-admin/database")).toBe(false);
    expect(scopeReaches(domain, null)).toBe(false);

    expect(scopeReaches(surface, "matrx-user/notes")).toBe(true);
    expect(scopeReaches(surface, "matrx-user/tasks")).toBe(false);
    expect(scopeReaches(surface, null)).toBe(false);
  });
});

describe("buildAvailableKeys", () => {
  it("unions the baseline floor, the manifest declarations and the live scope keys", () => {
    const keys = buildAvailableKeys({
      baselineValueNames: BASELINE,
      declaredValueNames: ["current_note_title"],
      runtimeScopeKeys: ["undeclared_runtime_value"],
    });
    expect(keys.has("selection")).toBe(true);
    expect(keys.has("current_note_title")).toBe(true);
    expect(keys.has("undeclared_runtime_value")).toBe(true);
    expect(keys.has("raw_transcript_text")).toBe(false);
  });
});

describe("decideOffer", () => {
  const keys = new Set([...BASELINE, "raw_transcript_text"]);

  it("names the missing keys when it refuses on requirements", () => {
    const decision = decideOffer(
      item({
        valueMappings: {
          a: { mapType: "surface_value", target: "vsc_active_file_language" },
        },
      }),
      { surfaceName: "matrx-user/notes", availableKeys: keys },
    );
    expect(decision).toEqual({
      offered: false,
      refusal: { kind: "missing_keys", missing: ["vsc_active_file_language"] },
    });
  });

  it("requirements are checked BEFORE scope — an unreadable key loses even on its own page", () => {
    const decision = decideOffer(
      item({
        surfaceName: "matrx-user/notes",
        valueMappings: {
          a: { mapType: "surface_value", target: "nope" },
        },
      }),
      { surfaceName: "matrx-user/notes", availableKeys: keys },
    );
    expect(decision.offered).toBe(false);
    expect(
      decision.offered === false && decision.refusal.kind,
    ).toBe("missing_keys");
  });

  it("refuses out-of-scope items with the scope it read", () => {
    const decision = decideOffer(
      item({ surfaceName: "matrx-admin/*" }),
      { surfaceName: "matrx-user/notes", availableKeys: keys },
    );
    expect(decision).toEqual({
      offered: false,
      refusal: {
        kind: "out_of_scope",
        scope: { level: "domain", domain: "matrx-admin", surface: null },
      },
    });
  });

  it("the valve gets the LAST word over an item that fully qualified", () => {
    const qualifying = item({ id: "x", surfaceName: "matrx-user/notes" });
    const ctx = { surfaceName: "matrx-user/notes", availableKeys: keys };
    expect(decideOffer(qualifying, ctx)).toEqual({ offered: true });
    expect(
      decideOffer(qualifying, { ...ctx, excludedItemIds: new Set(["x"]) }),
    ).toEqual({ offered: false, refusal: { kind: "excluded" } });
  });
});
