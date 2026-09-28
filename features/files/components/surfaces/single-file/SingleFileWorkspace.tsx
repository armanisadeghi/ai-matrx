/**
 * features/files/components/surfaces/single-file/SingleFileWorkspace.tsx
 *
 * The single-file working area — the per-tab control rail beside
 * `FileTabsBody` (Preview / Edit / Knowledge / Analysis / Share / Info /
 * Versions) — driven by `SingleFileSurfaceHost`'s view state, so the tab and
 * page an agent opens are the tab and page the person sees.
 *
 * Rendered by the `/files/f/[fileId]` page (under its route header) and by a
 * File tile on a Board (with `toolbar`: the file's own name menu and action
 * buttons, since a tile has no route header). Must sit inside a
 * `SingleFileSurfaceHost`.
 */

"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { selectFileById } from "@/features/files/redux/selectors";
import { getPreviewCapability } from "@/features/files/utils/preview-capabilities";
import { FileTabsBody } from "../FileTabsBody";
import { FileViewerControlsProvider } from "../FileViewerControlsContext";
import { FileViewerControlRail } from "./FileViewerControlRail";
import { SingleFileActionButtons, SingleFileNameLabel } from "./SingleFileActions";
import { useSingleFileView } from "./SingleFileSurfaceHost";

export interface SingleFileWorkspaceProps {
  /** Show the file's name menu + action buttons above the tabs (Board tile). */
  toolbar?: boolean;
  density?: "compact" | "comfortable";
  className?: string;
}

export function SingleFileWorkspace({
  toolbar = false,
  density = "comfortable",
  className,
}: SingleFileWorkspaceProps) {
  const { fileId, activeTab, setActiveTab, pageNumber, setPageNumber } =
    useSingleFileView();
  const file = useAppSelector((s) => selectFileById(s, fileId));
  const previewKind = file
    ? getPreviewCapability(file.fileName, file.mimeType, file.fileSize)
        .previewKind
    : null;

  return (
    <FileViewerControlsProvider>
      <div className={cn("flex h-full min-h-0 flex-col overflow-hidden bg-card", className)}>
        {toolbar ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-1 py-0.5">
            <SingleFileNameLabel fileId={fileId} className="min-w-0 flex-1" />
            <SingleFileActionButtons fileId={fileId} className="shrink-0" />
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Only renders a column when the current tab + kind has controls. */}
          <FileViewerControlRail activeTab={activeTab} previewKind={previewKind} />
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <FileTabsBody
              fileId={fileId}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              pageNumber={pageNumber}
              onPageChange={setPageNumber}
              density={density}
              className="min-h-0 flex-1"
            />
          </div>
        </div>
      </div>
    </FileViewerControlsProvider>
  );
}
