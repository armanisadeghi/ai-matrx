// At phone width (375px) the tool strip met the zoom control and "Comment" wrapped onto two
// lines. The strip now keeps Select and Hand and folds the rest into one "More tools" menu below
// `sm`; the comment door drops its word below `sm` and never wraps. jsdom has no layout, so the
// guard reads the responsive classes that do the work.

import { act } from "react";
import { createRoot } from "react-dom/client";
import fs from "fs";
import path from "path";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../engine/react", () => ({
  useActiveTool: () => "select",
  useBoardCameraStore: () => ({ setTool: jest.fn() }),
}));

import { ToolBar, PHONE_TOOLS } from "../components/ToolBar";

describe("board toolbar at phone width", () => {
  it("keeps Select and Hand, hides every other tool and the Shapes menu below sm, and offers More tools", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    act(() => createRoot(el).render(<ToolBar />));
    const buttons = Array.from(el.querySelectorAll("button"));
    const byLabel = (l: string) => buttons.find((b) => b.getAttribute("aria-label")?.startsWith(l));
    for (const kept of ["Select", "Hand"]) expect(byLabel(kept)?.className).not.toContain("max-sm:hidden");
    for (const folded of ["Text", "Frame", "Note", "Draw", "Pen", "Shapes"]) {
      const b = byLabel(folded);
      if (b) expect(b.className).toContain("max-sm:hidden");
    }
    const more = el.querySelector("[data-toolbar-overflow]");
    expect(more).not.toBeNull();
    expect(more?.className).toContain("sm:hidden");
    expect(PHONE_TOOLS).toEqual(["select", "hand"]);
  });
});

describe("comment door at phone width", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../../components/comments/EntityCommentPopover.tsx"), "utf8");
  it("never wraps and drops its word below sm", () => {
    expect(src).toContain("whitespace-nowrap");
    expect(src).toContain('max-sm:sr-only">Comment');
  });
});
