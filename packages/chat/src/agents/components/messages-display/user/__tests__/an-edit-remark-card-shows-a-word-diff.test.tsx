/**
 * @jest-environment jsdom
 *
 * The card for a sent edit chip drew the whole old sentence ("- ...") and the whole new
 * sentence ("+ ...") in monospace (closing walk 2026-10-05). It must draw the same
 * word-level diff the chip drawer does: only the added words carry the highlight, and the
 * raw "- "/"+ " lines are gone. The stored text below is the real persisted diff.
 */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { RemarksTranscriptView, splitRemarkDiff } from "../RemarksTranscriptView";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OLD = "If it still shows up empty on your end, let me know what you're seeing exactly (e.g., a blank box) — that'll help me.";
const NEW = `${OLD} Also include a soft-opening tasting night.`;
const STORED_DIFF = `  \n- ${OLD}\n+ ${NEW}`;

it("reads the stored diff back into its before and after", () => {
  expect(splitRemarkDiff(STORED_DIFF)).toEqual({ before: OLD, after: NEW });
  expect(splitRemarkDiff("no markers at all")).toBeNull();
});

it("draws a word-level diff, not the two raw -/+ sentences", () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<RemarksTranscriptView payload={{ items: [{ kind: "edit", diff: STORED_DIFF, handle: "c5" }] }} />));
  expect(container.querySelector("[data-remark-diff]")).not.toBeNull();
  expect(container.querySelector("pre")).toBeNull();
  const text = container.textContent ?? "";
  expect(text).not.toMatch(/^\s*-\s/m);
  expect(text).not.toContain("- If it still");
  expect(text).not.toContain("+ If it still");
  // only the added words carry the highlight: some element holds just them
  const added = [...container.querySelectorAll("[data-remark-diff] *")].filter(
    (el) => el.children.length === 0 && (el.textContent ?? "").includes("Also include a soft-opening tasting night"),
  );
  expect(added.length).toBeGreaterThan(0);
  expect(added.every((el) => !(el.textContent ?? "").includes("If it still shows up empty"))).toBe(true);
  act(() => root.unmount());
  container.remove();
});
