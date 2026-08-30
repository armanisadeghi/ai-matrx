"use client";

import React, { useState } from "react";
import { Search, Plus, ListFilter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import type { UserList } from "../types";
import { ListCard } from "./ListCard";
import { filterAndSortBySearch } from "@ai-matrx/kit/search-scoring";

interface ListsSidebarProps {
  lists: UserList[];
  activeListId: string | null;
  onCreateList: () => void;
  onOverrideNavigate?: (id: string) => void;
}

export function ListsSidebar({
  lists,
  activeListId,
  onCreateList,
  onOverrideNavigate,
}: ListsSidebarProps) {
  const [search, setSearch] = useState("");
  const [navigatingId, setNavigatingId] = useState<string | null>(null);

  const filtered = search.trim()
    ? filterAndSortBySearch(lists, search, [
        { get: (l) => l.list_name, weight: "title" },
        { get: (l) => l.description, weight: "body" },
      ])
    : lists;

  // All lists come from the owned-lists RPC for now.
  // A future "shared with me" section will require a separate query.
  const ownedLists = filtered;
  const sharedLists: UserList[] = [];

  const handleNavigate = (id: string) => {
    setNavigatingId(id);
    setTimeout(() => setNavigatingId(null), 2000);
  };

  return (
    <div className="flex flex-col h-full w-72 lg:w-80 flex-shrink-0 border-r border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <ListFilter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">
            My Lists
          </span>
          <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 font-mono">
            {lists.length}
          </span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 rounded-md"
          onClick={onCreateList}
          title="Create new list"
        >
          <Plus className="h-4 w-4" />
          <span className="sr-only">New list</span>
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search lists…"
            className="pl-8 pr-7 h-8 text-sm bg-muted/50 border-0 focus-visible:ring-1"
            style={{ fontSize: "16px" }}
          />
          {search && (
            <button
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setSearch("")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 scrollbar-thin">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            {search ? (
              <>
                <Search className="h-8 w-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No lists match "{search}"
                </p>
              </>
            ) : (
              <>
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground">
                  No lists yet
                </p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  Create your first list to get started
                </p>
                <Button size="sm" onClick={onCreateList} variant="outline">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  New List
                </Button>
              </>
            )}
          </div>
        )}

        {ownedLists.map((list) => (
          <ListCard
            key={list.id}
            list={list}
            isActive={list.id === activeListId}
            isAnyNavigating={navigatingId !== null}
            onNavigate={handleNavigate}
            onOverrideNavigate={onOverrideNavigate}
          />
        ))}

        {sharedLists.length > 0 && (
          <>
            <div className="flex items-center gap-2 px-2 pt-3 pb-1">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                Shared with me
              </span>
              <div className="flex-1 h-px bg-border" />
            </div>
            {sharedLists.map((list) => (
              <ListCard
                key={list.id}
                list={list}
                isActive={list.id === activeListId}
                isAnyNavigating={navigatingId !== null}
                onNavigate={handleNavigate}
                onOverrideNavigate={onOverrideNavigate}
              />
            ))}
          </>
        )}
      </div>

      {/* Footer CTA */}
      <div
        className={cn(
          "px-3 py-2 border-t border-border",
          lists.length === 0 && "hidden",
        )}
      >
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs gap-1.5"
          onClick={onCreateList}
        >
          <Plus className="h-3.5 w-3.5" />
          New List
        </Button>
      </div>
    </div>
  );
}
