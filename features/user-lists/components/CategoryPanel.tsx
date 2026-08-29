"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Globe,
  Lock,
  Users,
  Info,
  Loader2,
  Search,
  ListPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { UserList } from "../types";
import { getListVisibility } from "../types";
import { ListMetaModal } from "./ListMetaModal";
import { CreateListDialog } from "./CreateListDialog";
import { filterAndSortBySearch } from "@ai-matrx/kit/search-scoring";

interface CategoryPanelProps {
  lists: UserList[];
  userId?: string;
}

const VISIBILITY_ICONS = {
  public: Globe,
  authenticated: Users,
  private: Lock,
};

const VISIBILITY_COLORS = {
  public: "text-green-500",
  authenticated: "text-blue-500",
  private: "text-amber-500",
};

function formatCount(n: number | undefined): string {
  if (n === undefined) return "";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

interface ListRowProps {
  list: UserList;
  isActive: boolean;
  isAnyNavigating: boolean;
  navigatingId: string | null;
  onNavigate: (id: string) => void;
  onInfo: (list: UserList) => void;
}

function ListRow({
  list,
  isActive,
  isAnyNavigating,
  navigatingId,
  onNavigate,
  onInfo,
}: ListRowProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const visibility = getListVisibility(list);
  const VisIcon = VISIBILITY_ICONS[visibility];
  const isLoading = navigatingId === list.id;
  const isDisabled = isAnyNavigating;

  const handleClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    if (isDisabled) return;
    onNavigate(list.id);
    startTransition(() => router.push(`/lists/${list.id}`));
  };

  return (
    <div
      className={cn(
        "group relative flex items-center gap-1.5 rounded-md transition-colors",
        "border border-transparent",
        isActive
          ? "bg-accent border-l-2 border-l-primary border-r-0 border-t-0 border-b-0 rounded-l-none"
          : "hover:bg-accent/40",
        isDisabled && !isLoading && "opacity-60",
      )}
    >
      <Link
        href={`/lists/${list.id}`}
        onClick={handleClick}
        className="flex-1 flex items-center gap-2 px-2 py-2 min-w-0"
        aria-current={isActive ? "page" : undefined}
      >
        {isLoading ? (
          <Loader2 className="h-3 w-3 animate-spin text-primary flex-shrink-0" />
        ) : (
          <VisIcon
            className={cn(
              "h-3 w-3 flex-shrink-0",
              VISIBILITY_COLORS[visibility],
            )}
          />
        )}

        <span
          className={cn(
            "text-sm truncate min-w-0 flex-1",
            isActive ? "font-medium text-foreground" : "text-foreground/80",
          )}
        >
          {list.list_name}
        </span>

        {list.item_count !== undefined && (
          <span className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground/60 font-mono">
            {formatCount(list.item_count)}
          </span>
        )}
      </Link>

      {/* Info button — always reserve space, reveal on hover/active */}
      <div
        className={cn(
          "flex-shrink-0 pr-1 transition-opacity",
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 rounded-sm"
              onClick={(e) => {
                e.stopPropagation();
                onInfo(list);
              }}
              tabIndex={-1}
            >
              <Info className="h-3 w-3" />
              <span className="sr-only">View details</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            View details
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

export function CategoryPanel({ lists }: CategoryPanelProps) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [infoList, setInfoList] = useState<UserList | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const activeId = pathname.startsWith("/lists/")
    ? pathname.split("/lists/")[1]?.split("/")[0]
    : null;

  const filtered = query.trim()
    ? filterAndSortBySearch(lists, query, [
        { get: (l) => l.list_name, weight: "title" },
        { get: (l) => l.description, weight: "body" },
      ])
    : lists;

  const handleNavigate = (id: string) => {
    setNavigatingId(id);
    setTimeout(() => setNavigatingId(null), 3000);
  };

  const handleInfo = (list: UserList) => {
    setInfoList(list);
    setInfoOpen(true);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-1.5 px-2 pt-2 pb-1.5 border-b border-border/60">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
          Lists
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 rounded-sm"
              onClick={() => setCreateOpen(true)}
            >
              <ListPlus className="h-3.5 w-3.5" />
              <span className="sr-only">New list</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            New list
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Search */}
      {lists.length > 5 && (
        <div className="px-1.5 py-1.5 border-b border-border/40">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter…"
              className="h-6 pl-6 pr-2 text-xs bg-muted/40 border-0 rounded-sm focus-visible:ring-1"
            />
          </div>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1 px-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <p className="text-xs text-muted-foreground">
              {query ? "No matches" : "No lists yet"}
            </p>
            {!query && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setCreateOpen(true)}
              >
                <ListPlus className="h-3.5 w-3.5 mr-1" />
                Create list
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-px">
            {filtered.map((list) => (
              <ListRow
                key={list.id}
                list={list}
                isActive={list.id === activeId}
                isAnyNavigating={navigatingId !== null}
                navigatingId={navigatingId}
                onNavigate={handleNavigate}
                onInfo={handleInfo}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer count */}
      {lists.length > 0 && (
        <div className="px-3 py-1.5 border-t border-border/40 text-[10px] text-muted-foreground/60 tabular-nums">
          {filtered.length !== lists.length
            ? `${filtered.length} of ${lists.length}`
            : `${lists.length} ${lists.length === 1 ? "list" : "lists"}`}
        </div>
      )}

      <ListMetaModal
        list={infoList}
        open={infoOpen}
        onOpenChange={setInfoOpen}
      />

      <CreateListDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </div>
  );
}
