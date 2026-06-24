"use client";

/**
 * Context-layer drawer bodies — the active-context layers (organization, a
 * single scope, project) rendered as navigable drawer items, the same way every
 * other context item opens in the side drawer.
 *
 * A scope shows its context items + current values (the data that drives
 * automatic variable application). Org / project show a compact identity card
 * with a manage link. Tasks reuse the existing `TaskBody` (native TaskEditor)
 * via the registry — no body here.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Briefcase, ExternalLink } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveOrganizationName } from "@/features/scopes/redux/selectors/active-context";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { useContextValues } from "@/features/scopes/hooks/useContextValues";
import { scopesService } from "@/features/scopes/service/scopesService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type {
  ContextItemValue,
  ScopeNode,
  ScopeTypeNode,
} from "@/features/scopes/types";
// DB-only icon renderer via the dynamic front door (scope-type icons come from
// the database). Heavy payload stays out of this window chunk's eval until an
// icon actually renders.
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import { Badge } from "@/components/ui/badge";
import type { ContextItemBodyProps } from "../types";

// ── Organization ─────────────────────────────────────────────────────────────

export function OrgLayerBody({ item, setTitle }: ContextItemBodyProps) {
  const orgId = item.refs.orgId ?? null;
  const fallbackName = useAppSelector(selectActiveOrganizationName);
  const { organizations } = useScopeTree();
  const org = orgId
    ? (organizations.find((o) => o.id === orgId) ?? null)
    : null;
  const name = org?.name ?? fallbackName ?? "Organization";

  useEffect(() => {
    if (name) setTitle?.(name);
  }, [name, setTitle]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <Building2 className="h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Organization
          </div>
          <div className="truncate text-base font-semibold text-foreground">
            {name}
          </div>
        </div>
      </div>
      {org && (
        <div className="flex flex-wrap gap-1.5">
          {org.scope_types.map((t) => (
            <Badge key={t.id} variant="outline" className="text-[10px]">
              <DynamicIcon
                name={t.icon}
                color={t.color}
                className="mr-1 h-3 w-3"
              />
              {t.label_plural} · {t.scopes.length}
            </Badge>
          ))}
        </div>
      )}
      {org && (
        <Link
          href={`/organizations/${org.slug ?? org.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Manage organization
        </Link>
      )}
    </div>
  );
}

// ── Project ──────────────────────────────────────────────────────────────────

export function ProjectLayerBody({ item, setTitle }: ContextItemBodyProps) {
  const projectId = item.refs.projectIds?.[0] ?? null;
  const orgId = item.refs.orgId ?? null;
  const { organizations } = useScopeTree();
  const org = orgId
    ? (organizations.find((o) => o.id === orgId) ?? null)
    : null;
  const project =
    projectId && org
      ? (org.projects.find((p) => p.id === projectId) ?? null)
      : null;
  const name = project?.name ?? item.title;

  useEffect(() => {
    if (name) setTitle?.(name);
  }, [name, setTitle]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <Briefcase className="h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Project
          </div>
          <div className="truncate text-base font-semibold text-foreground">
            {name}
          </div>
        </div>
      </div>
      {projectId && (
        <Link
          href={`/projects/${projectId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open project
        </Link>
      )}
    </div>
  );
}

// ── Scope (context items + current values) ──────────────────────────────────

export function ScopeLayerBody({ item, setTitle }: ContextItemBodyProps) {
  const scopeId = item.refs.scopeId ?? null;
  const { organizations } = useScopeTree();

  const found: { type: ScopeTypeNode | null; scope: ScopeNode | null } =
    (() => {
      if (!scopeId) return { type: null, scope: null };
      for (const org of organizations) {
        for (const t of org.scope_types) {
          const s = t.scopes.find((x) => x.id === scopeId);
          if (s) return { type: t, scope: s };
        }
      }
      return { type: null, scope: null };
    })();

  const scopeName = found.scope?.name ?? item.title;
  useEffect(() => {
    if (scopeName) setTitle?.(scopeName);
  }, [scopeName, setTitle]);

  const { values, status } = useContextValues(scopeId);

  const typeId = found.type?.id ?? null;
  const [itemNames, setItemNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!typeId) return;
    let cancelled = false;
    void scopesService.listContextItems(typeId).then((res) => {
      if (cancelled || isScopesRpcErr(res)) return;
      setItemNames(
        Object.fromEntries(
          res.data.items.map((it) => [it.id, it.display_name]),
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [typeId]);

  const valueList = Object.values(values);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5">
        {found.type && (
          <DynamicIcon
            name={found.type.icon}
            color={found.type.color}
            className="h-4 w-4"
          />
        )}
        <span className="truncate text-sm font-semibold text-foreground">
          {scopeName}
        </span>
        {found.type && (
          <Badge
            variant="outline"
            className="ml-auto shrink-0 text-[10px]"
            style={{ borderColor: found.type.color, color: found.type.color }}
          >
            {found.type.label_singular}
          </Badge>
        )}
      </div>

      {status === "loading" ? (
        <div className="divide-y divide-border/40">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <div className="h-3 w-28 animate-pulse rounded bg-muted" />
              <div className="ml-auto h-3 w-44 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : valueList.length === 0 ? (
        <div className="px-4 py-8 text-center text-xs text-muted-foreground">
          No context values set on this scope yet.
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {valueList.map((v) => (
            <ScopeValueRow
              key={v.context_item_id}
              value={v}
              label={itemNames[v.context_item_id]}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ScopeValueRow({
  value,
  label,
}: {
  value: ContextItemValue;
  label?: string;
}) {
  const display: string = (() => {
    if (value.value_text != null) return value.value_text;
    if (value.value_number != null) return String(value.value_number);
    if (value.value_boolean != null)
      return value.value_boolean ? "true" : "false";
    if (value.value_date != null) return value.value_date;
    if (value.value_document_url) return value.value_document_url;
    if (value.value_reference_id) return `→ ${value.value_reference_id}`;
    if (value.value_json) return JSON.stringify(value.value_json);
    return "(empty)";
  })();

  return (
    <li className="flex items-start gap-3 px-4 py-2.5 text-xs">
      <div className="w-1/3 shrink-0 truncate text-muted-foreground">
        {label ?? value.context_item_id.slice(0, 8)}
      </div>
      <div className="flex-1 break-words text-foreground">{display}</div>
    </li>
  );
}
