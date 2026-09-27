/**
 * The docked phone bar never scrolls: past the buttons that fit, the
 * lowest-priority actions (and "AI and more" when space is tight) move into
 * the registry's overflow — the selection layout's More.
 *
 * Use case: a student at 320px selects a sentence in her study guide; the bar
 * shows yellow highlight, comment, AI… and a More holding the rest.
 */

import { createClickTarget, type Action } from "@ai-matrx/alchemy/actions";
import { SELECTION_PRIORITY, selectionPlacement, type SelectionToolbarHost } from "../selection-actions";

const ui = { openPanel() {}, closePanel() {}, close() {} };
const passage = (id: string) => ({ id } as unknown as Action);

function readingTarget(slots: number | null) {
  const toolbar: SelectionToolbarHost = { kind: "selection-toolbar", mode: "read", knobs: { highlightWhileEditing: false }, ui, slots };
  return createClickTarget({
    host: {
      selectionToolbar: toolbar,
      annotation: { kind: "annotation" },
      contextMenuSelection: { kind: "context-menu-selection" },
      passageActions: [passage("selection:tutor-explain"), passage("selection:tutor-ask"), passage("selection:report")],
    },
  });
}

const primaries = (slots: number | null) =>
  SELECTION_PRIORITY.read.filter((id) => selectionPlacement(id, readingTarget(slots)) === "primary");

it("desktop: every reading action keeps a button", () => {
  expect(primaries(null)).toHaveLength(SELECTION_PRIORITY.read.length);
});

it("320px with touch (6 slots): 5 buttons + More, AI stays on the bar", () => {
  // (320 - 22) / 46 = 6 slots
  expect(primaries(6)).toEqual(["selection:highlight-yellow", "selection:comment", "selection:ai", "selection:suggest", "selection:tutor-explain"]);
});

it("375px with touch (7 slots): 6 buttons + More", () => {
  expect(primaries(7)).toHaveLength(6);
  expect(selectionPlacement("selection:report", readingTarget(7))).toBe("overflow");
});

it("when everything fits there is no More", () => {
  expect(primaries(SELECTION_PRIORITY.read.length)).toHaveLength(SELECTION_PRIORITY.read.length);
});
