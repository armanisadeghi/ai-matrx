"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { getTabTreeNodes } from "@/features/settings/registry";
import {
  searchTree,
  withAncestors,
  findAncestorPath,
  type SettingsTreeNode,
} from "@/components/official/settings/tree/types";
import { tabIdToHref } from "./routing";

interface Props {
  basePath: string;
}

/**
 * The settings route's left rail. Same folder-tree shape as `SettingsTree`,
 * but every leaf is a `<Link>` instead of a button so navigation is real
 * routing. Active state is derived from `usePathname()`.
 *
 * Structure:
 *   - Pinned search at the top (matches agent-connections's "Search all …").
 *   - Hierarchical tree below. Folders default collapsed; active branch
 *     auto-expands.
 */
export function SettingsRouteSidebar({ basePath }: Props) {
  const isAdmin = useAppSelector(selectIsAdmin);
  const nodes = useMemo<SettingsTreeNode[]>(
    () => getTabTreeNodes(isAdmin),
    [isAdmin],
  );

  const pathname = usePathname();
  const activeTabId = useMemo<string | null>(() => {
    if (!pathname.startsWith(basePath)) return null;
    const rest = pathname.slice(basePath.length).replace(/^\//, "");
    if (!rest) return null;
    return rest.split("/").filter(Boolean).join(".");
  }, [pathname, basePath]);

  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const matches = query ? searchTree(nodes, query) : null;
  const visibleSet = matches ? withAncestors(nodes, matches) : null;
  const activeAncestors = activeTabId ? findAncestorPath(nodes, activeTabId) : [];

  // While searching: expand ancestors of matches so they're visible.
  // Outside search: keep user-toggled folders + auto-expand the active branch.
  const effectiveExpanded = query
    ? new Set([
        ...expandedIds,
        ...activeAncestors,
        ...(visibleSet ? Array.from(visibleSet) : []),
      ])
    : new Set([...expandedIds, ...activeAncestors]);

  const toggleExpanded = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-2 pt-2 pb-2 border-b border-border/60">
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all settings…"
            aria-label="Search all settings"
            className={cn(
              "w-full h-8 pl-7 pr-7 text-xs rounded-md",
              "bg-background border border-border",
              "text-foreground placeholder:text-muted-foreground/70",
              "focus:outline-none focus:ring-1 focus:ring-ring",
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 w-full">
        <div className="flex flex-col gap-0 p-1.5">
          {visibleSet && visibleSet.size === 0 && (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No settings match.
            </div>
          )}
          {nodes.map((n) => (
            <TreeRow
              key={n.id}
              node={n}
              depth={0}
              basePath={basePath}
              activeTabId={activeTabId}
              expandedSet={effectiveExpanded}
              toggleExpanded={toggleExpanded}
              visibleSet={visibleSet}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

interface TreeRowProps {
  node: SettingsTreeNode;
  depth: number;
  basePath: string;
  activeTabId: string | null;
  expandedSet: Set<string>;
  toggleExpanded: (id: string) => void;
  visibleSet: Set<string> | null;
}

const INDENT = 12;

function TreeRow({
  node,
  depth,
  basePath,
  activeTabId,
  expandedSet,
  toggleExpanded,
  visibleSet,
}: TreeRowProps) {
  if (visibleSet && !visibleSet.has(node.id)) return null;

  const isFolder = !!node.children && node.children.length > 0;
  const isExpanded = isFolder && expandedSet.has(node.id);
  const isActive = node.id === activeTabId;
  const paddingLeft = 6 + depth * INDENT;

  const Icon = node.icon;

  if (isFolder) {
    return (
      <>
        <button
          type="button"
          onClick={() => toggleExpanded(node.id)}
          aria-expanded={isExpanded}
          className={cn(
            "w-full flex items-center gap-1.5 text-xs text-left rounded-md py-1.5 transition-colors",
            "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
          style={{ paddingLeft, paddingRight: 8 }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )}
          {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
          <span className="flex-1 truncate font-medium">{node.label}</span>
        </button>
        {isExpanded &&
          node.children!.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              basePath={basePath}
              activeTabId={activeTabId}
              expandedSet={expandedSet}
              toggleExpanded={toggleExpanded}
              visibleSet={visibleSet}
            />
          ))}
      </>
    );
  }

  return (
    <Link
      href={tabIdToHref(basePath, node.id)}
      prefetch
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md text-sm py-1.5 transition-colors",
        isActive
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
      style={{ paddingLeft: paddingLeft + 14, paddingRight: 8 }}
    >
      {Icon ? (
        <Icon className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      <span className="flex-1 truncate">{node.label}</span>
    </Link>
  );
}

export default SettingsRouteSidebar;
