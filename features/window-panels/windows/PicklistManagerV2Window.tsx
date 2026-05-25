"use client";

import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  WindowPanel,
  type WindowPanelProps,
} from "@/features/window-panels/WindowPanel";
import { PicklistManagerV2 } from "@/features/udt-picklist/PicklistManagerV2";

export interface PicklistManagerV2WindowProps extends Omit<
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

export default function PicklistManagerV2Window({
  title,
  id = "picklist-manager-v2-window",
  forcedListId = null,
  ...windowProps
}: PicklistManagerV2WindowProps) {
  const dispatch = useAppDispatch();

  const onClose = useCallback(() => {
    dispatch(closeOverlay({ overlayId: "picklistManagerV2Window" }));
  }, [dispatch]);

  const resolvedTitle = title ?? (forcedListId ? "Picklist" : "Picklists — v2");

  return (
    <WindowPanel
      id={id!}
      title={resolvedTitle}
      onClose={onClose}
      minWidth={forcedListId ? 460 : 680}
      minHeight={400}
      width={forcedListId ? 680 : 960}
      height={620}
      urlSyncKey="picklistManagerV2"
      urlSyncId={forcedListId ?? "default"}
      className="bg-background/95 backdrop-blur-md"
      overlayId="picklistManagerV2Window"
      {...windowProps}
    >
      <PicklistManagerV2 forcedListId={forcedListId ?? undefined} />
    </WindowPanel>
  );
}
