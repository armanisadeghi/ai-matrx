"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";

import { useSkillCategories } from "../hooks/useSkillCategories";
import type { CategoryRow } from "../types";

interface SkillCategoryTreeEditorProps {
  onBack: () => void;
}

/** Read-only-for-now category tree explorer. Future work (drag-to-reparent
 * via @dnd-kit, color/icon pickers, inline rename) layers on top of this
 * loader — the data, hierarchy walk, and admin gate already exist. */
export function SkillCategoryTreeEditor({
  onBack,
}: SkillCategoryTreeEditorProps) {
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const { categories, rootCategories, childrenOf, loading, error, reload } =
    useSkillCategories();

  if (!isAdmin) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <Header onBack={onBack} />
        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
          Category management is admin-only.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <Header onBack={onBack} onReload={reload} />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading && categories.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading categories…
          </div>
        ) : error ? (
          <div className="px-4 py-10 text-center text-sm text-destructive">
            {error}
          </div>
        ) : categories.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No categories yet.
          </div>
        ) : (
          <div className="px-4 py-3 space-y-1">
            {rootCategories.map((root) => (
              <CategoryNode
                key={root.id}
                category={root}
                childrenOf={childrenOf}
                depth={0}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryNode({
  category,
  childrenOf,
  depth,
}: {
  category: CategoryRow;
  childrenOf: (parentId: string | null) => CategoryRow[];
  depth: number;
}) {
  const children = useMemo(
    () => childrenOf(category.id),
    [childrenOf, category.id],
  );
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = children.length > 0;

  return (
    <div className="flex flex-col">
      <div
        className={cn(
          "flex items-center gap-1.5 py-1 px-2 rounded text-sm",
          "hover:bg-muted/40 transition-colors group",
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse" : "Expand"}
            className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {open ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="inline-block h-5 w-5" />
        )}

        {category.color && (
          <span
            className="inline-block h-2.5 w-2.5 rounded-full shrink-0 border border-border"
            style={{ backgroundColor: category.color }}
            aria-hidden
          />
        )}

        <span className="flex-1 truncate text-foreground">
          {category.label}
        </span>

        <Badge
          variant="outline"
          className="h-4 px-1 text-[10px] font-normal text-muted-foreground"
        >
          {category.categoryKey}
        </Badge>
        {hasChildren && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {children.length}
          </span>
        )}
      </div>

      {hasChildren && open && (
        <div className="flex flex-col">
          {children.map((c) => (
            <CategoryNode
              key={c.id}
              category={c}
              childrenOf={childrenOf}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Header({
  onBack,
  onReload,
}: {
  onBack: () => void;
  onReload?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 shrink-0 border-b border-border/60">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className={cn(
          "inline-flex items-center justify-center h-8 w-8 rounded-md",
          "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
        )}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 flex-1">
        <FolderTree className="h-4 w-4 text-muted-foreground" />
        <div className="text-sm font-semibold text-foreground">
          Categories
        </div>
      </div>
      {onReload && (
        <button
          type="button"
          onClick={onReload}
          className={cn(
            "h-8 px-3 rounded-md text-xs",
            "text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
          )}
        >
          Refresh
        </button>
      )}
    </div>
  );
}
