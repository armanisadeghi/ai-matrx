// features/scopes/components/management/ScopesSettingsPanel.tsx
//
// /scopes/settings — diagnostic + admin-flavoured settings for the scope
// system. Reads the canonical tree slice metadata (fetched-at, status) and
// exposes a manual refresh. Does NOT expose privacy or RBAC controls in
// Phase 4 — those live on the per-org settings route until the
// chokepoint-backed admin RPCs ship.

"use client";

import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useScopeTree } from "@/features/scopes/hooks/useScopeTree";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectTreeFetchedAt } from "@/features/scopes/redux/selectors/tree";
import { useActiveContext } from "@/features/scopes/hooks/useActiveContext";

export function ScopesSettingsPanel() {
  const { organizations, status, error, refresh } = useScopeTree();
  const treeFetchedAt = useAppSelector(selectTreeFetchedAt);
  const active = useActiveContext();
  const activeOrg = organizations.find((o) => o.id === active.organizationId);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Scope settings</h1>
        <p className="text-xs text-muted-foreground">
          Diagnostics and entry points for managing scopes at the org level.
        </p>
      </header>

      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Scope tree</div>
            <div className="text-[11px] text-muted-foreground">
              The canonical scope tree is fetched once at boot and cached for
              the session. Use Refresh if you've changed scopes in another tab
              or via SQL.
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            className="shrink-0"
          >
            <RefreshCw className="h-3 w-3 mr-1.5" />
            Refresh
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <Stat
            label="Status"
            value={
              <Badge variant="outline" className="text-[10px] capitalize">
                {status}
              </Badge>
            }
          />
          <Stat label="Organizations" value={String(organizations.length)} />
          <Stat
            label="Fetched at"
            value={
              treeFetchedAt ? new Date(treeFetchedAt).toLocaleTimeString() : "—"
            }
          />
          <Stat label="Error" value={error ?? "—"} />
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">Per-org settings</div>
        <p className="text-[11px] text-muted-foreground">
          Privacy, sharing rules, and admin-level controls live on each org's
          settings page. Pick an organization to jump in.
        </p>
        <div className="space-y-1">
          {organizations.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">
              No organizations.
            </div>
          ) : (
            organizations.map((o) => (
              <Link
                key={o.id}
                href={`/organizations/${o.slug ?? o.id}/settings/scopes`}
                className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-accent/40 text-xs"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{o.name}</span>
                  {o.id === active.organizationId && (
                    <Badge variant="outline" className="text-[9px]">
                      Active
                    </Badge>
                  )}
                </span>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </Link>
            ))
          )}
        </div>
      </Card>

      {activeOrg && (
        <Card className="p-4 space-y-3">
          <div className="text-sm font-medium">Current organization</div>
          <p className="text-[11px] text-muted-foreground">
            You're currently scoped to <strong>{activeOrg.name}</strong>. The
            hub and manager default to this org.
          </p>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
        {label}
      </div>
      <div className="font-medium mt-0.5 truncate">{value}</div>
    </div>
  );
}

export default ScopesSettingsPanel;
