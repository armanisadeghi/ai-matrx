"use client";

import React, { useState, useRef, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, X } from "lucide-react";
import {
  isDeprecatedFilterNonDefault,
  type TabState,
} from "../hooks/useTabUrlState";

interface AiModelTabBarProps {
  tabs: TabState[];
  activeTabId: string;
  counts: Record<string, number>;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onRenameTab: (id: string, label: string) => void;
  onAddTab: () => void;
}

function TabItem({
  tab,
  isActive,
  count,
  canClose,
  onSelect,
  onClose,
  onRename,
}: {
  tab: TabState;
  isActive: boolean;
  count: number;
  canClose: boolean;
  onSelect: () => void;
  onClose: () => void;
  onRename: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tab.label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(tab.label);
  }, [tab.label]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commitRename = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== tab.label) {
      onRename(trimmed);
    } else {
      setDraft(tab.label);
    }
    setEditing(false);
  };

  const hasFilters = !!(
    tab.q ||
    tab.filters.provider ||
    isDeprecatedFilterNonDefault(tab.filters) ||
    tab.filters.is_primary !== undefined ||
    tab.filters.is_premium !== undefined ||
    tab.filters.api_class
  );

  return (
    <div
      className={cn(
        "group relative flex items-center gap-1.5 px-3 h-8 text-xs border-r cursor-pointer select-none shrink-0",
        isActive
          ? "bg-background text-foreground border-b-2 border-b-primary"
          : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground border-b-2 border-b-transparent",
      )}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.preventDefault();
        setEditing(true);
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") {
              setDraft(tab.label);
              setEditing(false);
            }
            e.stopPropagation();
          }}
          onClick={(e) => e.stopPropagation()}
          className="bg-transparent outline-none w-24 text-xs font-medium"
          autoFocus
        />
      ) : (
        <span className="font-medium truncate max-w-[120px]">{tab.label}</span>
      )}

      {hasFilters && !editing && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-primary shrink-0"
          title="Has active filters"
        />
      )}

      <Badge
        variant="secondary"
        className={cn(
          "h-4 px-1 text-xs font-mono shrink-0",
          isActive ? "" : "opacity-70",
        )}
      >
        {count}
      </Badge>

      {canClose && !editing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity rounded-sm hover:bg-destructive/20 hover:text-destructive p-0.5 shrink-0"
          title="Close tab"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

export default function AiModelTabBar({
  tabs,
  activeTabId,
  counts,
  onSelectTab,
  onCloseTab,
  onRenameTab,
  onAddTab,
}: AiModelTabBarProps) {
  return (
    <div className="flex-shrink-0 flex items-end border-b bg-muted/20 overflow-x-auto">
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          count={counts[tab.id] ?? 0}
          canClose={tabs.length > 1}
          onSelect={() => onSelectTab(tab.id)}
          onClose={() => onCloseTab(tab.id)}
          onRename={(label) => onRenameTab(tab.id, label)}
        />
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 rounded-none shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted"
        onClick={onAddTab}
        title="New tab"
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
