// features/scopes/components/management/ScopesHub.tsx
//
// The /scopes landing page. Renders a per-org summary: org name, scope-type
// chips (with counts), and quick-links into the Manage, Templates, and
// per-scope detail routes. Reads exclusively through `useScopeTree`.

"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Building,
  FileText,
  FolderKanban,
  Settings as SettingsIcon,
  Zap
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { useActiveContext } from "@/features/scopes/hooks/useActiveContext";
import { DynamicIcon } from "@/components/official/icons/IconResolver";
import { cn } from "@/utils/cn";

export function ScopesHub() {
  const { organizations, status, error, refresh } = useScopeTree();
  const active = useActiveContext();

  const orderedOrgs = useMemo(() => {
    const list = [...organizations];
    list.sort((a, b) => {
      if (a.id === active.organizationId) return -1;
      if (b.id === active.organizationId) return 1;
      if (a.is_personal !== b.is_personal) return a.is_personal ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return list;
  }, [organizations, active.organizationId]);

  if (status === "loading" && organizations.length === 0) {
    return <HubSkeleton />;
  }

  if (status === "error") {
    return (
      <Card className="p-6 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="space-y-2">
          <div className="font-medium">Couldn't load your scope tree</div>
          <div className="text-sm text-muted-foreground">
            {error ?? "Unknown error"}
          </div>
          <button
            onClick={() => void refresh()}
            className="text-xs text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      </Card>
    );
  }

  if (organizations.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Building className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <div className="font-medium">No organizations yet</div>
        <p className="text-sm text-muted-foreground mt-1">
          Create an organization to start defining scopes for your work.
        </p>
        <Link
          href="/organizations"
          className="inline-flex items-center gap-1.5 mt-4 text-xs text-primary hover:underline"
        >
          Go to Organizations
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Scopes</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Scopes are the dimensions your work happens in — clients, products,
            teams, repos, anything. Pick an organization to manage its scope
            types and the data they carry into every agent run.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <QuickLink href="/scopes/templates" icon={Zap}>
            Templates
          </QuickLink>
          <QuickLink href="/scopes/settings" icon={SettingsIcon}>
            Settings
          </QuickLink>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {orderedOrgs.map((org) => {
          const scopeCount = org.scope_types.reduce(
            (n, t) => n + t.scopes.length,
            0,
          );
          const isActive = org.id === active.organizationId;
          return (
            <Card
              key={org.id}
              className={cn(
                "p-4 space-y-3 transition-colors",
                isActive && "ring-1 ring-primary/40 bg-primary/5",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <Building className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{org.name}</div>
                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <span className="capitalize">{org.role}</span>
                      <span>·</span>
                      <span>
                        {org.scope_types.length} type
                        {org.scope_types.length === 1 ? "" : "s"}, {scopeCount}{" "}
                        scope{scopeCount === 1 ? "" : "s"}
                      </span>
                      <span>·</span>
                      <span>
                        {org.projects.length} project
                        {org.projects.length === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>
                </div>
                {isActive && (
                  <Badge variant="outline" className="text-[10px]">
                    Active
                  </Badge>
                )}
              </div>

              {org.scope_types.length === 0 ? (
                <div className="text-[11px] text-muted-foreground italic">
                  No scope types defined yet.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {org.scope_types.map((t) => (
                    <Badge
                      key={t.id}
                      variant="outline"
                      className="text-[10px] gap-1 px-1.5 py-0.5"
                      style={{ borderColor: t.color, color: t.color }}
                    >
                      <DynamicIcon name={t.icon} className="h-2.5 w-2.5" />
                      <span>{t.label_plural}</span>
                      <span className="text-muted-foreground">
                        · {t.scopes.length}
                      </span>
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2 border-t border-border/40">
                <Link
                  href={`/scopes/manage?org=${org.id}`}
                  className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                >
                  <FolderKanban className="h-3 w-3" />
                  Manage
                </Link>
                <Link
                  href={`/organizations/${org.slug ?? org.id}/scopes`}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1"
                >
                  <FileText className="h-3 w-3" />
                  Org view (legacy)
                </Link>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md px-2 py-1 transition-colors"
    >
      <Icon className="h-3 w-3" />
      {children}
    </Link>
  );
}

function HubSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-8 w-32 bg-muted animate-pulse rounded" />
        <div className="h-4 w-96 bg-muted animate-pulse rounded" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="p-4 space-y-3">
            <div className="h-4 w-32 bg-muted animate-pulse rounded" />
            <div className="h-3 w-48 bg-muted animate-pulse rounded" />
            <div className="flex gap-1">
              <div className="h-5 w-16 bg-muted animate-pulse rounded" />
              <div className="h-5 w-20 bg-muted animate-pulse rounded" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default ScopesHub;
