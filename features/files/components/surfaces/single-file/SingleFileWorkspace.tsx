/**
 * features/files/components/surfaces/single-file/SingleFileWorkspace.tsx
 *
 * The single-file working area — the per-tab control rail beside
 * `FileTabsBody` (Preview / Edit / Knowledge / Analysis / Share / Info /
 * Versions) — driven by `SingleFileSurfaceHost`'s view state, so the tab and
 * page an agent opens are the tab and page the person sees.
 *
 * Two layouts of the SAME working area (must sit inside a
 * `SingleFileSurfaceHost`):
 *   - `layout="page"` — the `/files/f/[fileId]` page, under its route header
 *     (which names the file and carries its actions): the side control rail
 *     and the full tab strip.
 *   - `layout="tile"` — a small host that names the file in its OWN header (a
 *     Board tile: `BoardItemType.TitleField`): ONE row — the tabs as a menu,
 *     the kind's actions, View controls (the rail's panel in a popover) and
 *     the file's Copy link / Download / More. The file is never named twice.
 */

"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { selectFileById } from "@/features/files/redux/selectors";
import { getPreviewCapability } from "@/features/files/utils/preview-capabilities";
import { FileTabsBody } from "../FileTabsBody";
import { FileViewerControlsProvider } from "../FileViewerControlsContext";
import {
  FileViewerControlRail,
  FileViewerControlsButton,
} from "./FileViewerControlRail";
import { SingleFileActionButtons } from "./SingleFileActions";
import { useSingleFileView } from "./SingleFileSurfaceHost";

export interface SingleFileWorkspaceProps {
  /** `page`: side rail + tab strip under a route header. `tile`: one compact row. */
  layout?: "page" | "tile";
  className?: string;
}

export function SingleFileWorkspace({
  layout = "page",
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
        {layout === "tile" ? (
          <FileTabsBody
            fileId={fileId}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            pageNumber={pageNumber}
            onPageChange={setPageNumber}
            density="compact"
            tabs="menu"
            hostInPdfToolbar
            trailing={
              <>
                <FileViewerControlsButton
                  activeTab={activeTab}
                  previewKind={previewKind}
                />
                <SingleFileActionButtons fileId={fileId} />
              </>
            }
            className="min-h-0 flex-1"
          />
        ) : (
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
                density="comfortable"
                className="min-h-0 flex-1"
              />
            </div>
          </div>
        )}
      </div>
    </FileViewerControlsProvider>
  );
}
