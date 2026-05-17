/**
 * features/files/components/surfaces/single-file/FileViewerControlRail.tsx
 *
 * Left-side control rail for `SingleFileShell`. Dispatches on
 * `(activeTab, previewKind)` to render the right control set:
 *
 *   - Preview / image  → zoom, rotate, fit, transparency grid
 *   - Preview / html   → Rendered/Source toggle + viewport picker
 *   - Edit             → font size, word-wrap, minimap, tab size
 *   - any other        → nothing (rail collapses to a thin spacer)
 *
 * Rendered as a fixed-width column. When no controls are appropriate
 * (e.g. Info tab, generic preview), `null` collapses the rail entirely
 * in the parent shell so the body claims the full width.
 */

"use client";

import type { FileTab } from "@/features/files/components/surfaces/FileTabsBody";
import type { PreviewKind } from "@/features/files/utils/preview-capabilities";
import { ImagePreviewControls } from "./ImagePreviewControls";
import { HtmlPreviewControls } from "./HtmlPreviewControls";
import { EditControls } from "./EditControls";

export interface FileViewerControlRailProps {
  activeTab: FileTab;
  previewKind: PreviewKind | null;
}

/**
 * Returns the rail element for the current tab + preview kind, or `null`
 * when no controls apply (so the parent shell can collapse the column).
 */
export function FileViewerControlRail({
  activeTab,
  previewKind,
}: FileViewerControlRailProps) {
  if (activeTab === "preview") {
    if (previewKind === "image") return <ImagePreviewControls />;
    if (previewKind === "html") return <HtmlPreviewControls />;
    // PDF, video, audio, markdown, code, data, text, svg, generic — their
    // bodies already carry inline toolbars sized for full-width. We can
    // promote them to the rail as a follow-up, but doing it now would
    // require gutting and re-wiring each previewer's existing toolbar
    // for marginal UX gain on this PR.
    return null;
  }

  if (activeTab === "edit") {
    // Editor controls only make sense when the file is text-editable.
    // For non-editable kinds the Edit tab shows a "Coming soon" hint
    // and the rail has nothing useful to surface.
    const editableKinds: ReadonlyArray<PreviewKind> = [
      "text",
      "code",
      "markdown",
      "data",
      "svg",
      "html",
    ];
    if (previewKind && editableKinds.includes(previewKind)) {
      return <EditControls />;
    }
    return null;
  }

  // Document / Analysis / Share / Info / Versions — no shell-level
  // controls. Each of those tabs renders its own filters / actions
  // inline already.
  return null;
}

/** Visual chrome shared by every rail panel — fixed width, padded, top-down. */
export function ControlRailFrame({ children }: { children: React.ReactNode }) {
  return (
    <aside
      className="flex h-full w-44 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-muted/20 px-2 py-3"
      aria-label="Viewer controls"
    >
      {children}
    </aside>
  );
}

export function ControlRailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <h3 className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
