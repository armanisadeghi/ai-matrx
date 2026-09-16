"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TabState } from "../hooks/useTabUrlState";

interface AiModelTabBarProps {
  tabs: TabState[];
  activeTabId: string;
  counts: Record<string, number>;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onRenameTab: (id: string, label: string) => void;
  onAddTab: () => void;
}

/** Models owns its URL-backed query state; this surface owns the tab UI. */
export default function AiModelTabBar(props: AiModelTabBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const commitRename = (id: string) => {
    const label = draft.trim();
    if (label) props.onRenameTab(id, label);
    setEditingId(null);
  };

  return (
    <div className="flex min-w-0 items-center gap-1 overflow-x-auto border-b">
      {props.tabs.map((tab) => {
        const active = tab.id === props.activeTabId;
        const editing = tab.id === editingId;
        return (
          <div key={tab.id} className="group flex shrink-0 items-center">
            {editing ? (
              <input
                autoFocus
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={() => commitRename(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitRename(tab.id);
                  if (event.key === "Escape") setEditingId(null);
                }}
                className="h-8 w-32 rounded-md border bg-background px-2 text-xs outline-none ring-ring focus:ring-2"
                aria-label="Rename model view"
              />
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn("h-8 gap-1 rounded-b-none px-2 text-xs", active && "bg-muted")}
                onClick={() => props.onSelectTab(tab.id)}
                onDoubleClick={() => {
                  setEditingId(tab.id);
                  setDraft(tab.label);
                }}
              >
                <span>{tab.label}</span>
                <span className="text-muted-foreground">{props.counts[tab.id] ?? 0}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Close ${tab.label}`}
                  className="ml-1 rounded p-0.5 opacity-0 hover:bg-background group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onCloseTab(tab.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      props.onCloseTab(tab.id);
                    }
                  }}
                >
                  <X className="size-3" />
                </span>
              </Button>
            )}
          </div>
        );
      })}
      <Button type="button" variant="ghost" size="icon-sm" onClick={props.onAddTab} aria-label="Add model view">
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
