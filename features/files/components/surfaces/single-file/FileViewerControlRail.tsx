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
 * Rendered as a fixed-width column on the page (`layout="page"`), or behind
 * one "View controls" button in the compact workspace (`layout="tile"`, a
 * Board tile) — the same panels either way. When no controls are appropriate
 * (e.g. Info tab, generic preview), `null` collapses the rail entirely so the
 * body claims the full width.
 */

"use client";

import { createContext, useContext, type ComponentType } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { TapTargetButton } from "@ai-matrx/design-system/tap-target";

import type { FileTab } from "@/features/files/components/surfaces/FileTabsBody";
import type { PreviewKind } from "@/features/files/utils/preview-capabilities";
import { ImagePreviewControls } from "./ImagePreviewControls";
import { HtmlPreviewControls } from "./HtmlPreviewControls";
import { EditControls } from "./EditControls";

export interface FileViewerControlRailProps {
  activeTab: FileTab;
  previewKind: PreviewKind | null;
}

const EDITABLE_KINDS: ReadonlyArray<PreviewKind> = [
  "text",
  "code",
  "markdown",
  "data",
  "svg",
  "html",
];

/**
 * The control panel for the current tab + preview kind, or `null` when no
 * controls apply. ONE dispatch for both layouts: the page's side rail and the
 * compact workspace's "View" popover render the same panel.
 */
export function viewerControlsFor(
  activeTab: FileTab,
  previewKind: PreviewKind | null,
): ComponentType | null {
  if (activeTab === "preview") {
    if (previewKind === "image") return ImagePreviewControls;
    if (previewKind === "html") return HtmlPreviewControls;
    // PDF, video, audio, markdown, code, data, text, svg, generic — their
    // bodies already carry inline toolbars sized for full-width.
    return null;
  }
  // Editor controls only make sense when the file is text-editable; other
  // kinds' Edit tabs carry their own toolbars.
  if (activeTab === "edit" && previewKind && EDITABLE_KINDS.includes(previewKind)) {
    return EditControls;
  }
  // Document / Analysis / Share / Info / Versions render their own controls.
  return null;
}

/** The side rail for the current tab + kind; `null` collapses the column. */
export function FileViewerControlRail({
  activeTab,
  previewKind,
}: FileViewerControlRailProps) {
  const Controls = viewerControlsFor(activeTab, previewKind);
  return Controls ? <Controls /> : null;
}

/**
 * The same panel behind one icon button — the compact workspace (a Board
 * tile) has no room for a 176px rail beside a small preview. Absent when the
 * tab + kind has no controls.
 */
export function FileViewerControlsButton({
  activeTab,
  previewKind,
}: FileViewerControlRailProps) {
  const Controls = viewerControlsFor(activeTab, previewKind);
  if (!Controls) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* Same trigger shape as the file's More actions menu. */}
        <span>
          <TapTargetButton
            icon={<SlidersHorizontal className="h-4 w-4" />}
            ariaLabel="View controls"
          />
        </span>
      </PopoverTrigger>
      <PopoverContent /* sizing: fixed — a fixed-measure panel on purpose; its rows truncate inside the box */ align="end" className="w-52 p-0">
        <ControlRailLayoutContext.Provider value="popover">
          <Controls />
        </ControlRailLayoutContext.Provider>
      </PopoverContent>
    </Popover>
  );
}

/** Where a panel is drawn: the side rail, or inside the View popover. */
const ControlRailLayoutContext = createContext<"rail" | "popover">("rail");

/** Visual chrome shared by every rail panel — fixed width, padded, top-down. */
export function ControlRailFrame({ children }: { children: React.ReactNode }) {
  const layout = useContext(ControlRailLayoutContext);
  if (layout === "popover") {
    // Same sections, no column: the popover is the frame.
    return (
      <div
        className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto px-2 py-3"
        aria-label="Viewer controls"
      >
        {children}
      </div>
    );
  }
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
