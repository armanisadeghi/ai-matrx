"use client";

/**
 * AssignedScopesDisplay — read-only display of the scopes an entity is tagged
 * with, rendered as the canonical `Scope Type: Scope` chain (+ an Organization
 * line). This is NOT an editor: it shows ONLY the assigned scopes, grouped by
 * their scope type — never the full list of available scopes (that's what
 * EntityScopeTagger is for).
 *
 * Model (see features/scopes): an entity is tagged to scopes via
 * ctx_scope_assignments; each scope belongs to exactly one scope type (the
 * dimension). We resolve assignments → scope → type in one query and group.
 *
 * Variants:
 *   - "block"  → labelled rows (Organization / <Type>: <scopes>) for detail pages
 *   - "inline" → compact chips (`<Type>: <Scope>`) for dense headers
 *
 * THE DOOR LAW: every scope and the organization named here is a real record we
 * hold the id of, so each renders through `EntityRef` — open, new tab, peek.
 * `scope` has no registry `hrefFor` yet, so its route comes from the shared
 * `scopeShortHref` resolver (see docs/handoffs/no-dead-ends-sweep.md).
 */

import React from "react";
import { Building2, Loader2, Tag } from "lucide-react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { scopeShortHref } from "@/features/scopes/lib/scopeRoutes";
import { scopesService } from "@/features/scopes/service/scopesService";
import type {
  EntityType,
} from "@/features/scopes/types";
import { useOrganizationLabel } from "@/features/organizations/hooks/useOrganizationLabel";
import { dispatchThunk, useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useStoreRead } from "@/lib/redux/store-reads/useStoreRead";
import { ensureEntityScopes, entityScopesKey } from "@/features/scopes/redux/thunks/ensureEntityScopes";
import type { EntityTypeToken } from "@ai-matrx/associations";
import { resolveIcon } from "@/features/scopes/utils/resolveIcon";
import {
  resolveColor,
  SCOPE_ICON_SURFACE,
} from "@/features/scopes/constants/scope-colors";

interface ScopeTypeRow {
  id: string;
  label_singular: string;
  label_plural: string;
  icon: string | null;
  color: string | null;
}
interface Group {
  type: ScopeTypeRow;
  scopes: { id: string; name: string }[];
}

const NO_GROUPS: Group[] = [];

/** The entity's assigned scopes, grouped by type (empty when the read fails). */
async function readAssignedGroups(entityType: string, entityId: string): Promise<Group[]> {
  const res = await scopesService.getEntityScopeDetails(entityType as EntityType, entityId);
  if (!res.ok || res.data.scopes.length === 0) return [];
  const byType = new Map<string, Group>();
  for (const row of res.data.scopes) {
    const t = row.scope_type;
    if (!t) continue;
    let group = byType.get(t.id);
    if (!group) {
      group = { type: t, scopes: [] };
      byType.set(t.id, group);
    }
    group.scopes.push({ id: row.id, name: row.name });
  }
  return Array.from(byType.values()).sort((a, b) => a.type.label_singular.localeCompare(b.type.label_singular));
}

