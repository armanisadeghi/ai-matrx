// components/official/content-editor/ContentEditorTabsWithList.tsx
"use client";

import React, { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ContentEditorTabs, type ContentEditorTab } from "./ContentEditorTabs";
import {
  ContentEditorList,
  type ContentEditorListItem,
  type ContentEditorListItemState,
} from "./ContentEditorList";
import {
  ContentEditorTree,
  flattenTreeLeaves,
  type ContentEditorTreeNode,
} from "./ContentEditorTree";
import {
  ContentEditorBrowser,
  type ContentEditorFilter,
} from "./ContentEditorBrowser";
import type { ContentEditorProps, EditorMode } from "./types";

type SharedEditorProps = Omit<
  ContentEditorProps,
  | "value"
  | "onChange"
  | "title"
  | "collapsible"
  | "defaultCollapsed"
  | "collapseMode"
  | "collapsedPreviewHeight"
  | "mode"
  | "onModeChange"
  | "showModeSelector"
  | "className"
>;

export interface ContentEditorDocument extends ContentEditorListItem {
  value: string;
}

export type SidebarMode = "list" | "tree" | "list-browser" | "tree-browser";

/**
 * Shape of the argument passed to a custom `sidebar` renderer. Contains
 * everything a sidebar needs to drive the tab state from the outside.
 */
export interface ContentEditorSidebarContext {
  documents: ContentEditorDocument[];
  listItems: ContentEditorListItem[];
  activeId?: string;
  openIds: string[];
  onItemClick: (id: string, state: ContentEditorListItemState) => void;
}

export interface ContentEditorTabsWithListProps extends SharedEditorProps {
  /** All available documents (both open and closed). */
  documents: ContentEditorDocument[];
  onDocumentsChange: (documents: ContentEditorDocument[]) => void;

  /** Ids of documents currently open as tabs. */
  openIds: string[];
  onOpenIdsChange: (ids: string[]) => void;

  /** Currently active (focused) tab id. */
  activeId?: string;
  onActiveIdChange?: (id: string | undefined) => void;

  /** Collapse settings — apply only to the tab area, not the sidebar. */
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  collapseMode?: "hide" | "fade";
  collapsedPreviewHeight?: number | string;

  /** Allow closing tabs (removes from openIds, document stays in the list). */
  allowCloseTab?: boolean;

  /** Place the shared mode selector in the tab bar instead of per-tab. */
  sharedModeSelector?: boolean;
  defaultSharedMode?: EditorMode;

  // ── Sidebar configuration ──────────────────────────────
  sidebarMode?: SidebarMode;
  /** Tree nodes — required when sidebarMode is "tree" or "tree-browser". */
  treeNodes?: ContentEditorTreeNode[];
  /** Filter chips for list-browser / tree-browser modes. */
  filters?: ContentEditorFilter[];
  filterPredicate?: (
    item: ContentEditorListItem,
    activeFilterIds: string[],
  ) => boolean;
  /** Custom sidebar — overrides sidebarMode completely. */
  sidebar?: (ctx: ContentEditorSidebarContext) => React.ReactNode;

  listTitle?: string;
  listWidth?: string; // Tailwind width class
  maxTabTitleLength?: number;
  className?: string;
}

