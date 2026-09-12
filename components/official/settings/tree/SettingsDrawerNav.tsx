"use client";

import { useState, useMemo } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import {
  type SettingsTreeNode,
  findNodeById,
  getDrawerPathForActiveId,
  searchTree,
  flattenLeaves,
} from "./types";

type SettingsDrawerNavProps = {
  nodes: SettingsTreeNode[];
  activeId: string | null;
  onActivate: (id: string) => void;
  /** Render the tab body for the active leaf node. */
  renderTab: (node: SettingsTreeNode) => React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Title shown on the root screen header. */
  title?: string;
  unsavedIds?: Set<string>;
};

/**
 * iOS-style hierarchical push-nav inside a bottom drawer.
 *
 * Three screens:
 * 1. Root category/leaf list
 * 2. Sub-category list (slides in from right when category tapped)
 * 3. Leaf tab content (slides in from right when leaf tapped)
 *
 * Back button pops the stack. Closing the drawer resets the stack.
 */
export function SettingsDrawerNav({
  nodes,
  activeId,
  onActivate,
  renderTab,
  open,
  onOpenChange,
  title = "Settings",
  unsavedIds,
}: SettingsDrawerNavProps) {
  // Path: list of node ids representing the current navigation stack.
  // - [] = root list
  // - [catId] = sub-list of catId (which must be a folder)
  // - [..., leafId] = leaf content (last is leaf)
  const [path, setPath] = useState<string[]>(() =>
    getDrawerPathForActiveId(nodes, activeId),
  );
  const [query, setQuery] = useState("");

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setPath([]);
      setQuery("");
    }
    onOpenChange(next);
  };

  const pushId = (id: string) => setPath((p) => [...p, id]);
  const popOne = () => setPath((p) => p.slice(0, -1));

  const currentId = path[path.length - 1] ?? null;
  const currentNode = currentId ? findNodeById(nodes, currentId) : null;
  const isLeaf = Boolean(currentNode && !currentNode.children);

  // The list-of-nodes shown in the current screen (root or category)
  const listNodes = useMemo<SettingsTreeNode[]>(() => {
    if (!currentNode || isLeaf) return nodes;
    return currentNode.children ?? [];
  }, [currentNode, isLeaf, nodes]);

  // Search only applies at the root screen for simplicity — gives a flat result
  const searchMatches = useMemo(() => {
    if (!query.trim()) return null;
    const matched = searchTree(nodes, query);
    return flattenLeaves(nodes).filter((l) => matched.has(l.id));
  }, [nodes, query]);

  const handleItemTap = (node: SettingsTreeNode) => {
    if (node.disabled) return;
    if (node.children && node.children.length > 0) {
      pushId(node.id);
      setQuery("");
    } else {
      onActivate(node.id);
      pushId(node.id);
      setQuery("");
    }
  };

  const headerTitle = isLeaf
    ? currentNode?.label
    : currentNode
      ? currentNode.label
      : title;
  const backLabel =
    path.length > 1
      ? (findNodeById(nodes, path[path.length - 2])?.label ?? title)
      : title;

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="h-[85dvh] flex flex-col">
        <DrawerTitle className="sr-only">{title}</DrawerTitle>

        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border shrink-0">
          {path.length === 0 ? (
            <div className="flex items-center gap-2 min-w-0">
              <SettingsIcon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-semibold truncate">{title}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={popOne}
              className="flex items-center gap-1 h-8 px-2 -ml-2 rounded-md text-sm text-primary hover:bg-accent/50 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="truncate max-w-[9rem]">{backLabel}</span>
            </button>
          )}
          <div className="flex-1 flex items-center justify-center min-w-0 px-2">
            {path.length > 0 && (
              <span className="text-sm font-semibold truncate">
                {headerTitle}
              </span>
            )}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={() => handleOpenChange(false)}
            className="h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Screen stack: only the current screen is rendered, with slide animation */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <div
            key={path.join("/") || "root"}
            className={cn(
              "absolute inset-0 overflow-y-auto overscroll-contain",
              path.length > 0 && "animate-drawer-push",
            )}
          >
            {isLeaf && currentNode ? (
              <div className="pb-safe">{renderTab(currentNode)}</div>
            ) : (
              <>
                {/* Search bar only on the root screen */}
                {path.length === 0 && (
                  <div className="relative px-3 py-2 border-b border-border sticky top-0 bg-background z-10">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search settings"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="h-10 w-full pl-10 pr-10 text-base rounded-md border border-border bg-card text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
                      style={{ fontSize: "16px" }}
                    />
                    {query && (
                      <button
                        type="button"
                        aria-label="Clear search"
                        onClick={() => setQuery("")}
                        className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}

                {searchMatches ? (
                  <div className="pb-safe">
                    {searchMatches.length === 0 ? (
                      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No settings match "{query}".
                      </div>
                    ) : (
                      searchMatches.map((n) => (
                        <DrawerRow
                          key={n.id}
                          node={n}
                          activeId={activeId}
                          hasChevron
                          onTap={handleItemTap}
                          unsavedIds={unsavedIds}
                        />
                      ))
                    )}
                  </div>
                ) : (
                  <div className="pb-safe">
                    {listNodes.map((n) => (
                      <DrawerRow
                        key={n.id}
                        node={n}
                        activeId={activeId}
                        hasChevron
                        onTap={handleItemTap}
                        unsavedIds={unsavedIds}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <style jsx>{`
          @keyframes drawerPush {
            from {
              transform: translateX(24%);
              opacity: 0;
            }
            to {
              transform: translateX(0%);
              opacity: 1;
            }
          }
          :global(.animate-drawer-push) {
            animation: drawerPush 180ms cubic-bezier(0.4, 0, 0.2, 1) both;
          }
        `}</style>
      </DrawerContent>
    </Drawer>
  );
}

type DrawerRowProps = {
  node: SettingsTreeNode;
  activeId: string | null;
  hasChevron: boolean;
  onTap: (node: SettingsTreeNode) => void;
  unsavedIds?: Set<string>;
};

function DrawerRow({
  node,
  activeId,
  hasChevron,
  onTap,
  unsavedIds,
}: DrawerRowProps) {
  const isActive = node.id === activeId;
  const hasUnsaved = unsavedIds?.has(node.id) ?? node.badge === "unsaved";

  return (
    <button
      type="button"
      onClick={() => onTap(node)}
      disabled={node.disabled}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border/30 last:border-b-0 transition-colors active:bg-accent/60",
        isActive ? "bg-primary/5" : "hover:bg-accent/40",
        node.disabled && "opacity-50 cursor-not-allowed",
      )}
      style={{ minHeight: 56 }}
    >
      {node.icon && (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
          <node.icon className="h-4 w-4" />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground truncate">
            {node.label}
          </span>
          {hasUnsaved && (
            <span
              aria-label="Unsaved changes"
              className="h-1.5 w-1.5 rounded-full bg-primary shrink-0"
            />
          )}
        </div>
        {node.description && (
          <div className="text-xs text-muted-foreground truncate">
            {node.description}
          </div>
        )}
      </div>
      {hasChevron && (
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      )}
    </button>
  );
}
