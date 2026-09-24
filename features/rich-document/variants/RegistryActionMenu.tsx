"use client";

// features/rich-document/variants/RegistryActionMenu.tsx
//
// The "…" menu for hosts that draw their OWN inline buttons (the /chat
// assistant and user bars): the registry's overflow actions rendered through
// the AdvancedMenu primitive, organized by the shared MENU_STRUCTURE tree —
// the same tree the dropdown, the mobile drawer and the right-click menu use.
// Primary-slot actions (thumbs, …) are the host's inline row, so they stay out
// of the menu exactly as they do in <ActionBar/>.
//
// Also the post-auth resume point: a signed-out reader who picked a gated
// action gets it replayed here, through the same registry handler.

import * as React from "react";
import AdvancedMenu, { type MenuItem } from "@/components/official/AdvancedMenu";
import { useActionSurfaceProvider } from "../runtime/useActionSurfaceProvider";
import { resumePendingAuthAction } from "../actions/resumePendingAuthAction";
import { buildMenuTree } from "./shared/menuStructure";
import { resolveActionDisplay, runAction } from "./shared/runAction";
import type {
  ContentSource,
  RichDocumentAction,
  RichDocumentActionContext,
  RichDocumentActionsProp,
} from "../types";

export interface RegistryActionMenuProps {
  isOpen: boolean;
  onClose: () => void;
  content: string;
  source: ContentSource;
  actions?: RichDocumentActionsProp;
  anchorElement?: HTMLElement | null;
  title?: string;
}

/** Overflow-slot actions only — the host renders the primary row inline. */
export function menuActions(actions: RichDocumentAction[]): RichDocumentAction[] {
  return actions.filter((a) => (a.renderSlot ?? "overflow") !== "primary");
}

/** The registry tree → AdvancedMenu rows (submenus become drill-in rows). */
export function toAdvancedMenuItems(
  actions: RichDocumentAction[],
  /** Render-time context — labels and disabled state only. */
  ctx: RichDocumentActionContext,
  /** Click-time context factory — what handlers run against. */
  getCtx: () => RichDocumentActionContext,
): MenuItem[] {
  const toItem = (action: RichDocumentAction): MenuItem => {
    const display = resolveActionDisplay(action, ctx);
    return {
      key: action.id,
      icon: display.Icon,
      iconColor: display.iconColor,
      label: display.label,
      description: display.disabledReason,
      disabled: display.isDisabled,
      // Handlers own their toasts (success, failure, loading) — the menu adds
      // none of its own, so a toast never doubles.
      showToast: false,
      action: () => runAction(action, getCtx),
    };
  };
  const tree = buildMenuTree(menuActions(actions));
  return [
    ...tree.topLevel.map(toItem),
    ...tree.submenus.map((submenu) => ({
      key: `submenu-${submenu.label}`,
      icon: submenu.icon ?? submenu.actions[0].icon,
      label: submenu.label,
      action: () => {},
      showToast: false,
      children: submenu.actions.map(toItem),
    })),
    ...tree.extras.map(toItem),
  ];
}

export function RegistryActionMenu(
  props: RegistryActionMenuProps,
): React.ReactElement {
  const { isOpen, onClose, content, source, actions, anchorElement, title } =
    props;
  const { ctx, getCtx, resolvedActions } = useActionSurfaceProvider({
    content,
    source,
    actions,
    actionsVariant: "none",
  });
  // Handlers call ctx.onClose() — point it at THIS menu.
  const getMenuCtx = (): RichDocumentActionContext => ({
    ...getCtx(),
    onClose,
  });

  // Mount + sign-in edge: replay a gated action picked while signed out. A
  // matched replay clears the stash, so later passes are one storage read.
  React.useEffect(() => {
    resumePendingAuthAction(getMenuCtx());
  });

  return (
    <AdvancedMenu
      isOpen={isOpen}
      onClose={onClose}
      items={toAdvancedMenuItems(resolvedActions, ctx, getMenuCtx)}
      title={title}
      position="bottom-left"
      anchorElement={anchorElement}
    />
  );
}

export default RegistryActionMenu;
