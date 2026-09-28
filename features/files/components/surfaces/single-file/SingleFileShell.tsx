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

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { setActiveFileId } from "@/features/files/redux/slice";
import { attachVirtualRoots } from "@/features/files/redux/virtual-thunks";
import { selectFileById } from "@/features/files/redux/selectors";
import { rememberFileOrganization } from "@/features/files/api/fileOrganization";
import { useDeclarePageObjectOrganization } from "@/features/shell/pageObjectOrganization";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { MobileStack } from "../MobileStack";
import { isFileTab } from "../FileTabsBody";
import { SidebarModeProvider } from "../desktop/SidebarModeToggle";
import { SingleFileTopBar } from "./SingleFileTopBar";
import { usePageCapture } from "@/components/agent-copy/page-capture/usePageCapture";
import { recordPageCapture } from "@/components/agent-copy/page-capture/pageCapture";

/** A file's facts for a capture — never a URL or a storage path (media cluster rule). */
function fileFacts(file: unknown): Record<string, unknown> | string {
  if (!file || typeof file !== "object") return "The file is still loading, or you cannot read it.";
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(file as Record<string, unknown>)) {
    if (/url|path|signed|storage|token|blob/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}
import { SingleFileSurfaceHost } from "./SingleFileSurfaceHost";
import { SingleFileWorkspace } from "./SingleFileWorkspace";

export interface SingleFileShellProps {
  fileId: string;
  /**
   * The organization the FILE lives in, read by the route from the file's own row
   * (`files.files.organization_id`, under RLS as the person). Every per-file request this page
   * sends carries it, so the file opens whatever organization is — or is not — picked in the
   * shell (access is personal; GATES-TAIL, VERIFIER-21 #2).
   */
  organizationId?: string | null;
  className?: string;
}

export function SingleFileShell({ fileId, organizationId, className }: SingleFileShellProps) {
  // Seeded during render, before any child fires its first per-file request.
  rememberFileOrganization(fileId, organizationId);
  // The shell header believes the file: never a red "Choose org" over a file that opens in its
  // own organization — a quiet "Viewing in <org>" when she is in it, else nothing (VERIFIER-21 #7).
  const { organizations } = useUserOrganizations();
  useDeclarePageObjectOrganization(
    organizationId
      ? {
          organizationId,
          name: organizations.find((o) => o.id === organizationId)?.name ?? null,
          shownByPage: false,
        }
      : null,
  );
  // The alchemy capture (lane ALCHEMY-BUTTON): which file, whose organization, its facts.
  const file = useAppSelector((s) => selectFileById(s, fileId));
  usePageCapture(() =>
    recordPageCapture({
      title: file?.fileName ? `File: ${file.fileName}` : "File",
      route: `/files/f/${fileId}`,
      record: { id: fileId, name: file?.fileName ?? null },
      table: { id: null, name: "Files" },
      selection: {
        Organization: {
          id: organizationId ?? null,
          name: organizations.find((o) => o.id === organizationId)?.name ?? null,
        },
      },
      sections: [{ id: "file", title: "File", role: "data", value: fileFacts(file) }],
    }),
  );
  const isMobile = useIsMobile();
  if (isMobile) {
    // Mobile: defer to the existing push-nav stack. It already has a
    // dedicated single-file detail level. A liquid-glass-styled
    // mobile shell tailored to the single-file route is a follow-up.
    return <MobileStack initialFolderId={null} initialFileId={fileId} />;
  }
  return (
    <SidebarModeProvider>
      <SingleFileShellDesktop fileId={fileId} className={className} />
    </SidebarModeProvider>
  );
}

function SingleFileShellDesktop({ fileId, className }: SingleFileShellProps) {
  const dispatch = useAppDispatch();
  // `?tab=` deep link (citations route to `?tab=document&page=…&chunk=…`).
  const tabParam = useSearchParams()?.get("tab") ?? null;
  const initialTab = isFileTab(tabParam) ? tabParam : undefined;

  // Bootstrap exactly like PageShell does — set the active file id once so
  // every consumer that reads it (lineage chip, debug panel, share links,
  // window panels) sees the same selection, and mount any virtual roots
  // so virtual file ids resolve. Tree loading itself is handled globally.
  useEffect(() => {
    dispatch(setActiveFileId(fileId));
    void dispatch(attachVirtualRoots());
    // Cleanup: clear the active file id on unmount so navigating away
    // doesn't leave a stale selection that other surfaces could observe.
    return () => {
      dispatch(setActiveFileId(null));
    };
  }, [dispatch, fileId]);

  // The file's surface (`matrx-user/file`) and its view state come from the
  // SAME host a File tile on a Board mounts — see SingleFileSurfaceHost.
  return (
    <SingleFileSurfaceHost key={fileId} fileId={fileId} initialTab={initialTab}>
      <div
        className={cn(
          "flex h-full min-h-0 flex-col overflow-hidden bg-card pt-[var(--shell-header-h)]",
          className,
        )}
      >
        <SingleFileTopBar fileId={fileId} />
        <SingleFileWorkspace density="comfortable" className="flex-1" />
      </div>
    </SingleFileSurfaceHost>
  );
}
