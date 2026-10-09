"use client";

/**
 * The website's right-click menu for every ItemRow / ItemContextMenu
 * (@ai-matrx/design-system/item): the ONE universal v3 context menu, with the
 * row's schema-driven config riding in as extraSections (converted lazily at
 * open — resolveContextOnOpen fires before the menu mounts), so the row
 * inherits the standard extras (Copy, agents, Quick Actions, Attach To, Share,
 * admin). Mounted through `ItemMenuHostProvider` in ItemMenuHostBinding.
 * Moves into @ai-matrx/chat with the rest of v3 (package architecture step 2).
 */

import { useState } from "react";
import { resolveItemMenuConfig, type ItemMenuConfig } from "@ai-matrx/design-system/item";
import type { ItemContextMenuProps } from "@ai-matrx/chat/ui/item-types";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { CONTEXT_MENU_HEADING_KEY, type ResolvedContextMenuContext } from "@/features/context-menu-v3/types";
import { itemMenuConfigToExtraSections } from "./itemMenuToV3";

export function ItemContextMenuV3({
  config,
  children,
  sourceFeature,
  surfaceName,
  entity,
  getApplicationScope,
  resolveItemOnOpen,
  onOpenChange,
  onCloseAutoFocus,
}: ItemContextMenuProps) {
  const [resolved, setResolved] = useState<ItemMenuConfig | null>(null);

  return (
    <NonEditableContextMenu
      sourceFeature={sourceFeature}
      surfaceName={surfaceName}
      entity={entity}
      getApplicationScope={getApplicationScope}
      resolveContextOnOpen={(target) => {
        // Re-resolve on every open so lazy configs stay live.
        const item = resolveItemOnOpen?.(target);
        setResolved(resolveItemMenuConfig(item?.config ?? config));
        const context = item?.context ?? null;
        // A list row is a RECORD, not text: its menu is headed with the
        // record's name ("Note · Clinic intake checklist"), never "Content:"
        // plus the row's text — unless the row names itself already.
        if (
          entity?.title &&
          !(context && (context as Record<string, unknown>)[CONTEXT_MENU_HEADING_KEY])
        ) {
          const type = String(entity.type ?? "Item").replace(/[_-]+/g, " ");
          return {
            ...((context as Record<string, unknown> | null) ?? {}),
            [CONTEXT_MENU_HEADING_KEY]: {
              label: type.charAt(0).toUpperCase() + type.slice(1),
              text: entity.title,
            },
          } as ResolvedContextMenuContext;
        }
        return context;
      }}
      extraSections={resolved ? itemMenuConfigToExtraSections(resolved) : []}
      onMenuOpenChange={onOpenChange}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      {children}
    </NonEditableContextMenu>
  );
}
