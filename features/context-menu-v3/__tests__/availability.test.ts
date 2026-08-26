// features/context-menu-v3/__tests__/availability.test.ts
//
// THE CONSISTENCY STEP's contract: a shared section is the SAME menu on every
// surface, and a host expresses what it cannot do by DISABLING with a reason —
// never by dropping the row. These tests pin the two properties that make that
// true: shape is preserved, and a disabled item cannot fire.

import type { ContextMenuExtraItem } from "../types";
import {
  applyAvailability,
  needs,
  unavailableHere,
  withAvailability,
} from "../utils/availability";

const fired: string[] = [];
const items = (): ContextMenuExtraItem[] => [
  { kind: "item", id: "a", label: "Alpha", onSelect: () => fired.push("a") },
  { kind: "separator", id: "sep" },
  { kind: "link", id: "b", label: "Beta", href: "/real/place" },
  {
    kind: "checkbox",
    id: "c",
    label: "Gamma",
    checked: false,
    onCheckedChange: () => fired.push("c"),
  },
  {
    kind: "submenu",
    id: "sub",
    label: "More",
    children: [
      { kind: "item", id: "d", label: "Delta", onSelect: () => fired.push("d") },
    ],
  },
];

beforeEach(() => {
  fired.length = 0;
});

describe("unavailableHere / needs", () => {
  it("names the destination rather than just refusing", () => {
    expect(unavailableHere("the Keyword Workbench")).toBe(
      "Works on the Keyword Workbench",
    );
    expect(needs("a library keyword")).toBe("Needs a library keyword");
  });
});

describe("applyAvailability", () => {
  it("keeps every row, in order — the menu's shape never changes", () => {
    const out = applyAvailability(items(), { a: unavailableHere("Ranks") });
    expect(out).toHaveLength(5);
    expect(out.map((i) => i.id)).toEqual(["a", "sep", "b", "c", "sub"]);
    expect(out[0].kind === "item" && out[0].label).toBe("Alpha");
  });

  it("disables the named row and explains where it works", () => {
    const out = applyAvailability(items(), {
      a: unavailableHere("the Keyword Workbench"),
    });
    const alpha = out[0] as Extract<ContextMenuExtraItem, { kind: "item" }>;
    expect(alpha.disabled).toBe(true);
    expect(alpha.description).toBe("Works on the Keyword Workbench");
  });

  it("a disabled item CANNOT fire, even if a renderer ignores the flag", () => {
    const out = applyAvailability(items(), { a: "nope" });
    const alpha = out[0] as Extract<ContextMenuExtraItem, { kind: "item" }>;
    alpha.onSelect();
    expect(fired).toEqual([]);
  });

  it("a disabled link cannot navigate", () => {
    const out = applyAvailability(items(), { b: "nope" });
    const beta = out[2] as Extract<ContextMenuExtraItem, { kind: "link" }>;
    expect(beta.disabled).toBe(true);
    expect(beta.href).toBe("#");
  });

  it("a disabled checkbox cannot toggle", () => {
    const out = applyAvailability(items(), { c: "nope" });
    const gamma = out[3] as Extract<ContextMenuExtraItem, { kind: "checkbox" }>;
    gamma.onCheckedChange(true);
    expect(fired).toEqual([]);
  });

  it("recurses into submenus", () => {
    const out = applyAvailability(items(), { d: needs("a page id") });
    const sub = out[4] as Extract<ContextMenuExtraItem, { kind: "submenu" }>;
    const delta = sub.children[0] as Extract<
      ContextMenuExtraItem,
      { kind: "item" }
    >;
    expect(delta.disabled).toBe(true);
    expect(delta.description).toBe("Needs a page id");
  });

  it("disables a submenu whose every child is dead, so the user learns without opening it", () => {
    const out = applyAvailability(items(), { d: "nope" });
    const sub = out[4] as Extract<ContextMenuExtraItem, { kind: "submenu" }>;
    expect(sub.disabled).toBe(true);
  });

  it("treats a falsy map value as available — hosts can compute without filtering", () => {
    const out = applyAvailability(items(), { a: false, b: undefined, c: "" });
    expect(out.every((i) => i.kind === "separator" || !("disabled" in i && i.disabled))).toBe(
      true,
    );
  });

  it("is a no-op with no map", () => {
    expect(applyAvailability(items(), undefined)).toHaveLength(5);
  });
});

describe("withAvailability", () => {
  it("applies to a whole section without touching its identity", () => {
    const section = {
      id: "keyword-intelligence",
      label: "This keyword",
      items: items(),
    };
    const out = withAvailability(section, { a: "nope" });
    expect(out.id).toBe("keyword-intelligence");
    expect(out.label).toBe("This keyword");
    const alpha = out.items[0] as Extract<ContextMenuExtraItem, { kind: "item" }>;
    expect(alpha.disabled).toBe(true);
  });
});
