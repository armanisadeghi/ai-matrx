"use client";

import React, { useState } from "react";
import {
  Blocks,
  Loader2,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { SectionToolbar } from "../SectionToolbar";
import { SectionFooter } from "../SectionFooter";
import { useRenderBlocks } from "../../hooks/useRenderBlocks";
import { selectSelectedItemId, setSelectedItemId } from "../../redux/ui/slice";
import type { CategoryTreeNode } from "../../redux/skl/selectors";
import type { SklRenderDefinition } from "../../redux/skl/types";
import { idMatchesQuery } from "@/utils/search-scoring";

export function RenderBlocksSection() {
  const dispatch = useAppDispatch();
  const selectedItemId = useAppSelector(selectSelectedItemId);
  const [search, setSearch] = useState("");
  const { definitions, byCategoryId, categoryTree, loading, error } =
    useRenderBlocks();

  const lowerSearch = search.trim().toLowerCase();
  const matchesSearch = (d: SklRenderDefinition) =>
    !lowerSearch ||
    d.label.toLowerCase().includes(lowerSearch) ||
    d.blockId.toLowerCase().includes(lowerSearch) ||
    (d.description ?? "").toLowerCase().includes(lowerSearch) ||
    idMatchesQuery(d, lowerSearch);

  const selected = selectedItemId
    ? (definitions.find((d) => d.id === selectedItemId) ?? null)
    : null;

  if (selected) {
    return (
      <RenderBlockDetail
        def={selected}
        onBack={() => dispatch(setSelectedItemId(null))}
      />
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <SectionToolbar
        search={search}
        onSearchChange={setSearch}
        generateLabel="Generate Block"
      />
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="w-full">
          {loading && definitions.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading render blocks…
            </div>
          ) : error ? (
            <div className="px-4 py-10 text-center text-sm text-destructive">
              {error}
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="p-2">
                {categoryTree.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No categories yet.
                  </div>
                ) : (
                  categoryTree.map((node) => (
                    <CategoryTreeBranch
                      key={node.category.id}
                      node={node}
                      depth={0}
                      byCategoryId={byCategoryId}
                      selectedItemId={selectedItemId}
                      onPickItem={(id) => dispatch(setSelectedItemId(id))}
                      matchesSearch={matchesSearch}
                    />
                  ))
                )}
                {(byCategoryId.__uncategorized?.length ?? 0) > 0 && (
                  <UncategorizedBranch
                    items={byCategoryId.__uncategorized!.filter(matchesSearch)}
                    selectedItemId={selectedItemId}
                    onPickItem={(id) => dispatch(setSelectedItemId(id))}
                  />
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
      <SectionFooter
        description="Render blocks are structured LLM output templates that map 1:1 to React components across every surface."
        learnMoreLabel="Learn more about render blocks"
        learnMoreHref="#"
      />
    </div>
  );
}

function CategoryTreeBranch({
  node,
  depth,
  byCategoryId,
  selectedItemId,
  onPickItem,
  matchesSearch,
}: {
  node: CategoryTreeNode;
  depth: number;
  byCategoryId: Record<string, SklRenderDefinition[]>;
  selectedItemId: string | null;
  onPickItem: (id: string) => void;
  matchesSearch: (d: SklRenderDefinition) => boolean;
}) {
  const [open, setOpen] = useState(depth < 1);
  const items = (byCategoryId[node.category.id] ?? []).filter(matchesSearch);
  const hasItems = items.length > 0;
  const hasChildren = node.children.length > 0;
  if (!hasItems && !hasChildren) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ paddingLeft: depth * 12 + 4 }}
        className={cn(
          "w-full flex items-center gap-1 px-2 py-1 rounded-md text-xs text-left",
          "hover:bg-muted/50 text-foreground/90 transition-colors",
        )}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        {open ? (
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="truncate flex-1">{node.category.label}</span>
        {hasItems && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <>
          {items.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onPickItem(d.id)}
              style={{ paddingLeft: (depth + 1) * 12 + 20 }}
              className={cn(
                "w-full flex items-center gap-1.5 py-1 pr-2 text-xs text-left",
                "rounded-md transition-colors",
                d.id === selectedItemId
                  ? "bg-accent text-foreground"
                  : "hover:bg-muted/50 text-foreground/80",
              )}
            >
              <Blocks className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="truncate flex-1">{d.label}</span>
              {!d.isActive && (
                <span className="text-[10px] text-muted-foreground">
                  inactive
                </span>
              )}
            </button>
          ))}
          {node.children.map((child) => (
            <CategoryTreeBranch
              key={child.category.id}
              node={child}
              depth={depth + 1}
              byCategoryId={byCategoryId}
              selectedItemId={selectedItemId}
              onPickItem={onPickItem}
              matchesSearch={matchesSearch}
            />
          ))}
        </>
      )}
    </div>
  );
}

function UncategorizedBranch({
  items,
  selectedItemId,
  onPickItem,
}: {
  items: SklRenderDefinition[];
  selectedItemId: string | null;
  onPickItem: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1 px-2 py-1 rounded-md text-xs text-left hover:bg-muted/50 text-foreground/90 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="truncate flex-1">Uncategorized</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {items.length}
        </span>
      </button>
      {open &&
        items.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onPickItem(d.id)}
            className={cn(
              "w-full flex items-center gap-1.5 py-1 pl-8 pr-2 text-xs text-left rounded-md transition-colors",
              d.id === selectedItemId
                ? "bg-accent text-foreground"
                : "hover:bg-muted/50 text-foreground/80",
            )}
          >
            <Blocks className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="truncate">{d.label}</span>
          </button>
        ))}
    </div>
  );
}

function RenderBlockDetail({
  def,
  onBack,
}: {
  def: SklRenderDefinition;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 shrink-0 border-b border-border/40">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-col min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">
            {def.label}
          </div>
          <div className="text-xs text-muted-foreground truncate font-mono">
            {def.blockId}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-auto scrollbar-thin p-4 space-y-3 text-sm">
        {def.description && (
          <p className="text-foreground/90">{def.description}</p>
        )}
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            Template
          </div>
          <pre className="text-xs font-mono bg-muted/30 p-3 rounded-md whitespace-pre-wrap">
            {def.template}
          </pre>
        </div>
        <p className="text-xs text-muted-foreground pt-4 border-t border-border/40">
          Three-pane editor + live preview via BlockRenderer coming with the
          DetailEditor rollout.
        </p>
      </div>
    </div>
  );
}

export default RenderBlocksSection;
