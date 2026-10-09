/**
 * The sandbox frame's copy control IS the package menu — the same icon trigger
 * and palette a shape shows on the page — never a hand-rolled look-alike.
 * (2026-10-07: a text "Copy" button with a bare list stood in for a day and
 * every framed shape looked broken.)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CopyButtons } from "./FrameCopyButtons";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("frame CopyButtons", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.body.appendChild(document.createElement("div"));
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders the package menu's icon trigger, not a text button", async () => {
    await act(async () => {
      root.render(<CopyButtons label="Concept remix" human="Two Envelopes" json={{ a: 1 }} />);
    });
    const trigger = container.querySelector("[data-alchemy-trigger]");
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent?.trim()).not.toBe("Copy");
  });

  it("the seam renders MatrxCopyMenu and nothing hand-built", () => {
    const src = readFileSync(resolve(__dirname, "FrameCopyButtons.tsx"), "utf8");
    expect(src).toMatch(/<MatrxCopyMenu\b/);
    expect(src).not.toMatch(/<button\b/);
  });
});
