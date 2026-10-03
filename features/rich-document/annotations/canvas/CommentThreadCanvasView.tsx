"use client";

/**
 * The `comment-thread` tab body. While the record is rendered on this page,
 * its own reading set portals the `AnnotationPanel` into the slot here (see
 * commentThreadKind.ts). Otherwise the record's canonical `CommentThread`
 * shows the same rows — the tab is never empty and never a second thread UI.
 */

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { CanvasKindProps } from "@ai-matrx/canvas/react";
import { CommentThread } from "@ai-matrx/associations/react";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { dockStateFor, openDockFor, subscribeDocks, docksVersion } from "../record-annotations-store";
import {
  commentThreadKey,
  readCommentThreadData,
  setCommentThreadSlot,
  useCommentThreadHeld,
  type CommentThreadData,
} from "./commentThreadKind";

export default function CommentThreadCanvasView({ item, data, isVisible }: CanvasKindProps<CommentThreadData>) {
  const thread = readCommentThreadData(data);
  const held = useCommentThreadHeld(item.id);
  const recordKey = thread ? commentThreadKey(thread.entity, thread.id) : null;
  // The record rendered on this page (its reading set registered a dock).
  useSyncExternalStore(subscribeDocks, docksVersion, docksVersion);
  const mountedHere = recordKey ? dockStateFor(recordKey) !== null : false;

  // A restored tab, or one opened before its record rendered: hand it to the page's reading set
  // once, so passages paint and every panel action works. Once per mount — two tabs never trade it.
  const handed = useRef(false);
  useEffect(() => {
    if (handed.current || held || !isVisible || !recordKey || !mountedHere) return;
    handed.current = true;
    openDockFor(recordKey);
  }, [held, isVisible, mountedHere, recordKey]);

  if (!thread) return <p className="p-3 text-sm text-muted-foreground">No record</p>;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-card" data-comment-thread={recordKey ?? undefined}>
      <div
        className={held ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "hidden"}
        data-comment-thread-slot={item.id}
        ref={(element) => {
          setCommentThreadSlot(item.id, element);
          return () => setCommentThreadSlot(item.id, null);
        }}
      />
      {held ? null : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3" data-comment-thread-standalone>
          <CommentThread token={thread.entity as EntityTypeToken} id={thread.id} />
        </div>
      )}
    </div>
  );
}
