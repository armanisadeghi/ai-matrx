"use client";

import { useState, useRef, useEffect } from "react";
import {
  ChevronRight,
  ChevronDown,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  type SettingsTreeNode,
  findAncestorPath,
  flattenLeaves,
  searchTree,
  withAncestors,
} from "./types";

const ROW_HEIGHT = 32;
const INDENT_PER_DEPTH = 14;

type SettingsTreeProps = {
  nodes: SettingsTreeNode[];
  /** Currently active leaf id. */
  activeId: string | null;
  /** Called when a leaf is activated (click or Enter). */
  onActivate: (id: string) => void;
  /** Category ids initially expanded. Uncontrolled. */
  defaultExpandedIds?: string[];
  /** Set of ids whose content has unsaved changes — dot badge is shown. */
  unsavedIds?: Set<string>;
  /** Show a search input at the top. Defaults to true. */
  searchable?: boolean;
};

/**
 * Desktop-only hierarchical settings nav. Recursive expansion, search,
 * and keyboard navigation. No inline className variations.
 */
export function SettingsTree({
  nodes,
  activeId,
  onActivate,
  defaultExpandedIds,
  unsavedIds,
  searchable = true,
}: SettingsTreeProps) {
  const [query, setQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    if (defaultExpandedIds) return new Set(defaultExpandedIds);
    // Start collapsed — users expand only what they need.
    return new Set();
  });

  const searchRef = useRef<HTMLInputElement | null>(null);
  const treeRef = useRef<HTMLDivElement | null>(null);

  // Keyboard: "/" focuses search from anywhere inside the tree panel
  useEffect(() => {
    const el = treeRef.current;
    if (!el) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, []);

  const matches = query ? searchTree(nodes, query) : null;
  const visibleSet = matches ? withAncestors(nodes, matches) : null;

  // Always keep ancestors of the active leaf expanded so the selected tab is visible.
  const activeAncestors = activeId ? findAncestorPath(nodes, activeId) : [];

  // When searching, expand every ancestor so matches are visible
  const effectiveExpanded = query
    ? new Set([
        ...expandedIds,
        ...activeAncestors,
        ...(visibleSet ? Array.from(visibleSet) : []),
      ])
    : new Set([...expandedIds, ...activeAncestors]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Keyboard navigation across visible leaves
  const visibleLeaves = (() => {
    if (!query) {
      const out: SettingsTreeNode[] = [];
      const walk = (arr: SettingsTreeNode[]) => {
        for (const n of arr) {
          if (n.children && n.children.length > 0) {
            if (effectiveExpanded.has(n.id)) walk(n.children);
          } else {
            out.push(n);
          }
        }
      };
      walk(nodes);
      return out;
    }
    // While searching, visible leaves are all leaves that are in visibleSet
    return flattenLeaves(nodes).filter((l) => visibleSet?.has(l.id));
  })();

  const handleLeafKeydown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    leafId: string,
  ) => {
    const idx = visibleLeaves.findIndex((l) => l.id === leafId);
    if (idx === -1) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = visibleLeaves[idx + 1];
      if (next) document.getElementById(`tree-leaf-${next.id}`)?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = visibleLeaves[idx - 1];
      if (prev) document.getElementById(`tree-leaf-${prev.id}`)?.focus();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onActivate(leafId);
    }
  };

  return (
    <div
      ref={treeRef}
      className="flex h-full flex-col bg-card/20 border-r border-border"
      role="tree"
    >
      {searchable && (
        <div className="relative shrink-0 border-b border-border px-2 py-2">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search settings  /"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-7 w-full pl-7 pr-6 text-xs rounded-md border border-border bg-card text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto py-1">
        {visibleSet && visibleSet.size === 0 && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No settings match "{query}".
          </div>
        )}
        {nodes.map((n) => (
          <TreeNodeRow
            key={n.id}
            node={n}
            depth={0}
            activeId={activeId}
            expandedSet={effectiveExpanded}
            toggleExpanded={toggleExpanded}
            onActivate={onActivate}
            onLeafKeydown={handleLeafKeydown}
            visibleSet={visibleSet}
            matchedSet={matches}
            query={query}
            unsavedIds={unsavedIds}
          />
        ))}
      </div>
    </div>
  );
}

