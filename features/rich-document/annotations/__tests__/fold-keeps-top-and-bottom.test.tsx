/**
 * @jest-environment jsdom
 *
 * A LONG COMMENT OR THREAD FOLDS IN THE MIDDLE — the top (the original comment) and the bottom
 * (the newest reply) always show (Arman, 2026-10-08: "Show more" cut off the bottom, which is the
 * newest reply — backwards).
 *
 * SUT: `foldText.ts` + `CommentBody` (every thread surface renders bodies through it: the canvas
 * comments panel, Spaces, the associations CommentThread port).
 * Use case: an AI Model Config Sync answer about a rejected 26-row settings write; the person's
 * comment, and the agent's long explanation ending with its recommendation.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { foldHead, foldMiddle, foldReplies } from "../foldText";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("@ai-matrx/rich-content/levels/RichContent", () => ({
  RichContent: ({ source }: { source: string }) => <span data-rich>{source}</span>,
}));

import { CommentBody } from "../AnnotationPanel";

const OPENING = "Mostly mine, with one system problem on top.";
const ENDING = "Recommendation: split any write over 8,000 characters into batches of ten rows.";
const middle = Array.from({ length: 30 }, (_, i) => `Row ${i + 1}: the settings cell for offering ${i + 1} was re-typed by hand.`).join("\n");
const LONG = `${OPENING}\n${middle}\n${ENDING}`;

describe("foldMiddle", () => {
  it("keeps the opening and the ending, hides the middle", () => {
    const fold = foldMiddle(LONG)!;
    expect(fold.head.startsWith(OPENING)).toBe(true);
    expect(fold.tail.endsWith(ENDING)).toBe(true);
    expect(fold.head).not.toContain("Row 20:");
    expect(fold.tail).not.toContain("Row 20:");
    expect(fold.hiddenChars).toBeGreaterThan(0);
  });
  it("leaves a short body whole", () => {
    expect(foldMiddle("Truck scale or floor scale?")).toBeNull();
  });
  it("folds one huge paragraph at word boundaries", () => {
    const words = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
    const fold = foldMiddle(words)!;
    expect(fold.head.startsWith("word0 ")).toBe(true);
    expect(fold.tail.endsWith("word399")).toBe(true);
    expect(fold.head.endsWith(" ")).toBe(false);
  });
});

describe("foldHead", () => {
  it("cuts the quoted comment near 300 characters and says there is more", () => {
    const { head, more } = foldHead(LONG);
    expect(head.length).toBeLessThanOrEqual(300);
    expect(head.startsWith(OPENING)).toBe(true);
    expect(more).toBe(true);
    expect(foldHead("Short.").more).toBe(false);
  });
});

describe("foldReplies", () => {
  it("from three replies on shows only the newest, naming how many are hidden", () => {
    expect(foldReplies(["a", "b", "c", "d"], false)).toEqual({ hidden: 3, shown: ["d"] });
    expect(foldReplies(["a", "b"], false)).toEqual({ hidden: 0, shown: ["a", "b"] });
    expect(foldReplies(["a", "b", "c"], true)).toEqual({ hidden: 0, shown: ["a", "b", "c"] });
  });
});

describe("CommentBody", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it("collapsed, a long body shows its top AND its bottom with the fold between", () => {
    act(() => root.render(<CommentBody body={LONG} />));
    expect(host.textContent).toContain(OPENING);
    expect(host.textContent).toContain(ENDING);
    expect(host.textContent).not.toContain("Row 20:");
    const fold = [...host.querySelectorAll("button")].find((b) => b.textContent === "… show full text …")!;
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    act(() => fold.click());
    expect(host.textContent).toContain("Row 20:");
    const less = [...host.querySelectorAll("button")].find((b) => b.textContent === "Show less")!;
    expect(less.getAttribute("aria-expanded")).toBe("true");
  });
});
