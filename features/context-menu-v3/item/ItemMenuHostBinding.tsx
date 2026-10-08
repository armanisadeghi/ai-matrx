"use client";

/**
 * Gives every ItemRow / ItemContextMenu (@ai-matrx/design-system/item) the
 * website's right-click menu (v3) and promise toast. Mounted once at the root.
 */

import type { ComponentType, ReactNode } from "react";
import { ItemMenuHostProvider, type ItemContextMenuProps, type ItemMenuHost } from "@ai-matrx/design-system/item";
import { ItemContextMenuV3 } from "./ItemContextMenuV3";
import { itemToastPromise } from "./itemMenuToV3";

const HOST: ItemMenuHost = {
  // The package's surface fields are open strings; every website row passes chat's closed registries.
  ContextMenu: ItemContextMenuV3 as unknown as ComponentType<ItemContextMenuProps>,
  toastPromise: itemToastPromise,
};

export function ItemMenuHostBinding({ children }: { children: ReactNode }) {
  return <ItemMenuHostProvider host={HOST}>{children}</ItemMenuHostProvider>;
}
