/**
 * features/files/components/surfaces/single-file/SingleFileShell.tsx
 *
 * Dedicated full-page viewer for a single file at `/files/f/{fileId}`.
 *
 * Replaces the old "PageShell with initialFileId" layout which rendered the
 * IconRail + NavSidebar + FileTable + side-panel PreviewPane — a layout
 * indistinguishable from `/files` plus a side panel. On the dedicated route
 * the file IS the page, so this shell removes the list/sidebar and gives
 * the entire viewport to the file content.
 *
 * Layout:
 *
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ Top bar: back, breadcrumb, filename, actions, Show files   │
 *   ├────────────────────────────────────────────────────────────┤
 *   │ Tabs: Preview / Edit / Document / Analysis / Share / Info  │
 *   ├──────────┬─────────────────────────────────────────────────┤
 *   │   per-   │                                                 │
 *   │   tab    │            full-width file content              │
 *   │   rail   │                                                 │
 *   └──────────┴─────────────────────────────────────────────────┘
 *
 * Mobile detection delegates to `MobileStack`, the same component PageShell
 * uses on mobile — it already has a clean single-file detail view via
 * `initialFileId`. A bespoke mobile shell can land later.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { setActiveFileId } from "@/features/files/redux/slice";
import { attachVirtualRoots } from "@/features/files/redux/virtual-thunks";
import { selectFileById } from "@/features/files/redux/selectors";
import { getPreviewCapability } from "@/features/files/utils/preview-capabilities";
import { MobileStack } from "../MobileStack";
import { FileTabsBody, type FileTab } from "../FileTabsBody";
import { FileViewerControlsProvider } from "../FileViewerControlsContext";
import { SidebarModeProvider } from "../desktop/SidebarModeToggle";
import { SingleFileTopBar } from "./SingleFileTopBar";
import { FileViewerControlRail } from "./FileViewerControlRail";

export interface SingleFileShellProps {
  fileId: string;
  className?: string;
}

export function SingleFileShell({ fileId, className }: SingleFileShellProps) {
  const isMobile = useIsMobile();
  if (isMobile) {
    // Mobile: defer to the existing push-nav stack. It already has a
    // dedicated single-file detail level. A liquid-glass-styled
    // mobile shell tailored to the single-file route is a follow-up.
    return <MobileStack initialFolderId={null} initialFileId={fileId} />;
  }
  return (
    <SidebarModeProvider>
      <FileViewerControlsProvider>
        <SingleFileShellDesktop fileId={fileId} className={className} />
      </FileViewerControlsProvider>
    </SidebarModeProvider>
  );
}

function SingleFileShellDesktop({ fileId, className }: SingleFileShellProps) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const [activeTab, setActiveTab] = useState<FileTab>("preview");

  // Bootstrap exactly like PageShell does — set the active file id once so
  // every consumer that reads it (lineage chip, debug panel, share links,
  // window panels) sees the same selection, and mount any virtual roots
  // so virtual file ids resolve. Tree loading itself is handled globally.
  useEffect(() => {
    dispatch(setActiveFileId(fileId));
    void dispatch(attachVirtualRoots());
    // Deep-link self-heal: the route's server component already verified
    // this file exists, but the client store only hydrates workspace
    // subtrees — a direct /files/f/{id} visit (or an extractor-uploaded
    // file outside the workspace roots) otherwise renders "File not
    // found" forever. Fetch the single row and upsert it. Loud on fire:
    // a hit here means the proactive hydration path missed a real file.
    void (async () => {
      if (selectFileById(store.getState(), fileId)) return;
      const { supabase } = await import("@/utils/supabase/client");
      const { filesDb } = await import("@/features/files/filesDb");
      const { dbRowToCloudFile } =
        await import("@/features/files/redux/converters");
      const { upsertFile } = await import("@/features/files/redux/slice");
      const { data, error } = await filesDb(supabase)
        .from("files")
        .select("*")
        .eq("id", fileId)
        .is("deleted_at", null)
        .maybeSingle();
      if (error || !data) return;
      console.warn(
        "[files] deep-link self-heal hydrated file missing from store:",
        fileId,
      );
      dispatch(upsertFile(dbRowToCloudFile(data)));
    })();
    // Cleanup: clear the active file id on unmount so navigating away
    // doesn't leave a stale selection that other surfaces could observe.
    return () => {
      dispatch(setActiveFileId(null));
    };
  }, [dispatch, fileId]);

  const previewKind = useMemo(() => {
    if (!file) return null;
    return getPreviewCapability(file.fileName, file.mimeType, file.fileSize)
      .previewKind;
  }, [file]);

  const rail = (
    <FileViewerControlRail activeTab={activeTab} previewKind={previewKind} />
  );

  return (
    <div
      className={cn(
        "flex h-[calc(100dvh-var(--header-height,2.5rem))] min-h-0 flex-col overflow-hidden bg-card",
        className,
      )}
    >
      <SingleFileTopBar fileId={fileId} />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Rail: only renders a column when there are controls for the
         * current tab+kind. The dispatcher returns `null` for tabs/kinds
         * with no useful controls, and we collapse the column entirely
         * so the body claims the full width. */}
        {rail}
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          <FileTabsBody
            fileId={fileId}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            density="comfortable"
            className="flex-1 min-h-0"
          />
        </div>
      </div>
    </div>
  );
}
