"use client";

import { useMemo } from "react";
import { Database, AlertCircle, Maximize2, PanelRight } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { getArg, isTerminal, resultAsObject } from "../_shared";
import { EntityCard, type EntityAction } from "../_shared-entity/EntityCard";

/**
 * Inline renderer for `knowledge_browse(action="store")` — one data store and
 * what is actually inside it, so the user can see the retrieval scope.
 *
 * Wire shape (aidream `rag_get_data_store`):
 *   { id, name, short_code, description, kind, is_active,
 *     members: [{ source_kind, source_id, label, added_at, notes }],
 *     total_members }
 */

interface ParsedMember {
  sourceKind: string;
  sourceId: string;
  label: string | null;
  notes: string | null;
}

interface ParsedStoreDetail {
  name: string;
  shortCode: string | null;
  description: string | null;
  kind: string | null;
  isActive: boolean;
  totalMembers: number;
  members: ParsedMember[];
}

function parseStore(entry: ToolLifecycleEntry): ParsedStoreDetail | null {
  const result = resultAsObject(entry);
  if (!result) return null;
  const rawMembers = Array.isArray(result.members)
    ? (result.members as Record<string, unknown>[])
    : [];
  return {
    name:
      (typeof result.name === "string" && result.name) ||
      (typeof result.short_code === "string" && result.short_code) ||
      "Data store",
    shortCode: typeof result.short_code === "string" ? result.short_code : null,
    description:
      typeof result.description === "string" ? result.description : null,
    kind: typeof result.kind === "string" ? result.kind : null,
    isActive: result.is_active !== false,
    totalMembers:
      typeof result.total_members === "number"
        ? result.total_members
        : rawMembers.length,
    members: rawMembers
      .filter((m) => typeof m.source_id === "string" && m.source_id)
      .map((m) => ({
        sourceKind:
          typeof m.source_kind === "string" ? m.source_kind : "unknown",
        sourceId: m.source_id as string,
        label: typeof m.label === "string" ? m.label : null,
        notes: typeof m.notes === "string" ? m.notes : null,
      })),
  };
}

export function KnowledgeStoreInline({
  entry,
  onOpenOverlay,
  onOpenWindowPanel,
  expanded,
  onToggleExpanded,
}: ToolRendererProps) {
  const store = useMemo(() => parseStore(entry), [entry]);

  if (!isTerminal(entry) && !store) return null;

  if (entry.status === "error" || !store) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">Couldn&apos;t open the data store</div>
          {entry.errorMessage ? (
            <div className="text-[11px] text-muted-foreground">
              {entry.errorMessage}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const storeId = getArg<string>(entry, "data_store_id") ?? null;
  const subtitleParts: string[] = [];
  if (store.kind) subtitleParts.push(store.kind.replaceAll("_", " "));
  subtitleParts.push(
    `${store.totalMembers} ${store.totalMembers === 1 ? "member" : "members"}`,
  );
  if (!store.isActive) subtitleParts.push("inactive");

  const actions: EntityAction[] = [
    ...(storeId
      ? [
          {
            label: "Open data store",
            icon: Database,
            href: `/rag/data-stores?store_id=${encodeURIComponent(storeId)}`,
          } satisfies EntityAction,
        ]
      : []),
    ...(onOpenWindowPanel
      ? [
          {
            label: "Open in window",
            icon: PanelRight,
            onSelect: () => onOpenWindowPanel(),
            separatorBefore: storeId != null,
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
      title={store.name}
      subtitle={subtitleParts.join(" · ")}
      actions={actions}
    >
      {store.description ? (
        <div className="border-b border-border/60 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
          {store.description}
        </div>
      ) : null}
      {store.members.length ? (
        <div className="divide-y divide-border/60">
          {store.members.map((m) => (
            <div
              key={`${m.sourceKind}:${m.sourceId}`}
              className="flex items-start gap-3 px-3 py-2"
            >
              <span className="mt-px shrink-0 rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">
                {m.sourceKind.replaceAll("_", " ")}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-foreground">
                  {m.label ?? m.sourceId}
                </div>
                {m.notes ? (
                  <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {m.notes}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          This store has no members yet.
        </div>
      )}
    </EntityCard>
  );
}
