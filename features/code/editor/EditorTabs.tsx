"use client";

import React, { useCallback, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  closeTab,
  selectActiveTabId,
  selectCodeTabs,
  setActiveTab,
} from "../redux/tabsSlice";
import { EditorTab } from "./EditorTab";
import { useOpenRenderPreview } from "../hooks/useOpenRenderPreview";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export const EditorTabs: React.FC = () => {
  const dispatch = useAppDispatch();
  const { byId, order } = useAppSelector(selectCodeTabs);
  const activeId = useAppSelector(selectActiveTabId);
  const openRenderPreview = useOpenRenderPreview();
  const [closeConfirmationId, setCloseConfirmationId] = useState<string | null>(null);

  const handleSelect = useCallback(
    (id: string) => {
      dispatch(setActiveTab(id));
    },
    [dispatch],
  );

  const handleClose = useCallback(
    (id: string) => {
      if (byId[id]?.dirty) {
        setCloseConfirmationId(id);
      } else {
        dispatch(closeTab(id));
      }
    },
    [byId, dispatch],
  );

  const handleOpenPreview = useCallback(
    (id: string) => {
      openRenderPreview(id);
    },
    [openRenderPreview],
  );

  if (order.length === 0) {
    return (
      <div
        role="tablist"
        className="flex h-full w-full items-center px-2 text-[11px] text-neutral-500 dark:text-neutral-400"
        aria-label="Editor tabs"
      >
        <span className="truncate">
          No open files — pick one from the Explorer.
        </span>
      </div>
    );
  }

  return (
    <>
      <div
      role="tablist"
      className="flex h-full w-full items-stretch overflow-x-auto"
      >
      {order.map((id) => {
        const tab = byId[id];
        if (!tab) return null;
        return (
          <EditorTab
            key={id}
            id={id}
            name={tab.name}
            active={id === activeId}
            dirty={tab.dirty}
            onSelect={handleSelect}
            onClose={handleClose}
            onMiddleClick={handleClose}
            onOpenPreview={
              tab.kind === "render-preview" ? undefined : handleOpenPreview
            }
          />
        );
      })}
      </div>
      <ConfirmDialog
        open={closeConfirmationId !== null}
        onOpenChange={(open) => {
          if (!open) setCloseConfirmationId(null);
        }}
        title="Discard unsaved changes?"
        description="This file has edits that have not been saved. Closing it will permanently discard those edits."
        confirmLabel="Discard changes"
        variant="destructive"
        onConfirm={() => {
          if (closeConfirmationId) dispatch(closeTab(closeConfirmationId));
          setCloseConfirmationId(null);
        }}
      />
    </>
  );
};
