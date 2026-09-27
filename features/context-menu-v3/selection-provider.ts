// features/context-menu-v3/selection-provider.ts
//
// The context menu's one entry in the ONE selection toolbar
// (components/selection-toolbar): "AI and more" — it opens the same Alchemy menu a
// right-click opens, over the selected text (the AI actions, the agent
// libraries, copy / export / save), on desktop and as the sheet on a phone.
// It replaces the old floating selection icon: the menu has one door on a
// selection, and it sits in the toolbar with every other passage action.

import { AGENT_ICON } from "@/components/icons/domain-icons";
import type { Action, ActionProvider, ClickTarget } from "@ai-matrx/alchemy/actions";
import { registerAlchemyIcon } from "@/components/agent-copy/alchemy-icon-keys";
import {
  declareSelectionProvider,
  placeSelectionActions,
  hostHalf,
  selectionToolbarHostOf,
  shownInSelectionMode,
} from "@/components/selection-toolbar/selection-actions";

export const CONTEXT_MENU_SELECTION_HOST_KEY = "contextMenuSelection";

export interface ContextMenuSelectionHost {
  kind: "context-menu-selection";
  /** Open this menu instance over the current selection. */
  open(): void;
}

function menuOf(target: ClickTarget): ContextMenuSelectionHost | null {
  const half = hostHalf<ContextMenuSelectionHost>(target, CONTEXT_MENU_SELECTION_HOST_KEY);
  return half?.kind === "context-menu-selection" ? half : null;
}

const ASK_AI: Action = {
  id: "selection:ai",
  label: "AI and more",
  description: "AI actions, agents, copy and export for the selected text",
  icon: registerAlchemyIcon(AGENT_ICON),
  category: "ai",
  order: 0,
  placement: "primary",
  preserveSelection: true,
  eligible: (t) => (menuOf(t) && shownInSelectionMode(ASK_AI.id, t) ? { status: "available" } : { status: "absent" }),
  run: (t) => {
    const menu = menuOf(t);
    if (!menu) return;
    // The toolbar steps aside; the selection stays for the menu to act on.
    selectionToolbarHostOf(t)?.ui.close();
    menu.open();
  },
};

export const contextMenuSelectionProvider: ActionProvider = {
  id: "context-menu-selection",
  tier: "T0",
  declaredIds: () => [ASK_AI.id],
  actions: (target) => (menuOf(target) ? placeSelectionActions([ASK_AI], target) : []),
};

declareSelectionProvider(contextMenuSelectionProvider);
