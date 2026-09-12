"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  filterSettingsNavigationSections,
  SettingsFlatNavigation,
  SettingsNavigationSearch,
  settingsNavigationSections,
} from "@/components/official/settings/navigation/SettingsFlatNavigation";
import { cn } from "@/lib/utils";
import type { SettingsTreeNode } from "./types";

type SettingsTreeProps = {
  nodes: SettingsTreeNode[];
  activeId: string | null;
  onActivate: (id: string) => void;
  unsavedIds?: Set<string>;
  searchable?: boolean;
  query?: string;
  onQueryChange?: (query: string) => void;
  searchResults?: ReactNode;
  hasSearchResults?: boolean;
};

/**
 * The overlay's settings navigation shares the route menu's flat section model.
 * Folder state is deliberately absent: headings provide orientation and every
 * available setting remains reachable without an accordion interaction.
 */
export function SettingsTree({
  nodes,
  activeId,
  onActivate,
  unsavedIds,
  searchable = true,
  query: controlledQuery,
  onQueryChange,
  searchResults,
  hasSearchResults = false,
}: SettingsTreeProps) {
  const [internalQuery, setInternalQuery] = useState("");
  const query = controlledQuery ?? internalQuery;
  const setQuery = onQueryChange ?? setInternalQuery;
  const searchRef = useRef<HTMLInputElement | null>(null);
  const treeRef = useRef<HTMLDivElement | null>(null);
  const sections = filterSettingsNavigationSections(settingsNavigationSections(nodes), query);

  useEffect(() => {
    const element = treeRef.current;
    if (!element) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "/" && document.activeElement !== searchRef.current) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    element.addEventListener("keydown", onKey);
    return () => element.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={treeRef} className="flex h-full flex-col border-r border-border bg-card/20" aria-label="Settings navigation">
      {searchable ? <div className="shrink-0 border-b border-border px-2 py-2"><SettingsNavigationSearch value={query} onValueChange={setQuery} inputRef={searchRef} /></div> : null}
      <div className="flex-1 overflow-y-auto py-1">
        {searchResults}
        {sections.length > 0 ? <SettingsFlatNavigation
          sections={sections}
          activeId={activeId}
          renderItem={(item, active) => {
            const unsaved = unsavedIds?.has(item.id) ?? item.node.badge === "unsaved";
            return <button id={`settings-nav-${item.id}`} type="button" disabled={item.node.disabled} onClick={() => !item.node.disabled && onActivate(item.id)} className={cn("flex min-h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm text-foreground transition-colors hover:bg-muted/70", active && "bg-muted font-medium", item.node.disabled && "cursor-not-allowed opacity-50")} aria-current={active ? "page" : undefined}>
              {item.node.icon ? <item.node.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <span className="w-3.5 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {unsaved ? <span aria-label="Unsaved changes" className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" /> : null}
            </button>;
          }}
        /> : !hasSearchResults ? <p className="px-3 py-6 text-sm text-muted-foreground">{query ? `No settings match "${query}".` : "No settings available."}</p> : null}
      </div>
    </div>
  );
}
