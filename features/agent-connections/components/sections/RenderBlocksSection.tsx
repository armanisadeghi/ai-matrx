"use client";

import React, { useRef, useState } from "react";
import {
  ArrowLeft,
  Component,
  FileCode2,
  FileText,
  Folder,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  TopicTree,
  type TopicTreeRow,
} from "@/components/official/topic-tree/TopicTree";
import { SectionToolbar } from "../SectionToolbar";
import { SectionFooter } from "../SectionFooter";
import { useRenderBlocks } from "../../hooks/useRenderBlocks";
import { selectSelectedItemId, setSelectedItemId } from "../../redux/ui/slice";
import type { CategoryTreeNode } from "../../redux/skl/selectors";
import type { SklRenderDefinition } from "../../redux/skl/types";
import { idMatchesQuery } from "@ai-matrx/kit/search-scoring";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { publishedToWebLabel } from "@/lib/row-access";
import { Button } from "@ai-matrx/design-system/controls";

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

/**
 * The list is a Finder list view on the canonical TopicTree: one 16px step per
 * level, a reserved disclosure slot so a block's icon lines up under its sibling
 * folders, a type icon on every row (filled folder vs. a per-format document)
 * and a fixed "Kind" column. Folders sit above blocks, as Finder and VS Code
 * sort them. Selecting a block opens it in the preview pane beside the list.
 */
const FOLDER_PREFIX = "folder:";
const UNCATEGORIZED_ID = `${FOLDER_PREFIX}__uncategorized`;
const KIND_COLUMN = "block w-24 shrink-0";
/** Shown only while the list has the whole pane (no block open). */
const DESCRIPTION_COLUMN = "hidden md:block w-56 xl:w-80 shrink-0 pr-4";

const BLOCK_KIND: Record<
  SklRenderDefinition["blockType"],
  { label: string; icon: React.ReactNode }
> = {
  markdown: {
    label: "Markdown",
    icon: <FileText className="h-4 w-4 text-muted-foreground" />,
  },
  xml: {
    label: "XML",
    icon: <FileCode2 className="h-4 w-4 text-orange-500" />,
  },
  render_kind: {
    label: "Component",
    icon: <Component className="h-4 w-4 text-violet-500" />,
  },
};

const folderIcon = (
  <Folder className="h-4 w-4 fill-sky-400/80 text-sky-500" strokeWidth={1.5} />
);

function metaCells(
  kind: string,
  description: string | null | undefined,
  wide: boolean,
) {
  return (
    <>
      {wide && (
        <span className={cn(DESCRIPTION_COLUMN, "truncate")}>
          {description}
        </span>
      )}
      <span className={cn(KIND_COLUMN, "truncate")}>{kind}</span>
    </>
  );
}

function blockRow(
  def: SklRenderDefinition,
  depth: number,
  parentId: string | null,
  selectedItemId: string | null,
  wide: boolean,
): TopicTreeRow {
  const kind = BLOCK_KIND[def.blockType] ?? BLOCK_KIND.markdown;
  return {
    id: def.id,
    parentId,
    depth,
    label: def.label,
    description: def.description,
    hasChildren: false,
    expanded: false,
    selected: def.id === selectedItemId,
    icon: kind.icon,
    meta: metaCells(kind.label, def.description, wide),
    trailing: !def.isActive ? (
      <span className="type-meta text-muted-foreground">Inactive</span>
    ) : undefined,
  };
}

/** True when the folder, or any folder under it, holds a matching block. */
function branchHasMatch(
  node: CategoryTreeNode,
  byCategoryId: Record<string, SklRenderDefinition[]>,
  matches: (d: SklRenderDefinition) => boolean,
): boolean {
  if ((byCategoryId[node.category.id] ?? []).some(matches)) return true;
  return node.children.some((c) => branchHasMatch(c, byCategoryId, matches));
}

function countBlocks(
  node: CategoryTreeNode,
  byCategoryId: Record<string, SklRenderDefinition[]>,
  matches: (d: SklRenderDefinition) => boolean,
): number {
  return (
    (byCategoryId[node.category.id] ?? []).filter(matches).length +
    node.children.reduce((n, c) => n + countBlocks(c, byCategoryId, matches), 0)
  );
}

function flattenTree({
  categoryTree,
  byCategoryId,
  matches,
  isExpanded,
  selectedItemId,
  wide,
}: {
  wide: boolean;
  categoryTree: CategoryTreeNode[];
  byCategoryId: Record<string, SklRenderDefinition[]>;
  matches: (d: SklRenderDefinition) => boolean;
  isExpanded: (folderId: string) => boolean;
  selectedItemId: string | null;
}): TopicTreeRow[] {
  const rows: TopicTreeRow[] = [];

  const pushFolder = (
    id: string,
    label: string,
    depth: number,
    parentId: string | null,
    count: number,
  ) => {
    const expanded = isExpanded(id);
    rows.push({
      id,
      parentId,
      depth,
      label,
      hasChildren: true,
      expanded,
      selected: false,
      icon: folderIcon,
      meta: metaCells(`${count} ${count === 1 ? "item" : "items"}`, null, wide),
    });
    return expanded;
  };

  const walk = (
    node: CategoryTreeNode,
    depth: number,
    parentId: string | null,
  ) => {
    if (!branchHasMatch(node, byCategoryId, matches)) return;
    const id = FOLDER_PREFIX + node.category.id;
    const open = pushFolder(
      id,
      node.category.label,
      depth,
      parentId,
      countBlocks(node, byCategoryId, matches),
    );
    if (!open) return;
    for (const child of node.children) walk(child, depth + 1, id);
    for (const def of (byCategoryId[node.category.id] ?? []).filter(matches)) {
      rows.push(blockRow(def, depth + 1, id, selectedItemId, wide));
    }
  };

  for (const node of categoryTree) walk(node, 0, null);

  const loose = (byCategoryId.__uncategorized ?? []).filter(matches);
  if (loose.length > 0) {
    const open = pushFolder(
      UNCATEGORIZED_ID,
      "Uncategorized",
      0,
      null,
      loose.length,
    );
    if (open) {
      for (const def of loose) {
        rows.push(blockRow(def, 1, UNCATEGORIZED_ID, selectedItemId, wide));
      }
    }
  }
  return rows;
}

