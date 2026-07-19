"use client";

import { useMemo } from "react";
import { Database, AlertCircle, Maximize2, PanelRight } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { isTerminal, resultAsObject } from "../_shared";
import { EntityCard, type EntityAction } from "../_shared-entity/EntityCard";

/**
 * Inline renderer for `knowledge_browse(action="stores")` — the curated data
 * stores the user can search, as a readable roster instead of an id table.
 *
 * Wire shape (aidream `rag_list_data_stores`):
 *   { data_stores: [{ id, name, short_code, description, kind, member_count,
 *     is_active }], total }
 */

interface ParsedStore {
  id: string;
  name: string;
  shortCode: string | null;
  description: string | null;
  kind: string | null;
  memberCount: number;
  isActive: boolean;
}

function parseStores(entry: ToolLifecycleEntry): ParsedStore[] {
  const result = resultAsObject(entry);
  const raw = Array.isArray(result?.data_stores)
    ? (result.data_stores as Record<string, unknown>[])
    : [];
  return raw
    .filter((s) => typeof s.id === "string" && s.id)
    .map((s) => ({
      id: s.id as string,
      name:
        (typeof s.name === "string" && s.name) ||
        (typeof s.short_code === "string" && s.short_code) ||
        "Untitled store",
      shortCode: typeof s.short_code === "string" ? s.short_code : null,
      description: typeof s.description === "string" ? s.description : null,
      kind: typeof s.kind === "string" ? s.kind : null,
      memberCount: typeof s.member_count === "number" ? s.member_count : 0,
      isActive: s.is_active !== false,
    }));
}

function StoreRow({ store }: { store: ParsedStore }) {
  return (
    <div className="flex items-start gap-3 border-b border-border/60 px-3 py-2 last:border-b-0">
      <Database className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-medium text-foreground">
            {store.name}
          </span>
          {store.shortCode ? (
            <code className="shrink-0 rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">
              {store.shortCode}
            </code>
          ) : null}
          {!store.isActive ? (
            <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">
              inactive
            </span>
          ) : null}
        </div>
        {store.description ? (
          <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {store.description}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-right text-[11px] leading-tight text-muted-foreground">
        <div>
          {store.memberCount}{" "}
          {store.memberCount === 1 ? "member" : "members"}
        </div>
        {store.kind ? (
          <div className="text-muted-foreground/70">
            {store.kind.replaceAll("_", " ")}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function KnowledgeStoresInline({
  entry,
  onOpenOverlay,
  onOpenWindowPanel,
  expanded,
  onToggleExpanded,
}: ToolRendererProps) {
  const stores = useMemo(() => parseStores(entry), [entry]);

  // While streaming, the shell's slim line carries it.
  if (!isTerminal(entry) && stores.length === 0) return null;

  if (entry.status === "error") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">Couldn&apos;t list data stores</div>
          {entry.errorMessage ? (
            <div className="text-[11px] text-muted-foreground">
              {entry.errorMessage}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const actions: EntityAction[] = [
    ...(onOpenWindowPanel
      ? [
          {
            label: "Open in window",
            icon: PanelRight,
            onSelect: () => onOpenWindowPanel(),
          } satisfies EntityAction,
        ]
      : []),
    ...(onOpenOverlay
      ? [
          {
            label: "Fullscreen",
            icon: Maximize2,
            onSelect: () => onOpenOverlay(),
          } satisfies EntityAction,
        ]
      : []),
  ];

  return (
    <EntityCard
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
      icon={Database}
      accent="cyan"
      title="Data stores"
      subtitle={
        stores.length
          ? `${stores.length} ${stores.length === 1 ? "store" : "stores"}`
          : "No data stores"
      }
      actions={actions}
    >
      {stores.length ? (
        <div className="divide-y divide-border/60">
          {stores.map((s) => (
            <StoreRow key={s.id} store={s} />
          ))}
        </div>
      ) : (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          No data stores are available to this user.
        </div>
      )}
    </EntityCard>
  );
}
