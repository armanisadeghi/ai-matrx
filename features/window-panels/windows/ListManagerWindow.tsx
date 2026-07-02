"use client";

import React, { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { closeOverlay } from "@/lib/redux/slices/overlaySlice";
import {
  WindowPanel,
  type WindowPanelProps,
} from "@/features/window-panels/WindowPanel";
import { ListFilter } from "lucide-react";
import { ListManagerFloatingWorkspace } from "@/features/user-lists/components/ListManagerFloatingWorkspace";

export interface ListManagerWindowProps extends Omit<
  WindowPanelProps,
  "children" | "title" | "actionsLeft" | "actionsRight"
> {
  title?: string;
}

export default function ListManagerWindow({
  title = "List Manager",
  id = "list-manager-window",
  ...windowProps
}: ListManagerWindowProps) {
  const dispatch = useAppDispatch();

  const onClose = useCallback(() => {
    dispatch(closeOverlay({ overlayId: "listManagerWindow" }));
  }, [dispatch]);

  /* 
    We render WindowPanel without a `sidebar` prop because 
    ListManagerFloatingWorkspace implements its own split view layout 
    using flex containers, so the whole interior space belongs to it.
  */
  return (
    <WindowPanel
      id={id}
      title={title}
      onClose={onClose}
      minWidth={600}
      minHeight={450}
      width={900}
      height={650}
      urlSyncKey="listManager"
      urlSyncId="default"
      className="bg-background/95 backdrop-blur-md"
      overlayId="listManagerWindow"
      {...windowProps}
    >
      <ListManagerFloatingWorkspace />
    </WindowPanel>
  );
}
