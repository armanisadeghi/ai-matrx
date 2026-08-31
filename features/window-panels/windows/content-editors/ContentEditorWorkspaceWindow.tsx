"use client";

/**
 * ContentEditorWorkspaceWindow
 *
 * Variant 3 of 3: full-featured editor workspace with a list sidebar AND
 * browser-style tabs. Multiple documents can be open simultaneously; any
 * one is "active" at a time. All events flow back through the callback
 * group the caller registered.
 */

import React, { useCallback, useRef, useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  ContentEditorTabsWithList,
  type ContentEditorDocument,
} from "@/components/official/content-editor/ContentEditorTabsWithList";
import { useContentEditorEmitter } from "./useContentEditorEmitter";
import type { ContentEditorSeedDocument } from "./useOpenContentEditorWindow";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

export interface ContentEditorWorkspaceWindowProps {
  windowInstanceId: string;
  callbackGroupId?: string | null;

  documents?: ContentEditorSeedDocument[];
  openDocumentIds?: string[];
  activeDocumentId?: string | null;
  listTitle?: string | null;
  title?: string | null;

  onClose: () => void;
}

export function ContentEditorWorkspaceWindow({
  windowInstanceId,
  callbackGroupId,
  documents: initialDocuments = [],
  openDocumentIds: initialOpenIds,
  activeDocumentId: initialActiveId,
  listTitle,
  title,
  onClose,
}: ContentEditorWorkspaceWindowProps) {
  const [documents, setDocuments] = useState<ContentEditorDocument[]>(
    () => initialDocuments as ContentEditorDocument[],
  );
  const [openIds, setOpenIds] = useState<string[]>(
    initialOpenIds ?? initialDocuments.map((d) => d.id),
  );
  const [activeId, setActiveId] = useState<string | undefined>(
    initialActiveId ??
      initialOpenIds?.[0] ??
      initialDocuments[0]?.id ??
      undefined,
  );

  const { emit } = useContentEditorEmitter(callbackGroupId, windowInstanceId);

  const lastDocsRef = useRef(documents);
  const lastOpenIdsRef = useRef(openIds);

  const emitDocumentsChange = useCallback(
    (nextDocs: ContentEditorDocument[], nextOpenIds: string[]) => {
      emit({
        type: "documents-change",
        documents: nextDocs.map(({ id, title: t, value }) => ({
          id,
          title: t,
          value,
        })),
        openIds: nextOpenIds,
      });
    },
    [emit],
  );

  const handleDocumentsChange = useCallback(
    (next: ContentEditorDocument[]) => {
      // Detect per-document edits and emit `change` events for each one.
      const prev = lastDocsRef.current;
      const prevById = new Map(prev.map((d) => [d.id, d]));
      for (const doc of next) {
        const previous = prevById.get(doc.id);
        if (previous && previous.value !== doc.value) {
          emit({ type: "change", documentId: doc.id, value: doc.value });
        }
      }
      setDocuments(next);
      lastDocsRef.current = next;
      emitDocumentsChange(next, lastOpenIdsRef.current);
    },
    [emit, emitDocumentsChange],
  );

  const handleOpenIdsChange = useCallback(
    (next: string[]) => {
      const prev = lastOpenIdsRef.current;
      // Tabs closed:
      for (const id of prev) {
        if (!next.includes(id)) emit({ type: "close-tab", documentId: id });
      }
      // Tabs opened:
      for (const id of next) {
        if (!prev.includes(id)) emit({ type: "open", documentId: id });
      }
      setOpenIds(next);
      lastOpenIdsRef.current = next;
      emitDocumentsChange(lastDocsRef.current, next);
    },
    [emit, emitDocumentsChange],
  );

  const handleActiveIdChange = useCallback(
    (id: string | undefined) => {
      setActiveId(id);
      emit({ type: "active-change", documentId: id ?? null });
    },
    [emit],
  );

  const handleSave = useCallback(
    async (next: string) => {
      if (!activeId) return;
      emit({ type: "save", documentId: activeId, value: next });
    },
    [activeId, emit],
  );

  const collectData = useCallback(
    () => ({
      documents: documents.map(({ id, title: t, value, description }) => ({
        id,
        title: t,
        value,
        description,
      })),
      openDocumentIds: openIds,
      activeDocumentId: activeId ?? null,
      listTitle: listTitle ?? null,
      title: title ?? null,
    }),
    [documents, openIds, activeId, listTitle, title],
  );

  const hasDocuments = documents.length > 0;

  return (
    <WindowPanel
      id={`content-editor-workspace-window-${windowInstanceId}`}
      title={title ?? "Editor workspace"}
      overlayId="contentEditorWorkspaceWindow"
      minWidth={860}
      minHeight={480}
      width={1080}
      height={660}
      position="center"
      onClose={onClose}
      onCollectData={collectData}
      bodyClassName="p-3"
    >
      {/*
       * Fallback pane menu — ContentEditor's own EditableContextMenu /
       * NonEditableContextMenu only wraps its "plain" and "preview" modes;
       * wysiwyg/markdown/matrx-split (its DEFAULT mode) and the tabs/list
       * chrome around it render with no menu at all. This outer wrapper
       * answers the right-click there; the inner one wins whenever it
       * exists (nested deeper in the DOM for the covered modes).
       */}
      <NonEditableContextMenu
        sourceFeature="documents"
        contentSource={{ type: "raw" }}
        contextData={{ content: "" }}
        resolveContextOnOpen={() => ({
          content: documents.find((d) => d.id === activeId)?.value ?? "",
        })}
      >
        {hasDocuments ? (
          <ContentEditorTabsWithList
            documents={documents}
            onDocumentsChange={handleDocumentsChange}
            openIds={openIds}
            onOpenIdsChange={handleOpenIdsChange}
            activeId={activeId}
            onActiveIdChange={handleActiveIdChange}
            listTitle={listTitle ?? "Documents"}
            sharedModeSelector
            onSave={handleSave}
            className="h-full"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-xs text-zinc-500 dark:text-zinc-400">
            No documents available
          </div>
        )}
      </NonEditableContextMenu>
    </WindowPanel>
  );
}

export default ContentEditorWorkspaceWindow;
