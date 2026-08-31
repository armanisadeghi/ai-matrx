"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  WindowPanel,
  type WindowPanelProps,
} from "@/features/window-panels/WindowPanel";
import { StructuredListManagerV1Client } from "@/features/structured-lists/StructuredListManagerV1Client";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

export interface StructuredListManagerV1WindowProps extends Omit<
  WindowPanelProps,
  "children" | "title" | "actionsLeft" | "actionsRight"
> {
  title?: string;
  /**
   * When set, the window opens in single-list mode: sidebar hidden, the named
   * list is the only one shown. When omitted (or null) the window opens in
   * full browse mode (sidebar + spreadsheet).
   */
  forcedListId?: string | null;
}

export default function StructuredListManagerV1Window({
  title,
  id = "picklist-manager-v1-window",
  forcedListId = null,
  ...windowProps
}: StructuredListManagerV1WindowProps) {
  const dispatch = useAppDispatch();

  const onClose = useCallback(() => {
    dispatch(closeOverlay({ overlayId: "structuredListManagerV1Window" }));
  }, [dispatch]);

  const resolvedTitle = title ?? (forcedListId ? "Picklist" : "Picklists — v1");

  return (
    <WindowPanel
      id={id}
      title={resolvedTitle}
      onClose={onClose}
      minWidth={forcedListId ? 480 : 720}
      minHeight={420}
      width={forcedListId ? 720 : 1000}
      height={640}
      urlSyncKey="structuredListManagerV1"
      urlSyncId={forcedListId ?? "default"}
      className="bg-background/95 backdrop-blur-md"
      overlayId="structuredListManagerV1Window"
      {...windowProps}
    >
      {/* 🚨 A WINDOW MOUNTS ITS OWN MENU (context-menu-v3 SKILL). Without
          this, a right-click here is answered by whatever page sits
          underneath. Reuses the `structured_list` entity token already
          registered by the v3 engine's own row menu
          (`features/structured-lists/structured-list-manager-v3.tsx`); in
          browse mode (no `forcedListId`) the pane shows many lists, so no
          single entity applies. */}
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
        <div className="h-full w-full overflow-hidden p-3">
          <StructuredListManagerV1Client forcedListId={forcedListId} />
        </div>
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
