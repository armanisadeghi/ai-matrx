"use client";

// features/admin/shared-knowledge/components/StoresGrantsTab.tsx
//
// Every `kind='library'` store (server-loaded — including inactive /
// undiscoverable) with its live grant list. Reads via
// `rag.fn_list_data_store_grants` (super-admin OR store owner);
// publish/revoke via the extended DataStorePublishPanel — the ONE grant
// mutation path (`rag.library_grant_publish` / `_revoke`). Revoke here
// confirms through ConfirmDialog before firing.

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Building2,
  Globe,
  Layers,
  Loader2,
  Send,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  useDataStoreGrants,
  type DataStoreGrant,
} from "@/features/rag/hooks/useDataStoreGrants";
import { DataStorePublishPanel } from "@/features/rag/components/data-stores/DataStorePublishPanel";
import type { SharedKnowledgeDirectory } from "../types";

function grantLabel(g: DataStoreGrant): string {
  if (g.audience === "global") return "Everyone";
  if (g.audience === "industry") return g.industryName ?? "Industry";
  return g.organizationName ?? "Organization";
}

export function StoresGrantsTab({
  directory,
}: {
  directory: SharedKnowledgeDirectory;
}) {
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(
    directory.stores[0]?.id ?? null,
  );
  const [publishOpen, setPublishOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<DataStoreGrant | null>(
    null,
  );
  const [revokeBusy, setRevokeBusy] = useState(false);

  const selectedStore =
    directory.stores.find((s) => s.id === selectedStoreId) ?? null;
  const { grants, loading, error, revoke, refresh } =
    useDataStoreGrants(selectedStoreId);

  const orgOptions = useMemo(
    () =>
      directory.organizations
        .filter((o) => !o.is_personal)
        .map((o) => ({ id: o.id, name: o.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [directory.organizations],
  );

  const onRevoke = async () => {
    if (!revokeTarget) return;
    setRevokeBusy(true);
    const ok = await revoke(revokeTarget.id);
    setRevokeBusy(false);
    if (ok) {
      toast.success("Grant revoked");
      setRevokeTarget(null);
    } else {
      toast.error("Could not revoke grant");
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* Left: store list */}
      <div className="min-w-0">
        <div className="mb-2 text-sm font-medium text-foreground">
          Library stores ({directory.stores.length})
        </div>
        {directory.stores.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            No `kind=&#39;library&#39;` stores exist yet.
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {directory.stores.map((s) => (
              <li
                key={s.id}
                className={`cursor-pointer px-3 py-2 text-sm transition-colors hover:bg-muted/60 ${
                  s.id === selectedStoreId ? "bg-accent" : ""
                }`}
                onClick={() => setSelectedStoreId(s.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">
                    {s.name}
                  </span>
                  {!s.isActive ? (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      inactive
                    </Badge>
                  ) : null}
                  {!s.discoverable ? (
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      hidden from catalog
                    </Badge>
                  ) : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {s.organizationName ?? "No owning org"} · {s.memberCount}{" "}
                  member{s.memberCount === 1 ? "" : "s"}
                  {s.shortCode ? ` · ${s.shortCode}` : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Right: grants for the selected store */}
      <div className="min-w-0">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-medium text-foreground">
            {selectedStore ? `Grants — ${selectedStore.name}` : "Grants"}
          </div>
          <Button
            size="sm"
            onClick={() => setPublishOpen(true)}
            disabled={!selectedStore}
          >
            <Send className="mr-1.5 h-3.5 w-3.5" /> Publish
          </Button>
        </div>

        {!selectedStore ? (
          <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Select a store to see who it is published to.
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : loading && grants.length === 0 ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading grants…
          </div>
        ) : grants.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
            Not published to any audience yet.
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {grants.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2 text-foreground">
                  {g.audience === "global" ? (
                    <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : g.audience === "industry" ? (
                    <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate">{grantLabel(g)}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {g.audience}
                  </Badge>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-muted-foreground hover:text-destructive"
                  onClick={() => setRevokeTarget(g)}
                  aria-label={`Revoke ${grantLabel(g)}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedStore ? (
        <DataStorePublishPanel
          isOpen={publishOpen}
          onClose={() => setPublishOpen(false)}
          storeId={selectedStore.id}
          storeName={selectedStore.name}
          organizationOptions={orgOptions}
          onChanged={refresh}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
        title="Revoke grant?"
        description={
          revokeTarget && selectedStore
            ? `“${selectedStore.name}” will no longer be readable by ${grantLabel(revokeTarget)} (${revokeTarget.audience} audience). Access via other grants is unaffected.`
            : undefined
        }
        variant="destructive"
        confirmLabel="Revoke"
        busy={revokeBusy}
        onConfirm={onRevoke}
      />
    </div>
  );
}
