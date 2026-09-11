"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { revealActiveEditorTab } from "./editorTabsScroll";

export const EditorTabs: React.FC = () => {
  const dispatch = useAppDispatch();
  const { byId, order } = useAppSelector(selectCodeTabs);
  const activeId = useAppSelector(selectActiveTabId);
  const openRenderPreview = useOpenRenderPreview();
  const [closeConfirmationId, setCloseConfirmationId] = useState<string | null>(null);
  const tabListRef = useRef<HTMLDivElement | null>(null);

  // Keep the selection visible inside the horizontal strip only. This avoids
  // scrolling the editor/page when a tab changes from URL restore, keyboard,
  // or a narrow mobile viewport.
  useEffect(() => {
    const list = tabListRef.current;
    if (!list || !activeId) return undefined;
    const revealActiveTab = () => {
      revealActiveEditorTab(list, activeId);
    };
    revealActiveTab();
    const observer = new ResizeObserver(revealActiveTab);
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeId, order]);

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
      ref={tabListRef}
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
            path={tab.path}
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
