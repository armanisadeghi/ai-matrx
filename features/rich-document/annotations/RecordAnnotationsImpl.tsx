// features/rich-document/annotations/RecordAnnotationsImpl.tsx
//
// The body of <RecordAnnotations> (the light shell in ./RecordAnnotations.tsx,
// which every host imports). Loaded only where a saved record renders; it
// attaches to the element the shell already rendered, so the content is never
// re-parented or remounted when the reading set arrives.

"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { AnnotatedElement, AnnotationSidecarProvider, useOptionalSidecar, useSidecar } from "./AnnotationSidecar";
import { AnnotationPanel } from "./AnnotationPanel";
import { useOptionalCanvas } from "@ai-matrx/canvas/react";
import { openCanvasItem } from "@/features/canvas/host/openCanvasItem";
import {
  closeDock,
  isDockOpen,
  onDockClosedByPerson,
  openDock,
  registerDock,
  setDockCount,
  subscribeDocks,
} from "./record-annotations-store";
import {
  commentThreadItemId,
  commentThreadOpenInput,
  holdCommentThread,
  readCommentThreadData,
  useCommentThreadSlot,
} from "./canvas/commentThreadKind";
import { recordKeyOf } from "./record-of-source";
import type { AnnotationSource } from "./types";

/** How far outside the viewport a record still counts as on screen (reads start before it scrolls in). */
const LIVE_MARGIN = "800px 0px";

export default function RecordAnnotationsImpl({ record, root }: { record: AnnotationSource; root: HTMLElement }) {
  // A host already inside a sidecar (the study guide, the studio's Annotate view): that one owns the text.
  if (useOptionalSidecar()) return null;
  return <RecordAnnotationsMount record={record} root={root} />;
}

function RecordAnnotationsMount({ record, root }: { record: AnnotationSource; root: HTMLElement }) {
  const instance = useId();
  const [onScreen, setOnScreen] = useState(false);
  const open = useSyncExternalStore(subscribeDocks, () => isDockOpen(instance), () => false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setOnScreen(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setOnScreen(entries.some((e) => e.isIntersecting)), {
      rootMargin: LIVE_MARGIN,
    });
    io.observe(root);
    return () => io.disconnect();
  }, [root]);

  return (
    <AnnotationSidecarProvider source={record} live={onScreen || open} onActivity={() => openDock(instance)}>
      <AnnotatedElement root={root} />
      <RecordDock instance={instance} recordKey={recordKeyOf(record)} open={open} />
    </AnnotationSidecarProvider>
  );
}

function RecordDock({ instance, recordKey, open }: { instance: string; recordKey: string; open: boolean }) {
  const { api, source } = useSidecar();
  const isMobile = useIsMobile();
  const count = api.state.items.length;

  useEffect(() => registerDock(instance, recordKey), [instance, recordKey]);
  useEffect(() => setDockCount(instance, count), [instance, count]);

  if (!open) return null;
  const close = () => closeDock(instance);
  const title = `Notes & comments on ${source.title || "this record"}`;

  if (isMobile) {
    return (
      <Drawer open onOpenChange={(next) => !next && close()}>
        <DrawerContent className="h-[80dvh]" data-annotation-dock={recordKey}>
          <DrawerHeader className="sr-only">
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <AnnotationPanel className="min-h-0 flex-1" onClose={close} />
        </DrawerContent>
      </Drawer>
    );
  }

  return <CanvasDock instance={instance} recordKey={recordKey} title={title} close={close} />;
}

/**
 * Desktop: the dock IS the record's `comment-thread` canvas tab. The page keeps
 * the sidecar (anchors, paint, the selection toolbar) and portals the panel
 * into the tab — the right-hand region is the canvas, never a second floating
 * panel. The person closing the tab closes the dock; the person closing the
 * dock (its close button, the ⋯ toggle) closes the tab; another record's dock
 * taking over leaves this tab showing the record's standalone thread.
 */
function CanvasDock({
  instance,
  recordKey,
  title,
  close,
}: {
  instance: string;
  recordKey: string;
  title: string;
  close: () => void;
}) {
  const canvas = useOptionalCanvas();
  const { api, setActiveKey } = useSidecar();
  const split = recordKey.indexOf(":");
  const token = recordKey.slice(0, split);
  const id = recordKey.slice(split + 1);
  const itemId = commentThreadItemId(token, id);
  const latest = useRef({ close, title });
  useEffect(() => {
    latest.current = { close, title };
  });

  useEffect(() => {
    const existing = canvas?.getState().items[itemId];
    const opened = openCanvasItem(
      canvas,
      commentThreadOpenInput({
        entity: token,
        id,
        title: latest.current.title,
        focus: readCommentThreadData(existing?.data)?.focus ?? null,
      }),
    );
    if (!canvas || !opened) {
      // Announced by openCanvasItem; the dock must not stay "open" where nobody sees it.
      latest.current.close();
      return;
    }
    const release = holdCommentThread(opened);
    let open = true;
    const stopTab = canvas.store.subscribe(() => {
      if (open && !canvas.getState().items[opened]) {
        open = false;
        latest.current.close();
      }
    });
    const stopPerson = onDockClosedByPerson(instance, () => {
      if (!open) return;
      open = false;
      canvas.close(opened);
    });
    return () => {
      stopTab();
      stopPerson();
      release();
    };
  }, [canvas, instance, itemId, token, id]);

  // Bring the asked-for thread forward (a receipt link, a reply that just landed).
  const focus = useSyncExternalStore(
    (listener) => canvas?.store.subscribe(listener) ?? (() => {}),
    () => readCommentThreadData(canvas?.getState().items[itemId]?.data)?.focus ?? null,
    () => null,
  );
  const items = api.state.items;
  const focusKey = focus
    ? (items.find((item) => item.commentId === focus || item.replies.some((r) => r.id === focus))?.key ?? null)
    : null;
  const slot = useCommentThreadSlot(itemId);
  useEffect(() => {
    if (!focusKey) return;
    setActiveKey(focusKey);
    slot?.querySelector(`[data-annotation-key="${focusKey}"]`)?.scrollIntoView?.({ block: "nearest" });
    // setActiveKey is a fresh closure each render; the focus target is what moves.
  }, [focusKey, slot]);

  if (!slot) return null;
  return createPortal(
    <div role="complementary" aria-label={title} data-annotation-dock={recordKey} className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* The pane header is the only chrome: its close is the dock's close. */}
      <AnnotationPanel className="min-h-0 flex-1" />
    </div>,
    slot,
  );
}
