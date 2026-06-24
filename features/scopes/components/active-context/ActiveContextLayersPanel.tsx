"use client";

// features/scopes/components/active-context/ActiveContextLayersPanel.tsx
//
// Read-only display of EVERY active context layer (org, scope type, scope(s),
// project, task) currently selected in the global appContext. For each scope it
// shows the scope's context items + their current values — the data that later
// drives automatic variable application. For org / project it renders a compact
// card with a manage link; for a task it embeds the native TaskEditor.
//
// This is a *display* surface (Surface-A read), not a writer — it never
// dispatches into appContextSlice. Pair it with ActiveContextPanel (the picker)
// when a host wants both "choose context" and "see what's in it".

import Link from "next/link";
import { Building2, Briefcase, ExternalLink, Layers } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectActiveOrganizationId,
  selectActiveOrganizationName,
  selectActiveProjectId,
  selectActiveScopeIds,
  selectActiveTaskId,
  selectHasActiveContext,
} from "@/features/scopes/redux/selectors/active-context";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { useContextValues } from "@/features/scopes/hooks/useContextValues";
import { scopesService } from "@/features/scopes/service/scopesService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type {
  ContextItemValue,
  OrgNode,
  ScopeNode,
  ScopeTypeNode,
} from "@/features/scopes/types";
// DB-only icon renderer via the dynamic front door (scope-type icons from DB).
import DynamicIcon from "@/components/official/icons/DynamicIcon.dynamic";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import TaskEditor from "@/features/tasks/components/TaskEditor";

export interface ActiveContextLayersPanelProps {
  className?: string;
}

export function ActiveContextLayersPanel({
  className,
}: ActiveContextLayersPanelProps) {
  const hasContext = useAppSelector(selectHasActiveContext);
  const orgId = useAppSelector(selectActiveOrganizationId);
  const orgName = useAppSelector(selectActiveOrganizationName);
  const scopeIds = useAppSelector(selectActiveScopeIds);
  const projectId = useAppSelector(selectActiveProjectId);
  const taskId = useAppSelector(selectActiveTaskId);

  const { organizations } = useScopeTree();
  const org = orgId
    ? (organizations.find((o) => o.id === orgId) ?? null)
    : null;
  const project =
    projectId && org
      ? (org.projects.find((p) => p.id === projectId) ?? null)
      : null;

  if (!hasContext) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 px-4 py-8 text-center",
          className,
        )}
      >
        <Layers className="h-5 w-5 text-muted-foreground/60" />
        <p className="text-xs text-muted-foreground">
          No context selected yet. Pick an organization, scopes, a project, or a
          task above to see what they carry.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {(orgId || orgName) && (
        <LayerCard
          icon={<Building2 className="h-3.5 w-3.5 text-primary" />}
          label="Organization"
          title={org?.name ?? orgName ?? "Organization"}
          href={org ? `/organizations/${org.slug ?? org.id}` : undefined}
        />
      )}

      {scopeIds.map((sid) => (
        <ScopeLayerCard key={sid} scopeId={sid} organizations={organizations} />
      ))}

      {projectId && (
        <LayerCard
          icon={<Briefcase className="h-3.5 w-3.5 text-primary" />}
          label="Project"
          title={project?.name ?? "Project"}
          href={`/projects/${projectId}`}
        />
      )}

      {taskId && (
        <section className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Task
            </span>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            <TaskEditor taskId={taskId} embedded compact />
          </div>
        </section>
      )}
    </div>
  );
}

/** Compact layer header with an optional "open in new tab" link. */
function LayerCard({
  icon,
  label,
  title,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  href?: string;
}) {
  return (
    <section className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="truncate text-sm font-medium text-foreground">
          {title}
        </div>
      </div>
      {href && (
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${label.toLowerCase()} in a new tab`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      )}
    </section>
  );
}

/** A single scope: its type badge + every context item and current value. */
function ScopeLayerCard({
  scopeId,
  organizations,
}: {
  scopeId: string;
  organizations: OrgNode[];
}) {
  const found: { type: ScopeTypeNode | null; scope: ScopeNode | null } =
    (() => {
      for (const org of organizations) {
        for (const t of org.scope_types) {
          const s = t.scopes.find((x) => x.id === scopeId);
          if (s) return { type: t, scope: s };
        }
      }
      return { type: null, scope: null };
    })();

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
    <section className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {found.type?.label_singular ?? "Scope"}
        </span>
        <span className="truncate text-sm font-medium text-foreground">
          {found.scope?.name ?? scopeId.slice(0, 8)}
        </span>
        {found.type && (
          <Badge
            variant="outline"
            className="ml-auto shrink-0 text-[10px]"
            style={{ borderColor: found.type.color, color: found.type.color }}
          >
            <DynamicIcon
              name={found.type.icon}
              color={found.type.color}
              className="mr-1 h-3 w-3"
            />
            {found.type.label_plural}
          </Badge>
        )}
      </div>

      {status === "loading" ? (
        <div className="divide-y divide-border/40">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="ml-auto h-3 w-40 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : valueList.length === 0 ? (
        <div className="px-3 py-4 text-center text-xs text-muted-foreground">
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
    </section>
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
    <li className="flex items-start gap-3 px-3 py-2 text-xs">
      <div className="w-1/3 shrink-0 truncate text-muted-foreground">
        {label ?? value.context_item_id.slice(0, 8)}
      </div>
      <div className="flex-1 break-words text-foreground">{display}</div>
    </li>
  );
}

export default ActiveContextLayersPanel;
