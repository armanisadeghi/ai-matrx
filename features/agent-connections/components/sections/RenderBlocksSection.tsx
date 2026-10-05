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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichContent } from "@/components/rich-content/RichContent";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { SectionToolbar } from "../SectionToolbar";
import { SectionFooter } from "../SectionFooter";
import { useRenderBlocks } from "../../hooks/useRenderBlocks";
import { selectSelectedItemId, setSelectedItemId } from "../../redux/ui/slice";
import type { CategoryTreeNode } from "../../redux/skl/selectors";
import type { SklRenderDefinition } from "../../redux/skl/types";
import { idMatchesQuery } from "@ai-matrx/kit/search-scoring";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { publishedToWebLabel } from "@/lib/row-access";

/**
 * Classification badges — surfaces the block_type / web-state fidelity the
 * 2026-08-08 `agent.context_menu_view` update delivers. Markdown + published is
 * the baseline and stays unbadged; anything else is worth a glance.
 */
function ClassificationBadges({
  def,
  always = false,
}: {
  def: SklRenderDefinition;
  always?: boolean;
}) {
  const showType = always || def.blockType !== "markdown";
  const showWebState = always || !def.isPublic;
  if (!showType && !showWebState) return null;
  return (
    <>
      {showType && (
        <span className="type-meta px-1 rounded bg-muted text-muted-foreground shrink-0">
          {def.blockType === "render_kind" ? "kind" : def.blockType}
        </span>
      )}
      {showWebState && (
        <span className="type-meta px-1 rounded border border-border/60 text-muted-foreground shrink-0">
          {publishedToWebLabel(def.isPublic)}
        </span>
      )}
    </>
  );
}

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
        searchPlaceholder="Search render blocks…"
      />
      <div className="flex-1 min-h-0 flex overflow-hidden">
        <div className="w-full min-w-0">
          {loading && definitions.length === 0 ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground type-body gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading render blocks…
            </div>
          ) : error ? (
            <div className="px-4 py-10 text-center type-body text-destructive">
              {error}
              <ErrorAlchemyMenu error={error} />
            </div>
          ) : (
            <div className="h-full overflow-y-auto overflow-x-hidden scrollbar-thin">
              <div className="p-2">
                {categoryTree.length === 0 ? (
                  <div className="px-4 py-10 text-center type-body text-muted-foreground">
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
                      forceOpen={lowerSearch.length > 0}
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
            </div>
          )}
        </div>
      </div>
      <SectionFooter
        description="Templates that turn AI output into live components."
        learnMoreLabel="Learn more about render blocks"
        learnMoreHref="#"
      />
    </div>
  );
}

function RenderBlockRow({
  def,
  indent,
  selected,
  onPick,
}: {
  def: SklRenderDefinition;
  indent: number;
  selected: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(def.id)}
      style={{ paddingLeft: indent }}
      className={cn(
        "w-full flex items-start gap-2 py-1.5 pr-2 text-left rounded-md transition-colors",
        selected ? "bg-accent text-foreground" : "hover:bg-muted/50",
      )}
    >
      <Blocks className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="type-body text-foreground truncate">{def.label}</span>
          <ClassificationBadges def={def} />
          {!def.isActive && (
            <span className="type-meta text-muted-foreground shrink-0">
              inactive
            </span>
          )}
        </span>
        {def.description && (
          <span className="block type-secondary text-muted-foreground truncate">
            {def.description}
          </span>
        )}
      </span>
      <span className="hidden md:block max-w-[14rem] truncate type-meta font-mono text-muted-foreground/70 pt-0.5">
        {def.blockId}
      </span>
    </button>
  );
}

/** A folder shows only when it, or a folder beneath it, holds a matching block. */
function branchHasMatch(
  node: CategoryTreeNode,
  byCategoryId: Record<string, SklRenderDefinition[]>,
  matchesSearch: (d: SklRenderDefinition) => boolean,
): boolean {
  if ((byCategoryId[node.category.id] ?? []).some(matchesSearch)) return true;
  return node.children.some((c) =>
    branchHasMatch(c, byCategoryId, matchesSearch),
  );
}

function CategoryTreeBranch({
  node,
  depth,
  byCategoryId,
  selectedItemId,
  onPickItem,
  matchesSearch,
  forceOpen,
}: {
  node: CategoryTreeNode;
  depth: number;
  byCategoryId: Record<string, SklRenderDefinition[]>;
  selectedItemId: string | null;
  onPickItem: (id: string) => void;
  matchesSearch: (d: SklRenderDefinition) => boolean;
  forceOpen: boolean;
}) {
  const [openState, setOpen] = useState(depth < 1);
  const open = forceOpen || openState;
  const items = (byCategoryId[node.category.id] ?? []).filter(matchesSearch);
  const hasItems = items.length > 0;
  if (!branchHasMatch(node, byCategoryId, matchesSearch)) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ paddingLeft: depth * 12 + 4 }}
        className={cn(
          "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium text-left",
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
          <span className="type-meta text-muted-foreground tabular-nums">
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <>
          {items.map((d) => (
            <RenderBlockRow
              key={d.id}
              def={d}
              indent={(depth + 1) * 12 + 4}
              selected={d.id === selectedItemId}
              onPick={onPickItem}
            />
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
              forceOpen={forceOpen}
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
        <span className="type-meta text-muted-foreground tabular-nums">
          {items.length}
        </span>
      </button>
      {open &&
        items.map((d) => (
          <RenderBlockRow
            key={d.id}
            def={d}
            indent={16}
            selected={d.id === selectedItemId}
            onPick={onPickItem}
          />
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
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="type-title text-foreground truncate">
              {def.label}
            </span>
            <ClassificationBadges def={def} always />
          </div>
          <div className="type-secondary text-muted-foreground truncate font-mono">
            {def.blockId}
          </div>
        </div>
      </div>
      <Tabs
        defaultValue="preview"
        className="flex-1 min-h-0 flex flex-col gap-0"
      >
        <div className="px-4 pt-3 shrink-0 space-y-2">
          {def.description && (
            <p className="type-body text-foreground/90">{def.description}</p>
          )}
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="template">Template</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent
          value="preview"
          className="flex-1 min-h-0 overflow-auto scrollbar-thin p-4"
        >
          <RichContent level="full" imagePolicy="ai" source={def.template} />
        </TabsContent>
        <TabsContent
          value="template"
          className="flex-1 min-h-0 overflow-auto scrollbar-thin p-4"
        >
          <pre className="type-secondary font-mono bg-muted/30 p-3 rounded-md whitespace-pre-wrap">
            {def.template}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default RenderBlocksSection;