export function RenderBlocksSection() {
  const dispatch = useAppDispatch();
  const selectedItemId = useAppSelector(selectSelectedItemId);
  const [search, setSearch] = useState("");
  // Folders the person opened or closed; anything absent falls back to the
  // default (top level open). A search opens every folder holding a match.
  // A click on a folder row opens/closes it; arrowing onto one must not.
  // TopicTree reports both as `onSelect`, so the last input kind decides.
  const pointerInput = useRef(false);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const { definitions, byCategoryId, categoryTree, loading, error } =
    useRenderBlocks();

  const lowerSearch = search.trim().toLowerCase();
  const matches = (d: SklRenderDefinition) =>
    !lowerSearch ||
    d.label.toLowerCase().includes(lowerSearch) ||
    d.blockId.toLowerCase().includes(lowerSearch) ||
    (d.description ?? "").toLowerCase().includes(lowerSearch) ||
    idMatchesQuery(d, lowerSearch);

  const topLevel = new Set(
    categoryTree.map((n) => FOLDER_PREFIX + n.category.id),
  );
  const isExpanded = (id: string) =>
    lowerSearch.length > 0 || (toggled[id] ?? topLevel.has(id));

  const selected = selectedItemId
    ? (definitions.find((d) => d.id === selectedItemId) ?? null)
    : null;

  const rows = flattenTree({
    wide: !selected,
    categoryTree,
    byCategoryId,
    matches,
    isExpanded,
    selectedItemId,
  });

  const toggleFolder = (id: string) =>
    setToggled((t) => ({ ...t, [id]: !isExpanded(id) }));

  const close = () => dispatch(setSelectedItemId(null));

  const list =
    loading && definitions.length === 0 ? (
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
      <div className="flex h-full min-h-0 flex-col">
        <div
          aria-hidden="true"
          className="flex h-7 shrink-0 items-center border-b border-border/60 pl-12 pr-2 type-meta font-medium text-muted-foreground"
        >
          <span className="flex-1">Name</span>
          {!selected && <span className={DESCRIPTION_COLUMN}>Description</span>}
          <span className={KIND_COLUMN}>Kind</span>
        </div>
        <div
          className="flex min-h-0 flex-1 flex-col"
          onPointerDownCapture={() => {
            pointerInput.current = true;
          }}
          onKeyDownCapture={() => {
            pointerInput.current = false;
          }}
        >
          <TopicTree
            rows={rows}
            ariaLabel="Render blocks"
            onToggleExpand={toggleFolder}
            onSelect={(id) => {
              if (!id.startsWith(FOLDER_PREFIX))
                dispatch(setSelectedItemId(id));
              else if (pointerInput.current) toggleFolder(id);
            }}
            onActivate={(id) => {
              if (id.startsWith(FOLDER_PREFIX)) toggleFolder(id);
            }}
            emptyState={
              lowerSearch ? "No matching render blocks" : "No render blocks yet"
            }
          />
        </div>
      </div>
    );

  return (
    <div className="flex flex-col h-full min-h-0">
      <SectionToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search render blocks…"
      />
      <div className="flex-1 min-h-0 flex overflow-hidden border-t border-border/60">
        {/* Nothing open: the list owns the pane. A block open: list + preview
            side by side (Finder's preview pane); narrow screens show one. */}
        <div
          className={cn(
            "min-w-0 min-h-0",
            selected
              ? "hidden lg:block lg:w-[40%] lg:shrink-0 lg:border-r lg:border-border/60"
              : "w-full",
          )}
        >
          {list}
        </div>
        {selected && (
          <div className="min-w-0 min-h-0 flex-1">
            <RenderBlockDetail def={selected} onClose={close} />
          </div>
        )}
      </div>
      <SectionFooter description="Templates that turn AI output into live components." />
    </div>
  );
}

function RenderBlockDetail({
  def,
  onClose,
}: {
  def: SklRenderDefinition;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 shrink-0 border-b border-border/40">
        <Button
          variant="quiet"
          icon={<ArrowLeft />}
          onClick={onClose}
          aria-label="Back"
          className="lg:hidden"
        />
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
        <Button
          variant="quiet"
          icon={<X />}
          onClick={onClose}
          aria-label="Close"
          className="hidden lg:inline-flex"
        />
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