export function ContentEditorTabsWithList({
  documents,
  onDocumentsChange,
  openIds,
  onOpenIdsChange,
  activeId: controlledActiveId,
  onActiveIdChange,
  collapsible,
  defaultCollapsed,
  collapseMode,
  collapsedPreviewHeight,
  allowCloseTab = true,
  sharedModeSelector,
  defaultSharedMode,
  sidebarMode = "list",
  treeNodes,
  filters,
  filterPredicate,
  sidebar,
  listTitle = "Documents",
  listWidth = "w-64",
  maxTabTitleLength,
  className,
  ...sharedEditorProps
}: ContentEditorTabsWithListProps) {
  const [internalActiveId, setInternalActiveId] = useState<string | undefined>(
    () => controlledActiveId ?? openIds[0],
  );
  const activeId = controlledActiveId ?? internalActiveId;

  const setActiveId = useCallback(
    (id: string | undefined) => {
      if (controlledActiveId === undefined) setInternalActiveId(id);
      onActiveIdChange?.(id);
    },
    [controlledActiveId, onActiveIdChange],
  );

  // Build the tabs array from openIds (preserving their order). When a tree is
  // provided, we still want leaves' values from `documents`, which is the
  // canonical store.
  const tabs = useMemo<ContentEditorTab[]>(() => {
    return openIds
      .map((id) => {
        const doc = documents.find((d) => d.id === id);
        return doc ? { id: doc.id, title: doc.title, value: doc.value } : null;
      })
      .filter(Boolean) as ContentEditorTab[];
  }, [openIds, documents]);

  const handleTabsChange = useCallback(
    (nextTabs: ContentEditorTab[]) => {
      const byId = new Map(nextTabs.map((t) => [t.id, t]));

      let docsChanged = false;
      const nextDocs = documents.map((doc) => {
        const t = byId.get(doc.id);
        if (t && t.value !== doc.value) {
          docsChanged = true;
          return { ...doc, value: t.value };
        }
        return doc;
      });

      const nextOpenIds = nextTabs.map((t) => t.id);
      const openIdsChanged =
        nextOpenIds.length !== openIds.length ||
        nextOpenIds.some((id, i) => openIds[i] !== id);

      if (docsChanged) onDocumentsChange(nextDocs);
      if (openIdsChanged) onOpenIdsChange(nextOpenIds);

      if (activeId && !nextOpenIds.includes(activeId)) {
        setActiveId(nextOpenIds[0]);
      }
    },
    [
      documents,
      onDocumentsChange,
      openIds,
      onOpenIdsChange,
      activeId,
      setActiveId,
    ],
  );

  // Shared click-on-sidebar-item handler (covers list, tree, browser variants).
  const handleItemClick = useCallback(
    (id: string) => {
      if (!openIds.includes(id)) {
        onOpenIdsChange([...openIds, id]);
      }
      setActiveId(id);
    },
    [openIds, onOpenIdsChange, setActiveId],
  );

  const listItems: ContentEditorListItem[] = useMemo(
    () =>
      documents.map(({ id, title, description, icon }) => ({
        id,
        title,
        description,
        icon,
      })),
    [documents],
  );

  // ── Sidebar rendering ──────────────────────────────────

  const sidebarCtx: ContentEditorSidebarContext = {
    documents,
    listItems,
    activeId,
    openIds,
    onItemClick: (id) => handleItemClick(id),
  };

  let sidebarEl: React.ReactNode;
  if (sidebar) {
    sidebarEl = sidebar(sidebarCtx);
  } else if (sidebarMode === "tree" && treeNodes) {
    sidebarEl = (
      <ContentEditorTree
        nodes={treeNodes}
        activeId={activeId}
        openIds={openIds}
        onItemClick={(id) => handleItemClick(id)}
        title={listTitle}
        defaultExpandedIds={treeNodes
          .filter((n) => n.children !== undefined)
          .map((n) => n.id)}
      />
    );
  } else if (sidebarMode === "tree-browser" && treeNodes) {
    sidebarEl = (
      <ContentEditorBrowser
        variant="tree"
        nodes={treeNodes}
        activeId={activeId}
        openIds={openIds}
        onItemClick={(id) => handleItemClick(id)}
        title={listTitle}
        filters={filters}
        filterPredicate={filterPredicate}
      />
    );
  } else if (sidebarMode === "list-browser") {
    sidebarEl = (
      <ContentEditorBrowser
        variant="list"
        items={listItems}
        activeId={activeId}
        openIds={openIds}
        onItemClick={(id) => handleItemClick(id)}
        title={listTitle}
        filters={filters}
        filterPredicate={filterPredicate}
      />
    );
  } else {
    sidebarEl = (
      <ContentEditorList
        items={listItems}
        activeId={activeId}
        openIds={openIds}
        onItemClick={(id) => handleItemClick(id)}
        title={listTitle}
      />
    );
  }

  return (
    <div className={cn("flex gap-3 items-start", className)}>
      <div className={cn("flex-none", listWidth)}>{sidebarEl}</div>

      <div className="flex-1 min-w-0">
        {tabs.length === 0 ? (
          <div className="flex items-center justify-center h-48 border border-dashed border-border rounded-lg type-secondary text-zinc-500 dark:text-zinc-400">
            Select a document from the sidebar to open it.
          </div>
        ) : (
          <ContentEditorTabs
            tabs={tabs}
            onTabsChange={handleTabsChange}
            activeTabId={activeId}
            onActiveTabChange={setActiveId}
            collapsible={collapsible}
            defaultCollapsed={defaultCollapsed}
            collapseMode={collapseMode}
            collapsedPreviewHeight={collapsedPreviewHeight}
            allowCloseTab={allowCloseTab}
            maxTabTitleLength={maxTabTitleLength}
            sharedModeSelector={sharedModeSelector}
            defaultSharedMode={defaultSharedMode}
            {...sharedEditorProps}
          />
        )}
      </div>
    </div>
  );
}

/** Convenience helper: turn a flat documents array into a tree by `folder` path. */
export function buildTreeFromDocuments(
  documents: (ContentEditorDocument & { folder?: string })[],
): ContentEditorTreeNode[] {
  interface FolderNode extends ContentEditorTreeNode {
    children: ContentEditorTreeNode[];
  }
  const root: FolderNode = {
    id: "__root__",
    title: "",
    children: [],
  };

  const ensureFolder = (parts: string[]): FolderNode => {
    let node = root;
    let pathAccum = "";
    for (const part of parts) {
      pathAccum = pathAccum ? `${pathAccum}/${part}` : part;
      let existing = node.children.find(
        (c) => c.children !== undefined && c.title === part,
      ) as FolderNode | undefined;
      if (!existing) {
        existing = {
          id: `folder:${pathAccum}`,
          title: part,
          children: [],
        };
        node.children.push(existing);
      }
      node = existing;
    }
    return node;
  };

  for (const doc of documents) {
    const parts = (doc.folder ?? "").split("/").filter(Boolean);
    const parent = ensureFolder(parts);
    parent.children.push({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      icon: doc.icon,
    });
  }

  return root.children;
}

/** Re-exported helper for consumers who need it. */
export { flattenTreeLeaves };