type TreeNodeRowProps = {
  node: SettingsTreeNode;
  depth: number;
  activeId: string | null;
  expandedSet: Set<string>;
  toggleExpanded: (id: string) => void;
  onActivate: (id: string) => void;
  onLeafKeydown: (
    e: React.KeyboardEvent<HTMLButtonElement>,
    leafId: string,
  ) => void;
  visibleSet: Set<string> | null;
  matchedSet: Set<string> | null;
  query: string;
  unsavedIds?: Set<string>;
};

function TreeNodeRow({
  node,
  depth,
  activeId,
  expandedSet,
  toggleExpanded,
  onActivate,
  onLeafKeydown,
  visibleSet,
  matchedSet,
  query,
  unsavedIds,
}: TreeNodeRowProps) {
  // If filtering and this node isn't visible, hide it
  if (visibleSet && !visibleSet.has(node.id)) return null;

  const isFolder = !!node.children && node.children.length > 0;
  const isExpanded = isFolder && expandedSet.has(node.id);
  const isActive = node.id === activeId;
  const isMatched = matchedSet?.has(node.id) ?? false;
  const hasUnsaved = unsavedIds?.has(node.id) ?? node.badge === "unsaved";

  const paddingLeft = 8 + depth * INDENT_PER_DEPTH;

  if (isFolder) {
    return (
      <>
        <button
          type="button"
          role="treeitem"
          aria-expanded={isExpanded}
          disabled={node.disabled}
          onClick={() => !node.disabled && toggleExpanded(node.id)}
          className={cn(
            "w-full flex items-center gap-1.5 text-xs text-left transition-colors",
            "text-foreground hover:bg-accent/50",
            node.disabled && "opacity-50 cursor-not-allowed",
          )}
          style={{ height: ROW_HEIGHT, paddingLeft, paddingRight: 8 }}
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
          )}
          {node.icon && (
            <node.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="flex-1 truncate font-medium">
            <HighlightedLabel text={node.label} query={query} />
          </span>
          {hasUnsaved && <UnsavedDot />}
        </button>
        {isExpanded &&
          node.children!.map((child) => (
            <TreeNodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              activeId={activeId}
              expandedSet={expandedSet}
              toggleExpanded={toggleExpanded}
              onActivate={onActivate}
              onLeafKeydown={onLeafKeydown}
              visibleSet={visibleSet}
              matchedSet={matchedSet}
              query={query}
              unsavedIds={unsavedIds}
            />
          ))}
      </>
    );
  }

  return (
    <button
      id={`tree-leaf-${node.id}`}
      type="button"
      role="treeitem"
      aria-selected={isActive}
      disabled={node.disabled}
      onClick={() => !node.disabled && onActivate(node.id)}
      onKeyDown={(e) => onLeafKeydown(e, node.id)}
      className={cn(
        "w-full flex items-center gap-1.5 text-xs text-left transition-colors border-l-2 border-transparent relative",
        isActive
          ? "bg-primary/10 text-primary border-l-primary font-medium"
          : "text-foreground hover:bg-accent/50",
        isMatched && !isActive && "bg-amber-500/5",
        node.disabled && "opacity-50 cursor-not-allowed",
      )}
      style={{ height: ROW_HEIGHT, paddingLeft: paddingLeft + 4, paddingRight: 8 }}
      tabIndex={isActive ? 0 : -1}
    >
      {node.icon ? (
        <node.icon
          className={cn(
            "h-3.5 w-3.5 shrink-0",
            isActive ? "text-primary" : "text-muted-foreground",
          )}
        />
      ) : (
        <span className="w-3.5 shrink-0" />
      )}
      <span className="flex-1 truncate">
        <HighlightedLabel text={node.label} query={query} />
      </span>
      {hasUnsaved && <UnsavedDot />}
    </button>
  );
}

function HighlightedLabel({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const q = query.toLowerCase();
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return <>{text}</>;
  const before = text.slice(0, idx);
  const match = text.slice(idx, idx + q.length);
  const after = text.slice(idx + q.length);
  return (
    <>
      {before}
      <mark className="bg-amber-500/30 text-foreground rounded-sm px-0.5">
        {match}
      </mark>
      {after}
    </>
  );
}

function UnsavedDot() {
  return (
    <span
      aria-label="Unsaved changes"
      className="h-1.5 w-1.5 rounded-full bg-primary shrink-0"
    />
  );
}
