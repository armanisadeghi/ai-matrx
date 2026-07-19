"use client";

import { useMemo } from "react";
import { MapPin, AlertCircle, Maximize2, PanelRight } from "lucide-react";
import type { ToolRendererProps } from "../../types";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import { getArg, isTerminal, resultAsObject } from "../_shared";
import { EntityCard, type EntityAction } from "../_shared-entity/EntityCard";

/**
 * Inline renderer for `knowledge_browse(action="entity")` — the knowledge-graph
 * map around one entity: which artifacts mention it, and which entities it
 * travels with. The map IS the deliverable, so it renders as a card.
 *
 * Wire shape (aidream `knowledge_navigate`):
 *   { found, entity: { entity_id, name, kind }, total_mentions,
 *     artifacts: [{ source_kind, source_id, mention_count, top_chunk_ids }],
 *     linked_entities: [{ entity_id, name, kind, weight }], hint }
 */

interface ParsedArtifact {
  sourceKind: string;
  sourceId: string;
  mentionCount: number;
}

interface ParsedLinked {
  entityId: string;
  name: string;
  kind: string | null;
  weight: number;
}

interface ParsedEntityMap {
  found: boolean;
  name: string;
  kind: string | null;
  totalMentions: number;
  artifacts: ParsedArtifact[];
  linked: ParsedLinked[];
}

function parseEntityMap(entry: ToolLifecycleEntry): ParsedEntityMap | null {
  const result = resultAsObject(entry);
  if (!result) return null;
  const entity =
    result.entity && typeof result.entity === "object"
      ? (result.entity as Record<string, unknown>)
      : null;
  const rawArtifacts = Array.isArray(result.artifacts)
    ? (result.artifacts as Record<string, unknown>[])
    : [];
  const rawLinked = Array.isArray(result.linked_entities)
    ? (result.linked_entities as Record<string, unknown>[])
    : [];
  return {
    found: result.found !== false,
    name:
      (typeof entity?.name === "string" && entity.name) ||
      getArg<string>(entry, "entity") ||
      "Entity",
    kind: typeof entity?.kind === "string" ? entity.kind : null,
    totalMentions:
      typeof result.total_mentions === "number" ? result.total_mentions : 0,
    artifacts: rawArtifacts
      .filter((a) => typeof a.source_id === "string" && a.source_id)
      .map((a) => ({
        sourceKind:
          typeof a.source_kind === "string" ? a.source_kind : "unknown",
        sourceId: a.source_id as string,
        mentionCount:
          typeof a.mention_count === "number" ? a.mention_count : 0,
      })),
    linked: rawLinked
      .filter((l) => typeof l.name === "string" && l.name)
      .map((l) => ({
        entityId: typeof l.entity_id === "string" ? l.entity_id : "",
        name: l.name as string,
        kind: typeof l.kind === "string" ? l.kind : null,
        weight: typeof l.weight === "number" ? l.weight : 0,
      })),
  };
}

export function KnowledgeEntityInline({
  entry,
  onOpenOverlay,
  onOpenWindowPanel,
  expanded,
  onToggleExpanded,
}: ToolRendererProps) {
  const map = useMemo(() => parseEntityMap(entry), [entry]);

  if (!isTerminal(entry) && !map) return null;

  if (entry.status === "error" || !map) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <div className="font-medium">Couldn&apos;t navigate the entity</div>
          {entry.errorMessage ? (
            <div className="text-[11px] text-muted-foreground">
              {entry.errorMessage}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const subtitleParts: string[] = [];
  if (map.kind) subtitleParts.push(map.kind.replaceAll("_", " "));
  if (map.found) {
    subtitleParts.push(
      `${map.totalMentions.toLocaleString()} ${map.totalMentions === 1 ? "mention" : "mentions"}`,
    );
    subtitleParts.push(
      `${map.artifacts.length} ${map.artifacts.length === 1 ? "artifact" : "artifacts"}`,
    );
  } else {
    subtitleParts.push("not found in the knowledge graph");
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
      icon={MapPin}
      accent="cyan"
      title={map.name}
      subtitle={subtitleParts.join(" · ")}
      actions={actions}
    >
      {!map.found ? (
        <div className="px-3 py-3 text-xs text-muted-foreground">
          No entity matched that name in the indexed knowledge.
        </div>
      ) : (
        <>
          {map.artifacts.length ? (
            <div className="border-b border-border/60">
              <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Mentioned in
              </div>
              <div className="divide-y divide-border/60">
                {map.artifacts.map((a) => (
                  <div
                    key={`${a.sourceKind}:${a.sourceId}`}
                    className="flex items-center gap-3 px-3 py-1.5"
                  >
                    <span className="shrink-0 rounded bg-muted px-1 py-px text-[10px] text-muted-foreground">
                      {a.sourceKind.replaceAll("_", " ")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                      {a.sourceId}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {a.mentionCount}×
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {map.linked.length ? (
            <div>
              <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Travels with
              </div>
              <div className="flex flex-wrap gap-1.5 px-3 pb-3 pt-1">
                {map.linked.map((l) => (
                  <span
                    key={l.entityId || l.name}
                    className="rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] text-foreground"
                    title={
                      l.kind
                        ? `${l.kind} · weight ${l.weight.toFixed(2)}`
                        : `weight ${l.weight.toFixed(2)}`
                    }
                  >
                    {l.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </EntityCard>
  );
}
