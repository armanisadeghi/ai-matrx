// components/selection-toolbar/common-actions.ts
//
// The common pair every selection gets where nothing richer owns the passage
// (chat answers, note previews, the studio preview and source, window panels,
// text fields): Copy and Save to notes — beside "AI and more", so no surface is
// ever a one-button bar. Registry actions like every other; the machinery
// (the clipboard transport, the notes overlay) loads at click time.

import { ClipboardCopy, NotebookPen, Table2 } from "lucide-react";
import { hasTableShape } from "@ai-matrx/records-ui/table-shape";
import type { Action, ActionProvider, ClickTarget } from "@ai-matrx/alchemy/actions";
import { registerAlchemyIcon } from "@/components/agent-copy/alchemy-icon-keys";
import {
  SELECTION_COMMON_HOST_KEY,
  declareSelectionProvider,
  hostHalf,
  placeSelectionActions,
  selectionToolbarHostOf,
  shownInSelectionMode,
  type SelectionCommonHost,
} from "./selection-actions";

function commonOf(target: ClickTarget): SelectionCommonHost | null {
  const half = hostHalf<SelectionCommonHost>(target, SELECTION_COMMON_HOST_KEY);
  return half?.kind === "selection-common" && half.text ? half : null;
}

/** The selection's rows: its rendered shape when it has one, else the words as typed. */
function rowsTextOf(common: SelectionCommonHost): string {
  if (common.shapeText && hasTableShape(common.shapeText)) return common.shapeText;
  return common.text;
}

/** Copy is every selection's — an annotated reading passage (a note in Read) included. */
function copyEligible(id: string) {
  return (t: ClickTarget) =>
    commonOf(t) && shownInSelectionMode(id, t) ? ({ status: "available" } as const) : ({ status: "absent" } as const);
}

function eligible(id: string) {
  return (t: ClickTarget) =>
    commonOf(t) && !hostHalf(t, "annotation") && shownInSelectionMode(id, t)
      ? ({ status: "available" } as const)
      : ({ status: "absent" } as const);
}

const COPY_FLAVORS = [
  { id: "selection:copy", label: "Copy", flavor: "default", order: 0, placement: "primary" },
  { id: "selection:copy-markdown", label: "Copy markdown", flavor: "markdown", order: 1, placement: "overflow" },
  { id: "selection:copy-text", label: "Copy text", flavor: "text", order: 2, placement: "overflow" },
] as const;

const ACTIONS: Action[] = [
  // THE one copy module (copy-commands.ts, selection-copy.ts): Copy writes
  // the formatted selection AND the knob's plain flavor (markdown by default);
  // Copy markdown and Copy text are the explicit choices, under More.
  ...COPY_FLAVORS.map(
    ({ id, label, flavor, order, placement }): Action => ({
      id,
      label,
      icon: registerAlchemyIcon(ClipboardCopy),
      category: "copy",
      order,
      placement,
      preserveSelection: true,
      eligible: copyEligible(id),
      run: async (t) => {
        const common = commonOf(t);
        if (!common) return;
        const { copyRenderedSelection, renderedSelectionRange } = await import("./selection-copy");
        const { copyRichContent } = await import("@/components/agent-copy/copy-commands");
        // Rendered content: its formatted DOM + its markdown. A text field: its text IS markdown.
        const ok = renderedSelectionRange()
          ? await copyRenderedSelection(flavor, common.shapeText ?? common.text)
          : await copyRichContent(common.text, flavor, { toast: false });
        if (ok) (await import("@/lib/toast")).toast.success(flavor === "default" ? "Copied" : flavor === "markdown" ? "Markdown copied" : "Text copied");
      },
    }),
  ),
  {
    id: "selection:save-to-notes",
    label: "Save to notes",
    icon: registerAlchemyIcon(NotebookPen),
    category: "save",
    order: 0,
    placement: "primary",
    preserveSelection: true,
    eligible: eligible("selection:save-to-notes"),
    run: (t) => {
      const common = commonOf(t);
      if (!common) return;
      selectionToolbarHostOf(t)?.ui.close();
      common.saveToNotes(common.text);
    },
  },
  {
    // THE ONE "Save to a table" (SAVE-AS-TABLE-EVERYWHERE, 2026-09-29): offered only when the
    // selected text reads as rows — a table, a list or a few bullets, Key: value lines, CSV/TSV.
    id: "selection:save-to-table",
    label: "Save to a table",
    icon: registerAlchemyIcon(Table2),
    category: "save",
    order: 1,
    placement: "overflow",
    preserveSelection: true,
    // Offered in every mode the table allows, Read (annotated) included — only the words decide.
    eligible: (t) => {
      const common = commonOf(t);
      return common && shownInSelectionMode("selection:save-to-table", t) && hasTableShape(rowsTextOf(common))
        ? ({ status: "available" } as const)
        : ({ status: "absent" } as const);
    },
    run: (t) => {
      const common = commonOf(t);
      if (!common) return;
      selectionToolbarHostOf(t)?.ui.close();
      common.saveToTable(rowsTextOf(common));
    },
  },
];

export const selectionCommonProvider: ActionProvider = {
  id: "selection-common",
  tier: "T0",
  declaredIds: () => ACTIONS.map((a) => a.id),
  actions: (target) => (commonOf(target) ? placeSelectionActions(ACTIONS, target) : []),
};

declareSelectionProvider(selectionCommonProvider);