export function AssignedScopesDisplay({
  entityType,
  entityId,
  organizationId,
  showOrg = true,
  variant = "block",
  emptyHint = "No scopes assigned yet.",
}: {
  entityType: string;
  entityId: string;
  organizationId?: string | null;
  showOrg?: boolean;
  variant?: "block" | "inline";
  emptyHint?: string;
}) {
  // Everything here is a store read — a remount or a wake renders it and reads
  // nothing. The assignment ids come from the scopes tree (`ensureEntityScopes`,
  // updated by every tagger write); the details are read once per SET of ids,
  // so a changed assignment reads again and an unchanged one never does.
  const dispatch = useAppDispatch();
  const scopesKey = entityScopesKey(entityType as EntityTypeToken, entityId);
  const assigned = useAppSelector((s) => s.scopesTree.entityScopesByKey[scopesKey]);
  React.useEffect(() => {
    void dispatchThunk(dispatch, ensureEntityScopes(entityType as EntityTypeToken, entityId));
  }, [dispatch, entityType, entityId]);
  const signature =
    assigned?.status === "ready"
      ? [...assigned.scope_ids].sort().join(",")
      : assigned?.status === "error"
        ? "unknown"
        : null;
  const detailsRead = useStoreRead<Group[]>(
    signature ? `scopes.assigned-details:${scopesKey}:${signature}` : null,
    () => readAssignedGroups(entityType, entityId),
  );
  const groups = detailsRead.data ?? NO_GROUPS;
  const orgName = useOrganizationLabel(showOrg ? organizationId : null)?.name ?? null;
  // No ids yet, or ids being described for the first time.
  const loading = signature === null || (signature !== "" && !detailsRead.hasData && detailsRead.status === "loading");

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading scopes…
      </div>
    );
  }

  if (variant === "inline") {
    if (groups.length === 0 && !showOrg) return null;
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {showOrg && (
          <Chip
            icon={<Building2 className="h-3 w-3" />}
            label="Organization"
            value={
              organizationId && orgName ? (
                <EntityRef
                  token="organization"
                  id={organizationId}
                  name={orgName}
                  showIcon={false}
                />
              ) : (
                (orgName ?? "None")
              )
            }
          />
        )}
        {groups.map((g) =>
          g.scopes.map((s) => (
            <Chip
              key={s.id}
              colorKey={g.type.color}
              typeId={g.type.id}
              label={g.type.label_singular}
              value={
                <EntityRef
                  token="scope"
                  id={s.id}
                  name={s.name}
                  href={scopeShortHref(s.id)}
                  showIcon={false}
                />
              }
            />
          )),
        )}
      </div>
    );
  }

  // block
  return (
    <dl className="space-y-2">
      {showOrg && (
        <Row
          icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
          label="Organization"
          values={[
            organizationId && orgName ? (
              <EntityRef
                token="organization"
                id={organizationId}
                name={orgName}
                showIcon={false}
              />
            ) : (
              (orgName ?? "None")
            ),
          ]}
          muted={!orgName}
        />
      )}
      {groups.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Tag className="h-4 w-4" /> {emptyHint}
        </div>
      ) : (
        groups.map((g) => {
          const Icon = resolveIcon(g.type.icon);
          const color = resolveColor(g.type);
          return (
            <Row
              key={g.type.id}
              icon={
                <span
                  className={`h-6 w-6 rounded-md flex items-center justify-center ring-1 ${SCOPE_ICON_SURFACE} ${color.fg} ${color.ring}`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
              }
              label={g.type.label_singular}
              values={g.scopes.map((s) => (
                <EntityRef
                  key={s.id}
                  token="scope"
                  id={s.id}
                  name={s.name}
                  href={scopeShortHref(s.id)}
                  showIcon={false}
                />
              ))}
            />
          );
        })
      )}
    </dl>
  );
}

function Row({
  icon,
  label,
  values,
  muted,
}: {
  icon: React.ReactNode;
  label: string;
  /** Nodes, not strings — each value is an `EntityRef` (name + its doors). */
  values: React.ReactNode[];
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 w-36 shrink-0">
        {icon}
        <dt className="text-sm font-medium text-muted-foreground truncate">
          {label}
        </dt>
      </div>
      <dd className="flex flex-wrap gap-1.5 min-w-0">
        {values.map((v, i) => (
          <span
            key={i}
            className={`inline-flex items-center text-sm ${muted ? "text-muted-foreground italic" : "text-foreground font-medium"}`}
          >
            {v}
            {i < values.length - 1 ? "," : ""}
          </span>
        ))}
      </dd>
    </div>
  );
}

function Chip({
  icon,
  colorKey,
  typeId,
  label,
  value,
}: {
  icon?: React.ReactNode;
  colorKey?: string | null;
  typeId?: string;
  label: string;
  /** A node, not a string — the value is an `EntityRef` (name + its doors). */
  value: React.ReactNode;
}) {
  const color = typeId
    ? resolveColor({ id: typeId, color: colorKey ?? null })
    : null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ring-1 ${SCOPE_ICON_SURFACE} ${color ? `${color.fg} ${color.ring}` : "text-muted-foreground border-border"}`}
    >
      {icon}
      <span className="font-medium">{label}:</span>
      <span>{value}</span>
    </span>
  );
}
