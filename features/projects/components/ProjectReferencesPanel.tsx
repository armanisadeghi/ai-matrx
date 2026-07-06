"use client";

import React, { useMemo, useState } from "react";
import {
  Boxes,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import {
  tryGetEntityInfoByTable,
  getContentRoleMeta,
  CONTENT_ROLES,
  type ContentRole,
} from "@/features/scopes/registry/entityRegistry";
import { useProjectReferences } from "../hooks";
import type { ProjectReference } from "../types";

// ============================================================================
// Display resolution — driven ENTIRELY by the canonical entity registry
// (`platform.entity_types` → getEntityInfo). No hand-maintained table map:
// every referencing table resolves its icon / label / grouping through the
// same registry every other association surface uses. A table that backs no
// registered entity (legacy / uncanonicalized) falls to the "Other" bucket
// with a generated label — which is itself the signal that it needs a token.
// ============================================================================

// Grouping axis = the registry's ContentRole (utility/source/destination/
// hybrid/container), plus a terminal "other" bucket for unregistered tables.
type GroupId = ContentRole | "other";

const GROUP_ORDER: GroupId[] = [
  ...CONTENT_ROLES.map((r) => r.id),
  "other",
];

interface ResolvedRef {
  ref: ProjectReference;
  Icon: LucideIcon;
  label: string;
  colorClass: string;
  group: GroupId;
}

function resolveRef(r: ProjectReference): ResolvedRef {
  const info = tryGetEntityInfoByTable(r.schemaName, r.tableName);
  if (info) {
    return {
      ref: r,
      Icon: info.Icon,
      label: info.labelPlural,
      colorClass: getContentRoleMeta(info.contentRole).accentText,
      group: info.contentRole,
    };
  }
  // Unregistered table — generated label so it's still legible, but binned into
  // "Other" so the gap is visible rather than papered over.
  return {
    ref: r,
    Icon: Boxes,
    label: r.tableName
      .replace(/^(ctx_|agx_|cx_|rs_|udt_|wc_|pc_|kg_|wf_)/, "")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    colorClass: "text-muted-foreground",
    group: "other",
  };
}

function groupTitle(group: GroupId): string {
  return group === "other" ? "Other" : getContentRoleMeta(group).title;
}

function groupBgClass(group: GroupId): string {
  return group === "other" ? "bg-muted/20" : getContentRoleMeta(group).accentBg;
}

function groupColorClass(group: GroupId): string {
  return group === "other"
    ? "text-muted-foreground"
    : getContentRoleMeta(group).accentText;
}

// ============================================================================
// Sub-components
// ============================================================================

function ReferenceRow({ resolved }: { resolved: ResolvedRef }) {
  const { ref: r, Icon, label, colorClass } = resolved;
  const isEmpty = r.rowCount === 0;

  return (
    <div
      className={`flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors ${
        isEmpty ? "opacity-40" : "hover:bg-muted/40"
      }`}
    >
      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${colorClass}`} />
      <span className="text-sm flex-1 min-w-0 truncate">{label}</span>
      <span
        className={cn(
          "text-xs font-mono tabular-nums min-w-[2rem] text-right",
          isEmpty ? "text-muted-foreground/60" : "text-muted-foreground",
        )}
      >
        {r.rowCount.toLocaleString()}
      </span>
    </div>
  );
}

interface CategoryGroup {
  group: GroupId;
  refs: ResolvedRef[];
  totalCount: number;
}

function CategorySection({
  group,
  showEmpty,
}: {
  group: CategoryGroup;
  showEmpty: boolean;
}) {
  const visibleRefs = showEmpty
    ? group.refs
    : group.refs.filter((r) => r.ref.rowCount > 0);

  if (visibleRefs.length === 0) return null;

  return (
    <div className="space-y-0.5">
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-sm ${groupBgClass(group.group)}`}
      >
        <span
          className={`text-xs font-semibold uppercase tracking-wide ${groupColorClass(group.group)}`}
        >
          {groupTitle(group.group)}
        </span>
        <span className="text-xs text-muted-foreground ml-auto">
          {group.totalCount > 0 && group.totalCount.toLocaleString()}
        </span>
      </div>
      {visibleRefs.map((resolved) => (
        <ReferenceRow
          key={`${resolved.ref.schemaName}.${resolved.ref.tableName}`}
          resolved={resolved}
        />
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-5 w-20 rounded" />
          {[1, 2, 3].map((j) => (
            <div key={j} className="flex items-center gap-2 px-2 py-1.5">
              <Skeleton className="h-3.5 w-3.5 rounded-sm flex-shrink-0" />
              <Skeleton className="h-4 flex-1 rounded" />
              <Skeleton className="h-5 w-8 rounded-full" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

interface ProjectReferencesPanelProps {
  projectId: string;
  /**
   * When the panel is rendered inside a section that already supplies a Card +
   * heading, set this to drop the panel's own outer Card and title chrome.
   */
  embedded?: boolean;
}

export function ProjectReferencesPanel({
  projectId,
  embedded = false,
}: ProjectReferencesPanelProps) {
  const { references, loading, error, refresh } =
    useProjectReferences(projectId);
  const [showEmpty, setShowEmpty] = useState(false);

  const { groups, totalItems, populatedCount, emptyCount } = useMemo(() => {
    const byGroup = new Map<GroupId, ResolvedRef[]>();

    for (const r of references) {
      const resolved = resolveRef(r);
      if (!byGroup.has(resolved.group)) byGroup.set(resolved.group, []);
      byGroup.get(resolved.group)!.push(resolved);
    }

    const orderedGroups: CategoryGroup[] = [];
    for (const group of GROUP_ORDER) {
      const refs = byGroup.get(group);
      if (!refs) continue;
      refs.sort((a, b) => b.ref.rowCount - a.ref.rowCount);
      orderedGroups.push({
        group,
        refs,
        totalCount: refs.reduce((s, r) => s + r.ref.rowCount, 0),
      });
    }

    const totalItems = references.reduce((s, r) => s + r.rowCount, 0);
    const populatedCount = references.filter((r) => r.rowCount > 0).length;
    const emptyCount = references.filter((r) => r.rowCount === 0).length;

    return { groups: orderedGroups, totalItems, populatedCount, emptyCount };
  }, [references]);

  const body = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          {!embedded && (
            <h3 className="text-sm font-semibold">Details &amp; references</h3>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">
            Every table in the database that references this project.
          </p>
          {!loading && references.length > 0 && (
            <p className="text-xs text-muted-foreground/80 mt-0.5">
              {populatedCount > 0
                ? `${totalItems.toLocaleString()} item${totalItems !== 1 ? "s" : ""} across ${populatedCount} entity type${populatedCount !== 1 ? "s" : ""}`
                : "No items associated with this project yet"}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={refresh}
          disabled={loading}
          title="Refresh"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="text-sm text-destructive px-2 py-3 text-center">
          {error}
        </div>
      ) : references.length === 0 ? (
        <div className="text-sm text-muted-foreground px-2 py-3 text-center">
          No reference data available.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <CategorySection
              key={group.group}
              group={group}
              showEmpty={showEmpty}
            />
          ))}

          {emptyCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground h-7 gap-1.5"
              onClick={() => setShowEmpty((v) => !v)}
            >
              {showEmpty ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  Hide {emptyCount} empty type{emptyCount !== 1 ? "s" : ""}
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  Show {emptyCount} empty type{emptyCount !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="space-y-3">{body}</div>;
  }

  return <Card className="p-4 space-y-3">{body}</Card>;
}
