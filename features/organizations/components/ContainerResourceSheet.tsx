"use client";

/**
 * ContainerResourceSheet — lists the resources of one kind that belong to a
 * container (project or task) by FK, with peek + open. Read-only association
 * view (FK ownership is set on the resource itself, not here). Reused by the
 * project workspace and the task editor.
 */

import React from "react";
import { Loader2, Search, ExternalLink, Eye } from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Input } from "@/components/ui/input";
import { idMatchesQuery } from "@/utils/search-scoring";
import { supabase } from "@/utils/supabase/client";
import { getShareableResource } from "@/utils/permissions/registry";
import type { OrgResourceEntry } from "../resource-catalogue";
import { ResourcePeekHost } from "../peek/ResourcePeekHost";
import { hasPeek } from "../peek/kinds-list";
import type { ContainerColumn } from "../hooks/useContainerInventory";

interface Item {
  id: string;
  title: string;
}

export function ContainerResourceSheet({
  open,
  onOpenChange,
  entry,
  column,
  value,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: OrgResourceEntry | null;
  column: ContainerColumn;
  value: string;
}) {
  // Items keyed by the query they were fetched for — "loading" and "empty"
  // are DERIVED (requested key ≠ loaded key), so the effect never sets state
  // synchronously (react-hooks/set-state-in-effect). Same pattern as
  // AgentSlotsConsole's SlotEditor. The search query is keyed too, so a
  // fresh load presents with a clean search without an effect reset.
  const loadKey =
    open && entry && entry.table ? `${entry.table}|${column}|${value}` : null;
  const [loaded, setLoaded] = React.useState<{
    key: string;
    items: Item[];
  } | null>(null);
  const [queryState, setQueryState] = React.useState<{
    key: string;
    text: string;
  } | null>(null);
  const [peekId, setPeekId] = React.useState<string | null>(null);

  const items = loaded && loaded.key === loadKey ? loaded.items : [];
  const loading = loadKey !== null && loaded?.key !== loadKey;
  const query =
    queryState && queryState.key === loadKey ? queryState.text : "";
  const setQuery = (text: string) => {
    if (loadKey) setQueryState({ key: loadKey, text });
  };

  React.useEffect(() => {
    if (!loadKey || !entry || !entry.table) return undefined;
    let cancelled = false;
    (async () => {
      const titleCol = entry.titleColumn ?? "id";
      try {
        const db = (
          entry.schemaName
            ? supabase.schema(entry.schemaName as "files")
            : supabase
        ) as typeof supabase;
        let q = db
          .from(entry.table as never)
          .select(`id, ${titleCol}`)
          .eq(column as never, value)
          .limit(300);
        if (entry.archivedColumn)
          q = q.eq(entry.archivedColumn as never, false);
        const { data, error } = await q;
        if (error) throw error;
        if (cancelled) return;
        // MATRX-EXCEPTION: table + title column are resolved from the org
        // resource catalogue at runtime (any cardable kind), so the row
        // shape cannot be a compile-time DbRpcRow guard.
        const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
        setLoaded({
          key: loadKey,
          items: rows.map((r) => ({
            id: String(r.id),
            title: String(r[titleCol] ?? "").trim() || "Untitled",
          })),
        });
      } catch (err) {
        if (!cancelled) {
          console.error("[ContainerResourceSheet] load failed:", err);
          setLoaded({ key: loadKey, items: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadKey, entry, column, value]);

  if (!entry) return null;
  const Icon = entry.icon;
  const peekable = hasPeek(entry.key);
  const shareable = entry.shareKey
    ? getShareableResource(entry.shareKey)
    : undefined;
  const hrefFor = (id: string): string | null =>
    shareable ? shareable.urlPathTemplate.replace("{id}", id) : null;
  const filtered = items.filter(
    (it) =>
      it.title.toLowerCase().includes(query.toLowerCase()) ||
      idMatchesQuery(it, query),
  );

  return (
    <>
      <MatrxDynamicPanelHost
        open={open}
        onOpenChange={onOpenChange}
        title={
          <span className="inline-flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {entry.labelPlural}
          </span>
        }
        description={`${entry.labelPlural} associated with this ${column === "project_id" ? "project" : "task"}.`}
        expandButtonLabel={entry.labelPlural}
        initialFocus
        position="right"
        defaultSize={34}
        contentClassName="flex min-h-0 flex-1 flex-col p-0"
      >
        <div className="px-5 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label={`Search ${entry.labelPlural.toLowerCase()}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${entry.labelPlural.toLowerCase()}…`}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <Icon className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {items.length === 0
                  ? `No ${entry.labelPlural.toLowerCase()} yet.`
                  : "No matches."}
              </p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((item) => {
                const href = hrefFor(item.id);
                return (
                  <li
                    key={item.id}
                    className="group flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card hover:bg-accent/40"
                  >
                    {!entry.hideRowIcon && (
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span
                      className="flex-1 min-w-0 text-sm truncate"
                      title={item.title}
                    >
                      {item.title}
                    </span>
                    {peekable && (
                      <button
                        type="button"
                        onClick={() => setPeekId(item.id)}
                        className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                        title="Peek"
                        aria-label={`Peek at ${item.title}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {href && (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                        title="Open in new tab"
                        aria-label={`Open ${item.title} in a new tab`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <ResourcePeekHost
          kind={entry.key}
          id={peekId}
          onClose={() => setPeekId(null)}
        />
      </MatrxDynamicPanelHost>
    </>
  );
}
