// features/scopes/components/management/ScopesManager.tsx
//
// /scopes/manage — full scope-type / scope manager for a single org. Reads
// the canonical tree, lists scope types with their scopes, and offers
// quick-links into per-scope detail and into the org's legacy management
// route (Phase 4 leans on the legacy CRUD until Phase 5 ships the new
// chokepoint-backed editor surfaces).

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Lock,
  Plus,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { useActiveContext } from "@/features/scopes/hooks/useActiveContext";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import { cn } from "@/utils/cn";

interface ScopesManagerProps {
  /** When set, pins the manager to a single org (no picker). */
  orgIdOverride?: string;
}

export function ScopesManager({ orgIdOverride }: ScopesManagerProps) {
  const { organizations, status, error, refresh } = useScopeTree();
  const active = useActiveContext();
  const router = useRouter();
  const params = useSearchParams();

  const queryOrgId = orgIdOverride ?? params.get("org");
  const orgId =
    queryOrgId ?? active.organizationId ?? organizations[0]?.id ?? null;
  const org = useMemo(
    () => organizations.find((o) => o.id === orgId) ?? null,
    [organizations, orgId],
  );

  // React 19 canonical "reset state on input change" pattern — track the
  // previous org id in state and reset the collapsed map during render when
  // org changes (https://react.dev/reference/react/useState#storing-information-from-previous-renders).
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [lastOrgId, setLastOrgId] = useState<string | null>(null);
  if (org && lastOrgId !== org.id) {
    setLastOrgId(org.id);
    setCollapsed({});
  }

  if (status === "loading" && organizations.length === 0) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="p-4">
              <div className="h-5 w-32 bg-muted animate-pulse rounded mb-2" />
              <div className="h-3 w-40 bg-muted animate-pulse rounded" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <Card className="p-4 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
        <div>
          <div className="font-medium text-sm">
            Couldn't load the scope tree
          </div>
          <div className="text-xs text-muted-foreground">{error}</div>
          <button
            onClick={() => void refresh()}
            className="mt-1 text-xs text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      </Card>
    );
  }

  if (!org) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        No organization to manage. Visit the{" "}
        <Link href="/scopes" className="text-primary hover:underline">
          hub
        </Link>{" "}
        to pick one.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{org.name}</h1>
          <p className="text-xs text-muted-foreground">
            Define how this org thinks about its work. Each scope type is a
            dimension (e.g. Client, Department); each scope under a type is a
            specific instance.
          </p>
        </div>
        {!orgIdOverride && organizations.length > 1 && (
          <select
            value={org.id}
            onChange={(e) => {
              const next = e.target.value;
              router.replace(`/scopes/manage?org=${next}`);
            }}
            className="bg-card border border-border rounded-md text-xs px-2 py-1 max-w-[200px]"
          >
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )}
      </header>

      {org.scope_types.length === 0 ? (
        <Card className="p-6 text-center">
          <div className="font-medium">No scope types yet</div>
          <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
            Scope types are the dimensions your team works in — Client,
            Department, Repo, Patient, anything. Define one to get started.
          </p>
          <NewScopeTypeButton orgId={org.id} orgSlugOrId={org.slug ?? org.id} />
        </Card>
      ) : (
        <div className="space-y-3">
          {org.scope_types.map((type) => {
            const isCollapsed = collapsed[type.id] ?? false;
            return (
              <Card key={type.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((prev) => ({
                      ...prev,
                      [type.id]: !isCollapsed,
                    }))
                  }
                  className="w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-accent/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isCollapsed ? (
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <DynamicIcon
                      name={type.icon}
                      color={type.color}
                      className="h-4 w-4"
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-sm">
                        {type.label_plural}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Singular: {type.label_singular} ·{" "}
                        {type.default_variable_keys.length} default key
                        {type.default_variable_keys.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px]"
                    style={{ borderColor: type.color, color: type.color }}
                  >
                    {type.scopes.length}
                  </Badge>
                </button>
                {!isCollapsed && (
                  <div className="border-t border-border/40">
                    {type.scopes.length === 0 ? (
                      <div className="px-4 py-3 text-xs text-muted-foreground italic">
                        No scopes of this type yet.
                      </div>
                    ) : (
                      <ul className="divide-y divide-border/40">
                        {type.scopes.map((scope) => (
                          <li key={scope.id}>
                            <Link
                              href={`/scopes/${scope.id}`}
                              className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-accent/30 transition-colors"
                            >
                              <div className="min-w-0">
                                <div className="text-sm truncate">
                                  {scope.name}
                                </div>
                                {scope.description && (
                                  <div className="text-[11px] text-muted-foreground truncate">
                                    {scope.description}
                                  </div>
                                )}
                              </div>
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="px-3 py-2 bg-muted/30 border-t border-border/40">
                      <Link
                        href={`/organizations/${org.slug ?? org.id}/scopes/${type.id}`}
                        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Edit type or add scope (legacy editor)
                      </Link>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}

          <NewScopeTypeButton orgId={org.id} orgSlugOrId={org.slug ?? org.id} />
        </div>
      )}
    </div>
  );
}

function NewScopeTypeButton({
  orgId: _orgId,
  orgSlugOrId,
}: {
  orgId: string;
  orgSlugOrId: string;
}) {
  return (
    <Link
      href={`/organizations/${orgSlugOrId}/scopes`}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs rounded-md border border-dashed border-border/60",
        "px-3 py-2 mt-3 text-muted-foreground hover:text-foreground hover:border-border transition-colors",
      )}
    >
      <Plus className="h-3.5 w-3.5" />
      Add a new scope type
      <Lock className="h-2.5 w-2.5 ml-1" />
      <span className="text-[10px]">opens legacy editor</span>
    </Link>
  );
}

export default ScopesManager;
