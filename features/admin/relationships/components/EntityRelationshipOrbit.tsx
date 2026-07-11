"use client";

// features/admin/relationships/components/EntityRelationshipOrbit.tsx
//
// Route-agnostic entity-type explorer core: sources that target this entity
// on the left, the focus entity in the middle, entities it targets on the
// right — the "what does this touch, what touches it" view for one
// entity_types token, derived from admin_relationship_rules() via
// buildOrbitGraph (features/admin/relationships/utils.ts).
//
// Deliberately framework-light (three columns, no canvas) so it can be
// dropped into both the [token] route page and a WindowPanel unchanged.
// A future React Flow graph (agents/sets-style thin shell + `dynamic({ ssr:
// false })` Impl) can consume the same OrbitGraph shape without touching this
// component's callers.

import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Boxes } from "lucide-react";

import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { EntityTypeChip } from "@/components/entity-types/EntityTypeChip";
import { Badge } from "@/components/ui/badge";
import { buildOrbitGraph, type OrbitNeighbor } from "../utils";
import type { RelationshipRule, PermissionLevel } from "../types";

function label(token: string): string {
  return tryGetEntityInfo(token)?.label ?? token;
}

function ConveyPill({ level }: { level: PermissionLevel }) {
  const tone =
    level === "admin"
      ? "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-500"
      : level === "viewer"
        ? "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400"
        : "border-primary/40 bg-primary/10 text-primary";
  return (
    <span
      className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${tone}`}
    >
      {level}
    </span>
  );
}

interface NeighborCardProps {
  neighbor: OrbitNeighbor;
  onSelectToken?: (token: string) => void;
}

function NeighborCard({ neighbor, onSelectToken }: NeighborCardProps) {
  const { rule } = neighbor;
  const conveying = rule.container_side !== "none" && rule.is_active;
  return (
    <button
      type="button"
      onClick={() => onSelectToken?.(neighbor.token)}
      disabled={!onSelectToken}
      className="flex w-full flex-col gap-1 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-accent/40 disabled:cursor-default disabled:hover:border-border disabled:hover:bg-card"
    >
      <div className="flex items-center justify-between gap-2">
        <EntityTypeChip token={neighbor.token} showToken />
        {!rule.is_active ? (
          <Badge
            variant="outline"
            className="text-[10px] text-muted-foreground"
          >
            inactive
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {conveying ? (
          <ConveyPill level={rule.conveys_max} />
        ) : (
          <span className="text-[10px] text-muted-foreground">known only</span>
        )}
        {rule.label ? (
          <span className="font-mono text-[10px] text-muted-foreground">
            label: {rule.label}
          </span>
        ) : null}
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {rule.edge_count} edge{rule.edge_count === 1 ? "" : "s"}
        </span>
      </div>
    </button>
  );
}

function OrbitColumn({
  title,
  icon,
  neighbors,
  emptyText,
  onSelectToken,
  align = "left",
}: {
  title: string;
  icon: ReactNode;
  neighbors: OrbitNeighbor[];
  emptyText: string;
  onSelectToken?: (token: string) => void;
  align?: "left" | "right";
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <h3
        className={`flex items-center gap-1.5 text-xs font-semibold text-muted-foreground ${
          align === "right" ? "flex-row-reverse justify-end" : ""
        }`}
      >
        {icon}
        {title}
        <Badge variant="outline" className="ml-1">
          {neighbors.length}
        </Badge>
      </h3>
      <div className="flex flex-col gap-1.5 overflow-y-auto">
        {neighbors.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-2.5 py-3 text-center text-xs text-muted-foreground">
            {emptyText}
          </p>
        ) : (
          neighbors.map((n) => (
            <NeighborCard
              key={`${n.direction}:${n.rule.source_type}:${n.rule.target_type}:${n.rule.label ?? ""}`}
              neighbor={n}
              onSelectToken={onSelectToken}
            />
          ))
        )}
      </div>
    </div>
  );
}

export interface EntityRelationshipOrbitProps {
  token: string;
  rules: RelationshipRule[];
  onSelectToken?: (token: string) => void;
}

export function EntityRelationshipOrbit({
  token,
  rules,
  onSelectToken,
}: EntityRelationshipOrbitProps) {
  const graph = buildOrbitGraph(token, rules);
  const info = tryGetEntityInfo(token);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr]">
        <OrbitColumn
          title="Sources — target this"
          icon={<ArrowLeft className="h-3.5 w-3.5" />}
          neighbors={graph.sources}
          emptyText="Nothing targets this entity type yet."
          onSelectToken={onSelectToken}
        />

        <div className="flex flex-col items-center justify-center gap-2 self-start rounded-md border border-primary/30 bg-primary/5 px-6 py-6 md:min-w-[12rem]">
          {info ? (
            <info.Icon className="h-8 w-8 text-primary" />
          ) : (
            <Boxes className="h-8 w-8 text-primary" />
          )}
          <span className="text-center text-sm font-semibold text-foreground">
            {label(token)}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {token}
          </span>
          <div className="flex items-center gap-3 pt-1 text-[10px] text-muted-foreground">
            <span>{graph.sources.length} in</span>
            <span>{graph.targets.length} out</span>
          </div>
        </div>

        <OrbitColumn
          title="Targets — this points to"
          icon={<ArrowRight className="h-3.5 w-3.5" />}
          neighbors={graph.targets}
          emptyText="This entity type doesn't target anything yet."
          onSelectToken={onSelectToken}
          align="right"
        />
      </div>
    </div>
  );
}
