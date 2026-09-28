/**
 * A DESTRUCTIVE ACTION NEVER SITS IN THE PHONE HEADER ROW (page-pass 2026-09-27,
 * /crm/<id>). The record's actions end with "Move to trash…", and the phone row
 * keeps the LAST action as its primary — so a red trash button sat beside the
 * title. It is never the primary; it goes last in the ⋮ sheet, after a divider.
 */
import React from "react";
import { isDestructiveAction } from "../route-header-layout";

describe("isDestructiveAction", () => {
  it("knows a destructive control by its variant, its class, or its declaration", () => {
    expect(isDestructiveAction(<button className="text-destructive hover:text-destructive">Move to trash…</button>)).toBe(true);
    expect(isDestructiveAction(<button data-destructive="">Delete</button>)).toBe(true);
    const Btn = (p: { variant?: string; children?: React.ReactNode }) => <button>{p.children}</button>;
    expect(isDestructiveAction(<Btn variant="destructive">Delete</Btn>)).toBe(true);
    expect(isDestructiveAction(<Btn variant="ghost">Log an activity</Btn>)).toBe(false);
    expect(isDestructiveAction(<span><button className="text-destructive">Remove</button></span>)).toBe(true);
  });
});

it("RouteHeader never picks a destructive action as the phone primary and sorts it last", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "RouteHeader.tsx"), "utf8") as string;
  expect(src).toMatch(/find\(\(a\) => !isMenuAction\(a\.node\) && !isDestructiveAction\(a\.node\)\)/);
  expect(src).toContain("data-phone-sheet-divider");
});
