// A TABLE'S NAME, WHOLE, AND ITS ORGANIZATION ON THE SAME ROW (lane DATA-V2-FACE-2, 2026-09-24).
//
// THE USE CASE: Rincon Plumbing Co's office manager opens "Rincon Plumbing — Service Calls" on a
// 1440px screen. Before this lane the header read "Rincon Plumbing — Service …" with the whole bar
// empty around it (the title was capped at a fixed 12rem), and the organization it lives in sat
// alone on a second short row floating under the header. Linear shows the team beside the issue
// title, on one row; so does this header now.
//
// RED on the pre-lane bytes: HeaderStructured took no `context` (the organization could not ride
// the header row) and `.hdr-structured-title` carried `max-width: 12rem`.

import React, { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRoot, type Root } from "react-dom/client";
import HeaderStructured from "./HeaderStructured";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  host = null;
});

function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

/** The declarations of one CSS rule, by its exact selector. */
function rule(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) return "";
  return css.slice(at, css.indexOf("}", at));
}

describe("the header's title row", () => {
  it("carries the organization beside the table's name, in the same heading row", () => {
    const el = mount(
      <HeaderStructured
        title="Rincon Plumbing — Service Calls"
        context={<button type="button">Rincon Plumbing Co</button>}
      />,
    );
    const heading = el.querySelector(".hdr-structured-heading");
    expect(heading).not.toBeNull();
    expect(heading!.querySelector(".hdr-structured-title")?.textContent).toBe("Rincon Plumbing — Service Calls");
    expect(heading!.querySelector(".hdr-structured-context")?.textContent).toBe("Rincon Plumbing Co");
    // The whole name is also its hover text, for the phone where it truly must truncate.
    expect(heading!.querySelector(".hdr-structured-title")?.getAttribute("title")).toBe(
      "Rincon Plumbing — Service Calls",
    );
  });

  it("draws no context slot when the page names none", () => {
    const el = mount(<HeaderStructured title="Data" />);
    expect(el.querySelector(".hdr-structured-context")).toBeNull();
    expect(el.querySelector(".hdr-structured-heading")?.hasAttribute("data-has-context")).toBe(false);
  });

  it("never caps the title at a fixed width — it truncates only when the header itself is too narrow", () => {
    const css = readFileSync(join(__dirname, "..", "header-variants.css"), "utf8");
    const title = rule(css, ".hdr-structured-title");
    expect(title).not.toBe("");
    expect(title).not.toMatch(/max-width:\s*\d+(\.\d+)?(rem|px|em)/);
    expect(title).toMatch(/min-width:\s*0/);
    // The organization gives way before the name does.
    expect(rule(css, ".hdr-structured-context")).toMatch(/flex:\s*0 100 auto/);
  });
});
