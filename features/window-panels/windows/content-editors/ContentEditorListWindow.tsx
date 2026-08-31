"use client";

/**
 * ContentEditorListWindow
 *
 * Variant 2 of 3: a list of documents on the left + exactly one active editor
 * on the right. No tabs — clicking a list item swaps the editor content.
 * Built on the same primitives as `ContentEditorWorkspaceWindow` but with
 * `openIds` pinned to `[activeId]` so only one document is ever "open".
 */

import React, { useCallback, useMemo, useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ContentEditor } from "@/components/official/content-editor/ContentEditor";
import {
  ContentEditorList,
  type ContentEditorListItem,
} from "@/components/official/content-editor/ContentEditorList";
import { useContentEditorEmitter } from "./useContentEditorEmitter";
import type { ContentEditorSeedDocument } from "./useOpenContentEditorWindow";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

export interface ContentEditorListWindowProps {
  windowInstanceId: string;
  callbackGroupId?: string | null;

  documents?: ContentEditorSeedDocument[];
  activeDocumentId?: string | null;
  listTitle?: string | null;
  title?: string | null;

  onClose: () => void;
}

interface InternalDoc extends ContentEditorSeedDocument {}

export function ContentEditorListWindow({
  windowInstanceId,
  callbackGroupId,
  documents: initialDocuments = [],
  activeDocumentId: initialActiveId,
  listTitle,
  title,
  onClose,
}: ContentEditorListWindowProps) {
  const [documents, setDocuments] = useState<InternalDoc[]>(initialDocuments);
  const [activeId, setActiveId] = useState<string | undefined>(
    initialActiveId ?? initialDocuments[0]?.id ?? undefined,
  );

  const { emit } = useContentEditorEmitter(callbackGroupId, windowInstanceId);

  const activeDoc = useMemo(
    () => documents.find((d) => d.id === activeId),
    [documents, activeId],
  );

  const listItems: ContentEditorListItem[] = useMemo(
    () =>
      documents.map(({ id, title: t, description }) => ({
        id,
        title: t,
        description,
      })),
    [documents],
  );

  const handleItemClick = useCallback(
    (id: string) => {
      setActiveId(id);
      emit({ type: "active-change", documentId: id });
      emit({ type: "open", documentId: id });
    },
    [emit],
  );

  const handleChange = useCallback(
    (next: string) => {
      if (!activeId) return;
      setDocuments((prev) => {
        const out = prev.map((d) =>
          d.id === activeId ? { ...d, value: next } : d,
        );
        emit({
          type: "documents-change",
          documents: out.map(({ id, title: t, value }) => ({
            id,
            title: t,
            value,
          })),
          openIds: activeId ? [activeId] : [],
        });
        return out;
      });
      emit({ type: "change", documentId: activeId, value: next });
    },
    [activeId, emit],
  );

  const handleSave = useCallback(
    async (next: string) => {
      if (!activeId) return;
      emit({ type: "save", documentId: activeId, value: next });
    },
    [activeId, emit],
  );

  const handleModeChange = useCallback(
    (mode: string) => {
      emit({ type: "mode-change", documentId: activeId ?? null, mode });
    },
    [activeId, emit],
  );

  const collectData = useCallback(
    () => ({
      documents,
      activeDocumentId: activeId ?? null,
      listTitle: listTitle ?? null,
      title: title ?? null,
    }),
    [documents, activeId, listTitle, title],
  );

  return (
    <WindowPanel
      id={`content-editor-list-window-${windowInstanceId}`}
      title={title ?? "Content editor"}
      overlayId="contentEditorListWindow"
      minWidth={720}
      minHeight={420}
      width={960}
      height={600}
      position="center"
      onClose={onClose}
      onCollectData={collectData}
      sidebar={
        <div className="flex flex-col min-h-0 h-full">
          <div className="flex-1 min-h-0 p-1.5">
            {/* Page-local list of the window's own seed documents — not a
             * platform record, so a resolved row-level menu would attach
             * to nothing real. A pane-level fallback still beats silently
             * falling through to the page underneath. */}
            <NonEditableContextMenu
              sourceFeature="documents"
              contentSource={{ type: "raw" }}
              contextData={{ content: listTitle ?? "Documents" }}
            >
              <ContentEditorList
                items={listItems}
                activeId={activeId}
                openIds={activeId ? [activeId] : []}
                onItemClick={handleItemClick}
                title={listTitle ?? "Documents"}
                className="h-full"
              />
            </NonEditableContextMenu>
          </div>
        </div>
      }
      sidebarDefaultSize={220}
      sidebarMinSize={160}
      sidebarExpandsWindow
      bodyClassName="p-3"
    >
      {/*
       * Fallback pane menu — ContentEditor's own EditableContextMenu /
       * NonEditableContextMenu only wraps its "plain" and "preview" modes;
       * wysiwyg/markdown/matrx-split (its DEFAULT mode) render with no menu
       * at all. This outer wrapper answers the right-click for those modes;
       * the inner one wins whenever it exists.
       */}
      <NonEditableContextMenu
        sourceFeature="documents"
        contentSource={{ type: "raw" }}
        contextData={{ content: "" }}
        resolveContextOnOpen={() => ({ content: activeDoc?.value ?? "" })}
      >
        {activeDoc ? (
          <ContentEditor
            key={activeDoc.id}
            value={activeDoc.value}
            onChange={handleChange}
            onSave={handleSave}
            onModeChange={handleModeChange}
            title={activeDoc.title}
            showCopyButton
            showContentManager
            className="h-full"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-zinc-500 dark:text-zinc-400">
            Select a document to edit
          </div>
        )}
      </NonEditableContextMenu>
    </WindowPanel>
  );
}

export default ContentEditorListWindow;
