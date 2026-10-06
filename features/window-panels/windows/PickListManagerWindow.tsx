"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  WindowPanel,
  type WindowPanelProps,
} from "@/features/window-panels/WindowPanel";
import { PickListWindowBody } from "@/features/data-tables/pick-lists/components/PickListWindowBody";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

export interface PickListManagerWindowProps extends Omit<
  WindowPanelProps,
  "children" | "title" | "actionsLeft" | "actionsRight"
> {
  title?: string;
  /**
   * When set, the window opens in single-list mode: switcher hidden, the named
   * list is the only one shown. When omitted (or null) the window opens in
   * full browse mode (switcher + table).
   */
  forcedListId?: string | null;
}

export default function PickListManagerWindow({
  title,
  id = "pick-list-manager-window",
  forcedListId = null,
  ...windowProps
}: PickListManagerWindowProps) {
  const dispatch = useAppDispatch();

  const onClose = useCallback(() => {
    dispatch(closeOverlay({ overlayId: "pickListManagerWindow" }));
  }, [dispatch]);

  const resolvedTitle = title ?? (forcedListId ? "Pick list" : "Pick lists");

  return (
    <WindowPanel
      id={id}
      title={resolvedTitle}
      onClose={onClose}
      minWidth={forcedListId ? 460 : 680}
      minHeight={400}
      width={forcedListId ? 680 : 960}
      height={620}
      urlSyncKey="pickListManager"
      urlSyncId={forcedListId ?? "default"}
      className="bg-background/95 backdrop-blur-md"
      overlayId="pickListManagerWindow"
      {...windowProps}
    >
      {/* 🚨 A WINDOW MOUNTS ITS OWN MENU (context-menu-v3 SKILL). Without
          this, a right-click here is answered by whatever page sits
          underneath. Reuses the `structured_list` entity token already
          registered by the list engines' own row menus; in
          browse mode (no `forcedListId`) the pane shows many lists via its
          own switcher, so no single entity applies. */}
      <NonEditableContextMenu
        sourceFeature="udt"
        contentSource={{ type: "raw" }}
        entity={
          forcedListId
            ? {
                type: "structured_list",
                id: forcedListId,
                title: resolvedTitle,
                resourceType: "structured_list",
              }
            : undefined
        }
      >
        <PickListWindowBody forcedListId={forcedListId} />
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
