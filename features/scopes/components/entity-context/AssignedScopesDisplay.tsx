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
 */

import React from "react";
import { Building2, Loader2, Tag } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { getOrganizationBySlugOrId } from "@/features/organizations/service";
import { resolveIcon } from "@/features/scope-system/utils/resolveIcon";
import {
  resolveColor,
  SCOPE_ICON_SURFACE,
} from "@/features/scope-system/constants/scope-colors";

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
  const [groups, setGroups] = React.useState<Group[]>([]);
  const [orgName, setOrgName] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Org name (the entity's single org), resolved separately.
      if (showOrg && organizationId) {
        getOrganizationBySlugOrId(organizationId).then((o) => {
          if (!cancelled) setOrgName(o?.name ?? null);
        });
      } else {
        setOrgName(null);
      }

      const { data: assigns } = await supabase
        .from("ctx_scope_assignments")
        .select("scope_id")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId);
      const ids = (assigns ?? []).map((a) => String((a as { scope_id: string }).scope_id));
      if (ids.length === 0) {
        if (!cancelled) {
          setGroups([]);
          setLoading(false);
        }
        return;
      }

      const { data: scopes } = await supabase
        .from("ctx_scopes")
        .select(
          "id, name, scope_type:ctx_scope_types(id, label_singular, label_plural, icon, color)",
        )
        .in("id", ids);

      if (cancelled) return;
      const byType = new Map<string, Group>();
      for (const row of (scopes ?? []) as unknown as Array<{
        id: string;
        name: string;
        scope_type: ScopeTypeRow | null;
      }>) {
        const t = row.scope_type;
        if (!t) continue;
        if (!byType.has(t.id)) byType.set(t.id, { type: t, scopes: [] });
        byType.get(t.id)!.scopes.push({ id: row.id, name: row.name });
      }
      const sorted = Array.from(byType.values()).sort((a, b) =>
        a.type.label_singular.localeCompare(b.type.label_singular),
      );
      setGroups(sorted);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, organizationId, showOrg]);

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
          <Chip icon={<Building2 className="h-3 w-3" />} label="Organization" value={orgName ?? "None"} />
        )}
        {groups.map((g) =>
          g.scopes.map((s) => (
            <Chip
              key={s.id}
              colorKey={g.type.color}
              typeId={g.type.id}
              label={g.type.label_singular}
              value={s.name}
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
          values={[orgName ?? "None"]}
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
              values={g.scopes.map((s) => s.name)}
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
  values: string[];
  muted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 w-36 shrink-0">
        {icon}
        <dt className="text-sm font-medium text-muted-foreground truncate">{label}</dt>
      </div>
      <dd className="flex flex-wrap gap-1.5 min-w-0">
        {values.map((v, i) => (
          <span
            key={i}
            className={`text-sm ${muted ? "text-muted-foreground italic" : "text-foreground font-medium"}`}
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
  value: string;
}) {
  const color = typeId ? resolveColor({ id: typeId, color: colorKey ?? null }) : null;
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
