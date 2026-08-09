"use client";

/**
 * ContainerResourceSheet — lists the resources of one kind that belong to a
 * container (project or task) by FK, with peek + open. Read-only association
 * view (FK ownership is set on the resource itself, not here). Reused by the
 * project workspace and the task editor.
 */

import React from "react";
import { Loader2, Search } from "lucide-react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { Input } from "@/components/ui/input";
import { idMatchesQuery } from "@/utils/search-scoring";
import { supabase } from "@/utils/supabase/client";
import { getShareableResource } from "@/utils/permissions/registry";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import type { OrgResourceEntry } from "../resource-catalogue";
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
  const [items, setItems] = React.useState<Item[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (!open || !entry || !entry.table) {
      setItems([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setQuery("");
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
        setItems(
          rows.map((r) => ({
            id: String(r.id),
            title: String(r[titleCol] ?? "").trim() || "Untitled",
          })),
        );
      } catch (err) {
        if (!cancelled) {
          console.error("[ContainerResourceSheet] load failed:", err);
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, entry, column, value]);

  if (!entry) return null;
  const Icon = entry.icon;
  const token = entry.token;
  const shareable = entry.shareKey
    ? getShareableResource(entry.shareKey)
    : undefined;
  /**
   * The entity registry is the canonical route source; the sharing registry's
   * `urlPathTemplate` is a SECOND, DB-backed one that disagrees with it in
   * places (`/quizzes/{id}` vs `/education/quizzes/{id}`, and the 404 route
   * `/canvas/{id}` — FOUND_DEFECTS D137/D138). Prefer the registry, and fall
   * back to the share template only where the registry has no route yet, so
   * this surface's set of working doors is a strict superset of what it had.
   */
  const shareHrefFor = (id: string): string | undefined =>
    shareable ? shareable.urlPathTemplate.replace("{id}", id) : undefined;
  const registryHasRoute = Boolean(
    token && tryGetEntityInfo(token)?.hrefFor,
  );
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
              {filtered.map((item) => (
                  <li
                    key={item.id}
                    className="group flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card hover:bg-accent/40"
                  >
                    {/* Was: an inert <span> title, a hand-rolled Eye peek
                        button, and a hand-rolled new-tab <a> — i.e. a local
                        copy of EntityRef missing the Open door entirely.
                        Resolved by TOKEN, not by `entry.key`: six catalogue
                        keys differ from their canonical token and would
                        silently lose both the route and the peek. */}
                    <EntityRef
                      token={token ?? entry.key}
                      id={item.id}
                      name={item.title}
                      href={
                        registryHasRoute ? undefined : shareHrefFor(item.id)
                      }
                      // This sheet sits over the project workspace / task
                      // editor. Following a row must never replace what the
                      // user has open — same rule as the association rail.
                      openInNewTab
                      showIcon={!entry.hideRowIcon}
                      className="flex-1 min-w-0 text-sm"
                    />
                  </li>
              ))}
            </ul>
          )}
        </div>
      </MatrxDynamicPanelHost>
    </>
  );
}
