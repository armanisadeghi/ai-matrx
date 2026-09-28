/**
 * GUARD — one Escape closes ONE layer (verifier round 2).
 *
 * In the side drawer (FloatingSheet), an Escape that closed the answer menu
 * also closed the drawer: the drawer's document keydown listener ignored that
 * the menu (Radix, capture phase) had already taken the key and marked it
 * defaultPrevented. Census: every document-level Escape handler in the shared
 * overlay/window/drawer code must skip an already-handled Escape.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import FloatingSheet from "../FloatingSheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function escape(prevented: boolean) {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  if (prevented) event.preventDefault();
  document.dispatchEvent(event);
}

describe("FloatingSheet", () => {
  it("an Escape a nested menu already took does not also close the sheet; the next one does", () => {
    const onClose = jest.fn();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<FloatingSheet isOpen onClose={onClose} title="Agent" lockScroll={false}><p>chat</p></FloatingSheet>));
    act(() => escape(true));
    expect(onClose).not.toHaveBeenCalled();
    act(() => escape(false));
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});

describe("census — shared layers skip an Escape a nested layer took", () => {
  const ROOT = join(__dirname, "..", "..", "..");
  const DIRS = ["components/official", "features/overlays", "features/window-panels", "features/agents/components/agent-widgets"];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules") walk(p); }
      else if (/\.tsx?$/.test(name) && !/\.test\./.test(name)) files.push(p);
    }
  };
  DIRS.forEach((d) => walk(join(ROOT, d)));
  it("every document keydown Escape handler checks defaultPrevented", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return /(document|window)\.addEventListener\("keydown"/.test(src) && /key === "Escape"/.test(src) && !/defaultPrevented/.test(src);
    });
    expect(offenders.map((f) => f.slice(ROOT.length + 1))).toEqual([]);
  });
});
