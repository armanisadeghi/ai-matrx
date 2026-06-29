// features/scopes/components/associations/EntityAssociator.tsx
//
// THE canonical UI for attaching/detaching any entity to any other entity.
// Drop it on any surface that owns an entity (a note, an agent, a war room…)
// and it renders that entity's durable relationships as removable chips plus
// an "Add" affordance per allowed target type:
//
//     <EntityAssociator sourceType="note" sourceId={noteId} />
//
// It is a thin, reusable shell over the association primitive:
//   • reads/writes exclusively through `useAssociations({ type, id })`;
//   • REUSES the scope-tree pickers (EntityTargetPicker, scope-tree selectors)
//     rather than inventing new ones;
//   • NEVER imports or dispatches appContextSlice. Durable associations are
//     NOT active context — that is the load-bearing invariant of this module
//     (see features/scopes/redux/thunks/associations.ts header). A picker here
//     must never change the sidebar's working context.
//
// Edge direction is shown honestly: OUTGOING edges (this entity → X) are
// "Linked to" and removable, because `remove` only deletes edges this entity
// authored as the source. INCOMING edges (Y → this entity) are "Referenced by"
// and read-only — they are owned by the other end and can't be detached here.

"use client";

import { useState } from "react";
import { AlertTriangle, Link2, Loader2, RefreshCw, X } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { toast } from "sonner";
import { useAssociations } from "@/features/scopes/hooks/useAssociations";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import {
  makeSelectScopeNameMapForOrg,
  makeSelectScopeTypeLabelMapForOrg,
} from "@/features/scopes/redux/selectors/tree";
import type {
  AssociationEdge,
  AssociationTargetType,
  EntityType,
} from "@/features/scopes/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils/cn";
import {
  AssociationAddControl,
  type ChosenTarget,
} from "./AssociationAddControl";

// ─── Public API ───────────────────────────────────────────────────────────

export interface EntityAssociatorProps {
  /** The entity this panel attaches/detaches relationships for (the source). */
  sourceType: EntityType | string;
  sourceId: string;
  /** Which target types the user may add. Defaults to scope / project / task. */
  allowedTargetTypes?: AssociationTargetType[];
  /** Panel heading. Defaults to "Associations". */
  title?: string;
  /** Optional org override for the pickers/label maps; defaults to active org. */
  organizationId?: string | null;
  className?: string;
}

const DEFAULT_ALLOWED: AssociationTargetType[] = ["scope", "project", "task"];

