// features/rich-document/annotations/RecordAnnotations.tsx
//
// THE READING SET ON A SAVED RECORD — the one mount every host of saved
// content uses (RichDocument for notes and saved documents, the chat answer):
//
//   - installs the SAME annotation sidecar the study guide uses, anchored to
//     the record itself (the note, the chat message, the document), so the one
//     selection toolbar offers highlight, comment, suggest and link there;
//   - owns the Notes & comments dock, placed the Google Docs way: on desktop a
//     floating right-side panel that never pushes content (the transcript keeps
//     its width), on a phone the bottom sheet. It opens when the person makes
//     or focuses an item (Comment, Highlight, a click on a painted passage) or
//     picks "Notes & comments" in the ⋯ menu, and never opens empty by itself;
//   - holds its reads and live channel while the content is far out of view
//     (a long transcript opens channels only for what is on screen).
//
// A host already inside a sidecar (the study guide, the studio's Annotate
// view) is left alone: the outer sidecar owns that text.

"use client";

import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { AnnotatedContent, AnnotationSidecarProvider, useOptionalSidecar, useSidecar } from "./AnnotationSidecar";
import { AnnotationPanel } from "./AnnotationPanel";
import { closeDock, isDockOpen, openDock, registerDock, setDockCount, subscribeDocks } from "./record-annotations-store";
import { recordKeyOf } from "./record-of-source";
import type { AnnotationSource } from "./types";

/** How far outside the viewport a record still counts as on screen (reads start before it scrolls in). */
const LIVE_MARGIN = "800px 0px";

export function RecordAnnotations({ record, children }: { record: AnnotationSource | null; children: ReactNode }) {
  const outer = useOptionalSidecar();
  if (outer || !record) return <>{children}</>;
  return <RecordAnnotationsMount record={record}>{children}</RecordAnnotationsMount>;
}

function RecordAnnotationsMount({ record, children }: { record: AnnotationSource; children: ReactNode }) {
  const instance = useId();
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [onScreen, setOnScreen] = useState(false);
  const open = useSyncExternalStore(subscribeDocks, () => isDockOpen(instance), () => false);

  useEffect(() => {
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setOnScreen(true);
      return;
    }
    const io = new IntersectionObserver((entries) => setOnScreen(entries.some((e) => e.isIntersecting)), {
      rootMargin: LIVE_MARGIN,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [el]);

  return (
    <AnnotationSidecarProvider source={record} live={onScreen || open} onActivity={() => openDock(instance)}>
      <div ref={setEl} data-record-annotations={recordKeyOf(record)}>
        <AnnotatedContent>{children}</AnnotatedContent>
      </div>
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
