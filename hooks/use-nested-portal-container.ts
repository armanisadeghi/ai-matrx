"use client";

import { useDialogContainer } from "@/components/ui/dialog";
import { usePopoutContainer } from "@/features/window-panels/popout/usePopoutContainer";

/**
 * Resolve where Radix portaled content (Select, Popover, DropdownMenu, etc.)
 * should mount.
 *
 * Priority: explicit prop > dialog content (keeps nested menus inside the
 * dialog scroll shard) > popout body > document.body default.
 */
export function useNestedPortalContainer(
  explicit?: HTMLElement | null,
): HTMLElement | undefined {
  const dialogContainer = useDialogContainer();
  const popoutContainer = usePopoutContainer();

  if (explicit !== undefined) {
    return explicit ?? undefined;
  }

  return dialogContainer ?? popoutContainer;
}
