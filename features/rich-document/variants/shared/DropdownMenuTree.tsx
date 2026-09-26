"use client";

// features/rich-document/variants/shared/DropdownMenuTree.tsx
//
// Renders a MenuTree as Radix DropdownMenu items + submenus. Shared by the
// desktop OverflowMenu and the right-click ContextMenu so both surfaces show
// the identical two-level hierarchy. Caller supplies the DropdownMenuContent
// wrapper; this component renders the inner items only.

import * as React from "react";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { runAction, resolveActionDisplay } from "./runAction";
import type { MenuTree, MenuSubmenuNode } from "./menuStructure";
import type {
  RichDocumentAction,
  RichDocumentActionContext,
} from "../../types";

export interface DropdownMenuTreeProps {
  tree: MenuTree;
  getCtx: () => RichDocumentActionContext;
  /** A context snapshot used only to resolve labels / disabled state. */
  ctxForLabels: RichDocumentActionContext;
}

export function DropdownMenuTree(
  props: DropdownMenuTreeProps,
): React.ReactElement {
  const { tree, getCtx, ctxForLabels } = props;

  const renderItem = (action: RichDocumentAction) => {
    const { label, Icon, iconColor, isDisabled } = resolveActionDisplay(
      action,
      ctxForLabels,
    );
    return (
      <DropdownMenuItem
        key={action.id}
        disabled={isDisabled}
        onClick={() => runAction(action, getCtx)}
      >
        <Icon className={cn("h-4 w-4 mr-2", iconColor)} />
        <span>{label}</span>
      </DropdownMenuItem>
    );
  };

  const renderSubmenu = (submenu: MenuSubmenuNode) => {
    const TriggerIcon = submenu.icon;
    return (
      <DropdownMenuSub key={submenu.label}>
        <DropdownMenuSubTrigger>
          {TriggerIcon ? (
            <TriggerIcon className="h-4 w-4 mr-2 text-muted-foreground" />
          ) : null}
          <span>{submenu.label}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuPortal>
          <DropdownMenuSubContent className="w-56">
            {submenu.actions.map(renderItem)}
          </DropdownMenuSubContent>
        </DropdownMenuPortal>
      </DropdownMenuSub>
    );
  };

  const hasTop = tree.topLevel.length > 0;
  const hasSubs = tree.submenus.length > 0;
  const hasExtras = tree.extras.length > 0;

  return (
    <>
      {hasTop ? tree.topLevel.map(renderItem) : null}
      {hasTop && (hasSubs || hasExtras) ? <DropdownMenuSeparator /> : null}
      {hasSubs ? tree.submenus.map(renderSubmenu) : null}
      {hasSubs && hasExtras ? <DropdownMenuSeparator /> : null}
      {hasExtras ? tree.extras.map(renderItem) : null}
    </>
  );
}

export default DropdownMenuTree;
