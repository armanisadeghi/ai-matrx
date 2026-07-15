"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  WindowPanel,
  type WindowPanelProps,
} from "@/features/window-panels/WindowPanel";
import { StructuredListManagerV1Client } from "@/features/structured-lists/StructuredListManagerV1Client";

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
      <div className="h-full w-full overflow-hidden p-3">
        <StructuredListManagerV1Client forcedListId={forcedListId} />
      </div>
    </WindowPanel>
  );
}
