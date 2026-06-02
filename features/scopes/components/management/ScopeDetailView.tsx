// features/scopes/components/management/ScopeDetailView.tsx
//
// /scopes/[scopeId] — read-mostly detail view for a single scope. Shows the
// scope's owning type, parent org, description, and the values currently
// stored on every context-item that the type defines (via
// `useContextValues`). Write surfaces stub to "use the legacy editor" until
// the chokepoint-backed editors ship in Phase 5.

"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Building,
  ExternalLink,
  Network,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { useContextValues } from "@/features/scopes/hooks/useContextValues";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import type {
  ContextItemValue,
  OrgNode,
  ScopeNode,
  ScopeTypeNode,
} from "@/features/scopes/types";

interface ScopeDetailViewProps {
  scopeId: string;
}

export function ScopeDetailView({ scopeId }: ScopeDetailViewProps) {
  const { organizations, status, error } = useScopeTree();

  // React Compiler auto-memoizes — no manual `useMemo` (CLAUDE.md).
  const found: {
    org: OrgNode | null;
    type: ScopeTypeNode | null;
    scope: ScopeNode | null;
  } = (() => {
    for (const org of organizations) {
      for (const t of org.scope_types) {
        const s = t.scopes.find((x) => x.id === scopeId);
        if (s) return { org, type: t, scope: s };
      }
    }
    return { org: null, type: null, scope: null };
  })();

  const { values, status: valuesStatus } = useContextValues(
    found.scope ? found.scope.id : null,
  );

  if (status === "loading" && organizations.length === 0) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <Card className="p-4">
          <div className="h-4 w-64 bg-muted animate-pulse rounded" />
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <Card className="p-4 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
        <div className="text-sm">
          <div className="font-medium">Couldn't load scope</div>
          <div className="text-xs text-muted-foreground">{error}</div>
        </div>
      </Card>
    );
  }

  if (!found.scope || !found.type || !found.org) {
    return (
      <Card className="p-6 space-y-3">
        <div className="font-medium">Scope not found</div>
        <p className="text-xs text-muted-foreground">
          This scope may have been deleted, or you may not have permission to
          view it.
        </p>
        <Link
          href="/scopes"
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Scopes
        </Link>
      </Card>
    );
  }

  const { org, type, scope } = found;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Link
          href="/scopes"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          All Scopes
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <DynamicIcon
            name={type.icon}
            color={type.color}
            className="h-5 w-5"
          />
          <h1 className="text-2xl font-bold">{scope.name}</h1>
          <Badge
            variant="outline"
            className="text-[10px]"
            style={{ borderColor: type.color, color: type.color }}
          >
            {type.label_singular}
          </Badge>
          <Link
            href={`/scopes/${scopeId}/graph`}
            className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Network className="h-3.5 w-3.5" />
            View graph
          </Link>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Building className="h-3 w-3" />
          <span>{org.name}</span>
          {scope.description && (
            <>
              <span>·</span>
              <span className="truncate">{scope.description}</span>
            </>
          )}
        </div>
      </header>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Context values</h2>
          <Link
            href={`/organizations/${org.slug ?? org.id}/scopes/${type.id}/${scope.id}`}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" />
            Edit values (legacy)
          </Link>
        </div>
        <Card className="overflow-hidden">
          {valuesStatus === "loading" ? (
            <div className="divide-y divide-border/40">
              {[1, 2, 3].map((i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-48 bg-muted animate-pulse rounded ml-auto" />
                </div>
              ))}
            </div>
          ) : Object.keys(values).length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              No context items defined on{" "}
              <span className="font-medium">{type.label_plural}</span> yet. Use
              the legacy editor to add some.
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {Object.values(values).map((v) => (
                <ContextValueRow key={v.context_item_id} value={v} />
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Default variable keys</h2>
        <Card className="p-3">
          {type.default_variable_keys.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No defaults defined on this type.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {type.default_variable_keys.map((k) => (
                <Badge key={k} variant="outline" className="text-[10px]">
                  {k}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function ContextValueRow({ value }: { value: ContextItemValue }) {
  // React Compiler auto-memoizes — no manual `useMemo` (CLAUDE.md).
  const display: string = (() => {
    if (value.value_text != null) return value.value_text;
    if (value.value_number != null) return String(value.value_number);
    if (value.value_boolean != null)
      return value.value_boolean ? "true" : "false";
    if (value.value_document_url) return value.value_document_url;
    if (value.value_reference_id) return `→ ${value.value_reference_id}`;
    if (value.value_json) return JSON.stringify(value.value_json);
    return "(empty)";
  })();

  return (
    <li className="px-4 py-2.5 flex items-start gap-3 text-xs">
      <div className="font-mono text-muted-foreground shrink-0 w-1/3 truncate">
        {value.context_item_id.slice(0, 8)}
      </div>
      <div className="flex-1 break-words text-foreground">{display}</div>
      <div className="text-muted-foreground/60 shrink-0">v{value.version}</div>
    </li>
  );
}

export default ScopeDetailView;
