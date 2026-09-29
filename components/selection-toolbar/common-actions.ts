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

function eligible(id: string) {
  return (t: ClickTarget) =>
    commonOf(t) && !hostHalf(t, "annotation") && shownInSelectionMode(id, t)
      ? ({ status: "available" } as const)
      : ({ status: "absent" } as const);
}

const ACTIONS: Action[] = [
  {
    id: "selection:copy",
    label: "Copy",
    icon: registerAlchemyIcon(ClipboardCopy),
    category: "copy",
    order: 0,
    placement: "primary",
    preserveSelection: true,
    eligible: eligible("selection:copy"),
    run: async (t) => {
      const common = commonOf(t);
      if (!common) return;
      const { copyToClipboard } = await import("@/components/matrx/buttons/markdown-copy-utils");
      await copyToClipboard(common.text, { isMarkdown: false });
    },
  },
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
    eligible: (t) => {
      const common = commonOf(t);
      return common && hasTableShape(common.text) ? eligible("selection:save-to-table")(t) : ({ status: "absent" } as const);
    },
    run: (t) => {
      const common = commonOf(t);
      if (!common) return;
      selectionToolbarHostOf(t)?.ui.close();
      common.saveToTable(common.text);
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
