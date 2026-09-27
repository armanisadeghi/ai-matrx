// features/rich-document/annotations/RecordAnnotationsImpl.tsx
//
// The body of <RecordAnnotations> (the light shell in ./RecordAnnotations.tsx,
// which every host imports). Loaded only where a saved record renders; it
// attaches to the element the shell already rendered, so the content is never
// re-parented or remounted when the reading set arrives.

"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { AnnotatedElement, AnnotationSidecarProvider, useOptionalSidecar, useSidecar } from "./AnnotationSidecar";
import { AnnotationPanel } from "./AnnotationPanel";
import { closeDock, isDockOpen, openDock, registerDock, setDockCount, subscribeDocks } from "./record-annotations-store";
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

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="complementary"
      aria-label={title}
      data-annotation-dock={recordKey}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.stopPropagation();
          close();
        }
      }}
      className="fixed right-3 z-50 flex w-[22rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-lg border border-border bg-card shadow-xl"
      style={{ top: "calc(var(--header-height, 3rem) + 0.75rem)", bottom: "0.75rem" }}
    >
      <AnnotationPanel className="min-h-0 flex-1" onClose={close} />
    </div>,
    document.body,
  );
}
