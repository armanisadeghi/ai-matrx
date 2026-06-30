"use client";

/**
 * tray-previews.tsx — JSX render functions for minimized-tray chip previews.
 * Lives in a `.tsx` file so JSX can compile; `trayPreviewRegistry.ts` itself
 * stays `.ts` (data-only, no JSX) for IDE / lint speed.
 *
 * Each export is a function matching the `renderTrayPreview` shape:
 *   `(ctx: TrayPreviewContext) => ReactNode`
 *
 * Add a new preview here, then register it by overlay id in
 * `trayPreviewRegistry.ts` like:
 *   notesWindow: { renderTrayPreview: notesTrayPreview },
 */

import type { ReactNode } from "react";
import type { TrayPreviewContext } from "./windowRegistryTypes";
import ErrorInspectorTrayChip from "@/features/admin/error-inspector/ErrorInspectorTrayChip";

// ─── Notes ────────────────────────────────────────────────────────────────────

export function notesTrayPreview({ data }: TrayPreviewContext): ReactNode {
  const openTabs = Array.isArray(data?.openTabs) ? data.openTabs : [];
  const activeTabId =
    typeof data?.activeTabId === "string" ? data.activeTabId : null;
  const tabCount = openTabs.length;
  const activeTab = activeTabId
    ? openTabs.find(
        (t: unknown): t is { id: string; title?: string } =>
          typeof t === "object" &&
          t !== null &&
          "id" in t &&
          (t as { id: unknown }).id === activeTabId,
      )
    : null;
  const activeTitle =
    activeTab?.title && typeof activeTab.title === "string"
      ? activeTab.title
      : null;

  return (
    <div className="truncate">
      {activeTitle ? (
        <span className="text-foreground/80 font-medium">{activeTitle}</span>
      ) : (
        <span className="italic">No active note</span>
      )}
      {tabCount > 1 && (
        <span className="text-muted-foreground/60 ml-1">
          · {tabCount} open
        </span>
      )}
    </div>
  );
}

// ─── Quick Tasks ──────────────────────────────────────────────────────────────

export function quickTasksTrayPreview({
  data,
}: TrayPreviewContext): ReactNode {
  const search = typeof data?.search === "string" ? data.search : "";
  const projectId =
    typeof data?.projectId === "string" ? data.projectId : null;
  return (
    <div className="truncate">
      {search ? (
        <span>
          Searching:{" "}
          <span className="text-foreground/80">{search}</span>
        </span>
      ) : projectId ? (
        <span>Filtered by project</span>
      ) : (
        <span className="italic">All tasks</span>
      )}
    </div>
  );
}

// ─── Cloud Files ──────────────────────────────────────────────────────────────

const CLOUD_FILES_TAB_LABELS: Record<string, string> = {
  browse: "Browsing",
  recent: "Recent files",
  shared: "Shared with me",
  trash: "Trash",
};

export function cloudFilesTrayPreview({
  data,
}: TrayPreviewContext): ReactNode {
  const tab = typeof data?.activeTab === "string" ? data.activeTab : "browse";
  return (
    <div className="truncate">
      {CLOUD_FILES_TAB_LABELS[tab] ?? "Browsing"}
    </div>
  );
}

// ─── Web Scraper ──────────────────────────────────────────────────────────────

export function scraperTrayPreview({ data }: TrayPreviewContext): ReactNode {
  const url = typeof data?.url === "string" ? data.url : "";
  const results = Array.isArray(data?.results) ? data.results : [];
  const resultCount = results.length;

  // Show domain-only URL — full URLs are too noisy for a 200px chip.
  let displayUrl: string | null = null;
  if (url) {
    try {
      displayUrl = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      displayUrl = url.slice(0, 32);
    }
  }

  return (
    <div className="truncate">
      {displayUrl ? (
        <span className="text-foreground/80">{displayUrl}</span>
      ) : (
        <span className="italic">No URL set</span>
      )}
      {resultCount > 0 && (
        <span className="text-muted-foreground/60 ml-1">
          · {resultCount} result{resultCount === 1 ? "" : "s"}
        </span>
      )}
    </div>
  );
}

// ─── Smart Code Editor ────────────────────────────────────────────────────────

export function smartCodeEditorTrayPreview({
  data,
}: TrayPreviewContext): ReactNode {
  const filePath = typeof data?.filePath === "string" ? data.filePath : null;
  const language = typeof data?.language === "string" ? data.language : null;
  const fileName = filePath ? filePath.split("/").pop() : null;
  return (
    <div className="truncate flex items-center gap-1.5">
      <span className="text-foreground/80 truncate">
        {fileName ?? "Untitled"}
      </span>
      {language && language !== "plaintext" && (
        <span className="text-[10px] uppercase text-muted-foreground/60 shrink-0">
          {language}
        </span>
      )}
    </div>
  );
}

// ─── Error Inspector ──────────────────────────────────────────────────────────
// Unlike the previews above (pure functions of persisted `data`), the Error
// Inspector reflects LIVE state, so it delegates to a subscribing component.
// `ErrorInspectorTrayChip` reads the module-level capture store, keeping its
// re-renders isolated to this leaf (see that file for the isolation contract).

export function errorInspectorTrayPreview(): ReactNode {
  return <ErrorInspectorTrayChip />;
}