// Plural, human labels for each target type — used as the group heading and
// the "Add" affordance grouping. New AssociationTargetType members must be
// added here (TS will flag a missing key).
const TYPE_LABEL_PLURAL: Record<AssociationTargetType, string> = {
  scope: "Scopes",
  scope_type: "Scope types",
  project: "Projects",
  task: "Tasks",
  context_item: "Context items",
  thread: "Threads",
  war_room: "War rooms",
  category: "Categories",
  conversation: "Conversations",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function EntityAssociator(props: EntityAssociatorProps) {
  const {
    sourceType,
    sourceId,
    allowedTargetTypes = DEFAULT_ALLOWED,
    title = "Associations",
    className,
  } = props;

  const { edges, status, error, add, remove, reload } = useAssociations({
    type: sourceType,
    id: sourceId,
  });

  // Label maps for scope / scope_type / project targets (id → name), so chips
  // and freshly-added edges read as names instead of UUIDs. The scope tree is
  // already hydrated app-wide; this is a cheap memoized read, no fetch.
  useScopeTree();
  const activeOrgId = useAppSelector(selectActiveOrganizationId);
  const orgId = props.organizationId ?? activeOrgId;
  const [selectScopeNames] = useState(() => makeSelectScopeNameMapForOrg());
  const [selectScopeTypeNames] = useState(() =>
    makeSelectScopeTypeLabelMapForOrg(),
  );
  const scopeNameMap = useAppSelector((s) => selectScopeNames(s, orgId));
  const scopeTypeNameMap = useAppSelector((s) =>
    selectScopeTypeNames(s, orgId),
  );

  // Optimistic detach: hide the edge the instant the user clicks ✕ instead of
  // waiting for the RPC round-trip (the cache reconciles on success; on error
  // we surface it loudly and the edge reappears).
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  const resolveLabel = (edge: AssociationEdge): string => {
    if (edge.label && edge.label.trim()) return edge.label;
    if (edge.otherType === "scope" && scopeNameMap[edge.otherId]) {
      return scopeNameMap[edge.otherId];
    }
    if (edge.otherType === "scope_type" && scopeTypeNameMap[edge.otherId]) {
      return scopeTypeNameMap[edge.otherId];
    }
    if (edge.otherType === "project" && scopeNameMap[edge.otherId]) {
      return scopeNameMap[edge.otherId];
    }
    return shortId(edge.otherId);
  };

  const handleAdd = async (chosen: ChosenTarget) => {
    const res = await add({
      targetType: chosen.targetType,
      targetId: chosen.targetId,
      orgId: chosen.orgId ?? orgId ?? undefined,
      label: chosen.label ?? undefined,
    });
    if (!res.ok) toast.error(res.error || "Could not add association");
  };

  const handleRemove = async (edge: AssociationEdge) => {
    setRemovingIds((prev) => new Set(prev).add(edge.id));
    const res = await remove({
      targetType: edge.otherType,
      targetId: edge.otherId,
    });
    if (!res.ok) {
      toast.error(res.error || "Could not remove association");
    }
    setRemovingIds((prev) => {
      const next = new Set(prev);
      next.delete(edge.id);
      return next;
    });
  };

  const visibleEdges = edges.filter((e) => !removingIds.has(e.id));
  const outgoing = visibleEdges.filter((e) => e.direction === "outgoing");
  const incoming = visibleEdges.filter((e) => e.direction === "incoming");

  // Group OUTGOING edges by their target type for "Linked to" sections.
  const outgoingByType = groupByOtherType(outgoing);
  // INCOMING edges are owned by the other end; group by the source's type.
  const incomingByType = groupByOtherType(incoming);

  const isLoading = status === "loading" || status === "idle";
  const isEmpty = status === "ready" && visibleEdges.length === 0;

  return (
    <div className={cn("flex flex-col gap-2 text-foreground", className)}>
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
          <Link2 className="h-3.5 w-3.5" />
          {title}
        </h3>
        <button
          type="button"
          onClick={() => void reload()}
          title="Refresh associations"
          className="text-muted-foreground/60 hover:text-foreground transition-colors"
        >
          <RefreshCw
            className={cn("h-3 w-3", status === "loading" && "animate-spin")}
          />
        </button>
      </div>

      {/* ── error ──────────────────────────────────────────────────────── */}
      {status === "error" && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2">
          <span className="flex items-center gap-1.5 text-[11px] text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">{error || "Failed to load associations"}</span>
          </span>
          <button
            type="button"
            onClick={() => void reload()}
            className="flex items-center gap-1 text-[11px] font-medium text-destructive hover:underline flex-shrink-0"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* ── loading ────────────────────────────────────────────────────── */}
      {status !== "error" && isLoading && (
        <div className="space-y-1.5 px-1">
          <Skeleton className="h-3 w-16" />
          <div className="flex flex-wrap gap-1.5">
            <Skeleton className="h-6 w-24 rounded-md" />
            <Skeleton className="h-6 w-20 rounded-md" />
            <Skeleton className="h-6 w-28 rounded-md" />
          </div>
        </div>
      )}

      {/* ── current associations ───────────────────────────────────────── */}
      {status === "ready" && !isEmpty && (
        <div className="space-y-2.5">
          {Object.keys(outgoingByType).length > 0 && (
            <div className="space-y-2">
              {Object.entries(outgoingByType).map(([otherType, group]) => (
                <EdgeGroup
                  key={`out-${otherType}`}
                  heading={headingFor(otherType, "Linked to")}
                  edges={group}
                  resolveLabel={resolveLabel}
                  removingIds={removingIds}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          )}

          {Object.keys(incomingByType).length > 0 && (
            <div className="space-y-2 border-t border-border/40 pt-2">
              <p className="px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                Referenced by
              </p>
              {Object.entries(incomingByType).map(([otherType, group]) => (
                <EdgeGroup
                  key={`in-${otherType}`}
                  heading={headingFor(otherType, "")}
                  edges={group}
                  resolveLabel={resolveLabel}
                  readOnly
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── empty ──────────────────────────────────────────────────────── */}
      {isEmpty && (
        <p className="px-1 py-1 text-[11px] text-muted-foreground">
          No associations yet.
        </p>
      )}

      {/* ── add affordances (one per allowed target type) ──────────────── */}
      {status !== "error" && allowedTargetTypes.length > 0 && (
        <div className="space-y-0.5 border-t border-border/40 pt-1.5">
          {allowedTargetTypes.map((tt) => (
            <AssociationAddControl
              key={tt}
              targetType={tt}
              attachedIds={attachedIdSet(outgoing, tt)}
              organizationId={orgId}
              onChoose={handleAdd}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Edge group (one target-type section of chips) ──────────────────────────

function EdgeGroup({
  heading,
  edges,
  resolveLabel,
  removingIds,
  onRemove,
  readOnly,
}: {
  heading: string;
  edges: AssociationEdge[];
  resolveLabel: (edge: AssociationEdge) => string;
  removingIds?: Set<string>;
  onRemove?: (edge: AssociationEdge) => void;
  readOnly?: boolean;
}) {
  if (edges.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="px-1 text-[10px] font-medium text-muted-foreground/70">
        {heading}
      </p>
      <div className="flex flex-wrap gap-1.5 px-1">
        {edges.map((edge) => {
          const busy = removingIds?.has(edge.id) ?? false;
          return (
            <Badge
              key={edge.id}
              variant="outline"
              className={cn(
                "gap-1 bg-muted/60 text-foreground border-border max-w-[14rem]",
                busy && "opacity-50",
              )}
              title={`${edge.otherType} · ${edge.otherId}`}
            >
              <span className="truncate">{resolveLabel(edge)}</span>
              {!readOnly && onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(edge)}
                  disabled={busy}
                  className="-mr-0.5 ml-0.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  aria-label="Remove association"
                >
                  {busy ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <X className="h-2.5 w-2.5" />
                  )}
                </button>
              )}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────

function groupByOtherType(
  edges: AssociationEdge[],
): Record<string, AssociationEdge[]> {
  const out: Record<string, AssociationEdge[]> = {};
  for (const e of edges) {
    (out[e.otherType] ??= []).push(e);
  }
  return out;
}

/** Group heading: a known target-type plural, else the raw token, then a
 *  prefix verb ("Linked to Projects"). Empty prefix → just the plural. */
function headingFor(otherType: string, prefix: string): string {
  const plural =
    TYPE_LABEL_PLURAL[otherType as AssociationTargetType] ??
    titleize(otherType);
  return prefix ? `${prefix} ${plural}` : plural;
}

function attachedIdSet(
  outgoing: AssociationEdge[],
  targetType: AssociationTargetType,
): Set<string> {
  const set = new Set<string>();
  for (const e of outgoing) {
    if (e.otherType === targetType) set.add(e.otherId);
  }
  return set;
}

function shortId(id: string): string {
  if (id.length <= 10) return id;
  return `${id.slice(0, 8)}…`;
}

function titleize(token: string): string {
  return token
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export default EntityAssociator;
