/**
 * CENSUS — ONE COMPACT ROW (Arman, 2026-10-07: "simple, obvious, nothing extra").
 *
 * The selection strip is the split Copy, the mode's buttons, then More — at most
 * SELECTION_MAX_VISIBLE (6) controls on every surface, desktop and phone:
 *   reading:  Copy · Highlight · Comment · Ask AI · More (suggest, link, new chat, report…)
 *   editing:  Copy · Bold · Italic · Link · Ask AI · More (headings, lists, comment…)
 *
 * Use case: a student selects a sentence in her study guide; she sees four things
 * she understands at a glance, and More holds the rest.
 */

import { createClickTarget, type Action, type ClickTarget } from "@ai-matrx/alchemy/actions";
import {
  SELECTION_ACTION_MODES,
  SELECTION_MAX_VISIBLE,
  SELECTION_PRIMARY,
  selectionPlacement,
  shownInSelectionMode,
  type SelectionToolbarHost,
} from "@ai-matrx/rich-content/selection-toolbar/selection-actions";
import type { SelectionMode } from "@ai-matrx/rich-content/selection-toolbar/selection-zones";

const ui = { openPanel() {}, closePanel() {}, close() {} };
const passage = (id: string) => ({ id } as unknown as Action);

/** Every host half present: the widest strip a surface can draw. */
function targetFor(mode: SelectionMode, slots: number | null, studyGuide = true): ClickTarget {
  const toolbar: SelectionToolbarHost = { kind: "selection-toolbar", mode, knobs: { highlightWhileEditing: true }, ui, slots };
  return createClickTarget({
    host: {
      selectionToolbar: toolbar,
      annotation: { kind: "annotation" },
      contextMenuSelection: { kind: "context-menu-selection" },
      richEditor: { kind: "rich-editor", inTable: () => true },
      selectionCommon: { kind: "selection-common" },
      passageActions: studyGuide ? [passage("selection:tutor-explain"), passage("selection:tutor-ask")] : [],
    },
  });
}

type Placement = (id: string, target: ClickTarget) => "primary" | "overflow";

/** Visible controls on the strip: the split Copy (one control), each button, and More when anything overflows. */
export function visibleControls(mode: SelectionMode, slots: number | null, place: Placement, studyGuide = true): number {
  const target = targetFor(mode, slots, studyGuide);
  const ids = Object.keys(SELECTION_ACTION_MODES).filter((id) => !id.startsWith("selection:copy") && shownInSelectionMode(id, target));
  const buttons = ids.filter((id) => place(id, target) === "primary").length;
  const more = ids.some((id) => place(id, target) === "overflow") ? 1 : 0;
  return 1 + buttons + more;
}

/** Every (mode, width) whose strip shows more than the budget. */
export function overBudget(place: Placement): string[] {
  const out: string[] = [];
  for (const mode of ["read", "edit"] as const) {
    for (const slots of [null, 6, 7]) {
      for (const studyGuide of [true, false]) {
        const n = visibleControls(mode, slots, place, studyGuide);
        if (n > SELECTION_MAX_VISIBLE) out.push(`${mode}@${slots ?? "desktop"}${studyGuide ? "+guide" : ""}: ${n}`);
      }
    }
  }
  return out;
}

it("CENSUS: every mode, desktop and phone, shows at most 6 controls before More", () => {
  expect(SELECTION_MAX_VISIBLE).toBe(6);
  expect(overBudget(selectionPlacement)).toEqual([]);
});

it("the census goes red on the old shape (every reading/editing action a button on desktop)", () => {
  const old: Placement = () => "primary";
  expect(overBudget(old)).toEqual(expect.arrayContaining([expect.stringMatching(/^read@desktop/), expect.stringMatching(/^edit@desktop/)]));
});

it("study guide: Highlight, I don't get this, Ask AI are the buttons; Comment moves behind More", () => {
  const t = targetFor("read", null, true);
  const ids = ["selection:highlight", "selection:tutor-explain", "selection:comment", "selection:ai", "selection:tutor-ask"];
  expect(ids.filter((id) => selectionPlacement(id, t) === "primary")).toEqual(["selection:highlight", "selection:tutor-explain", "selection:ai"]);
  expect(selectionPlacement("selection:comment", t)).toBe("overflow");
});

it("reading: Highlight, Comment, Ask AI are the buttons; the rest is More", () => {
  const t = targetFor("read", null, false);
  expect(SELECTION_PRIMARY.read.filter((id) => selectionPlacement(id, t) === "primary")).toEqual(["selection:highlight", "selection:comment", "selection:ai"]);
  for (const id of ["selection:suggest", "selection:link-record", "selection:new-chat", "selection:report"]) {
    expect([id, selectionPlacement(id, t)]).toEqual([id, "overflow"]);
  }
});

it("editing: Bold, Italic, Link, Ask AI are the buttons; headings, lists and comment are More", () => {
  const t = targetFor("edit", null);
  expect(SELECTION_PRIMARY.edit.filter((id) => selectionPlacement(id, t) === "primary")).toEqual([
    "selection:format-bold",
    "selection:format-italic",
    "selection:format-link",
    "selection:ai",
  ]);
  for (const id of ["selection:format-h1", "selection:format-list", "selection:comment", "selection:save-to-notes"]) {
    expect([id, selectionPlacement(id, t)]).toEqual([id, "overflow"]);
  }
});

it("one Highlight button stands for the five colours", () => {
  expect(Object.keys(SELECTION_ACTION_MODES).filter((id) => id.startsWith("selection:highlight"))).toEqual(["selection:highlight"]);
});
