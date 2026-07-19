"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Trash2, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useActiveOrganizationPicker } from "@/features/organizations/hooks/useActiveOrganizationPicker";
import { useUserConnections } from "@/features/messaging/hooks/useUserConnections";
import {
  formatCompactDate,
  QueryError,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  grantSitePermission,
  listSitePermissions,
  revokeSitePermission,
  type SiteGrantLevel,
  type SiteGrantTarget,
  type SitePermissionGrant,
} from "@/features/marketing/data/access-service";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function SiteAccessWorkspace() {
  const { site } = useMarketingSite();
  const organizations = useActiveOrganizationPicker();
  const users = useUserConnections();
  const queryClient = useQueryClient();
  const queryKey = ["marketing", "site", site.id, "permissions"] as const;
  const [granteeId, setGranteeId] = useState("");
  const [granteeType, setGranteeType] =
    useState<SiteGrantTarget>("organization");
  const [level, setLevel] = useState<SiteGrantLevel>("viewer");
  const [expiresAt, setExpiresAt] = useState("");
  const [quickTarget, setQuickTarget] = useState("manual");
  const [revokeTarget, setRevokeTarget] = useState<SitePermissionGrant | null>(
    null,
  );

  const permissions = useQuery({
    queryKey,
    queryFn: () => listSitePermissions(site.id),
  });
  const grant = useMutation({
    mutationFn: grantSitePermission,
    onSuccess: () => {
      setGranteeId("");
      setQuickTarget("manual");
      setExpiresAt("");
      void queryClient.invalidateQueries({ queryKey });
      toast.success("Site access granted.");
    },
    onError: (error) => toast.error(error.message),
  });
  const revoke = useMutation({
    mutationFn: revokeSitePermission,
    onSuccess: () => {
      setRevokeTarget(null);
      void queryClient.invalidateQueries({ queryKey });
      toast.success("Site access revoked.");
    },
    onError: (error) => toast.error(error.message),
  });

  const columns: MatrxColumnDef<SitePermissionGrant>[] = [
    {
      id: "grantee_type",
      accessorKey: "grantee_type",
      header: "Target",
      filter: "select",
      filterOptions: [
        { value: "organization", label: "Organization" },
        { value: "user", label: "User" },
      ],
      cell: (row) => (
        <span className="text-xs capitalize">{row.grantee_type}</span>
      ),
    },
    {
      id: "grantee_id",
      accessorKey: "grantee_id",
      header: "Grantee ID",
      cellKind: "uuid",
    },
    {
      id: "permission_level",
      accessorKey: "permission_level",
      header: "Access",
      filter: "select",
      filterOptions: [
        { value: "viewer", label: "Viewer" },
        { value: "editor", label: "Editor" },
        { value: "admin", label: "Admin" },
      ],
      cell: (row) => <StatusBadge value={row.permission_level} />,
    },
    {
      id: "expires_at",
      accessorKey: "expires_at",
      header: "Expires",
      filter: false,
      cell: (row) => (
        <span className="whitespace-nowrap text-xs">
          {formatCompactDate(row.expires_at)}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      sortable: false,
      filter: false,
      align: "right",
      cell: (row) => (
        <Button
          size="icon"
          variant="ghost"
          aria-label="Revoke access"
          onClick={(event) => {
            event.stopPropagation();
            setRevokeTarget(row);
          }}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      ),
    },
  ];

  const validId = UUID_PATTERN.test(granteeId.trim());

  return (
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-hidden bg-textured p-3 sm:p-4">
      <section className="rounded-lg border border-border bg-card p-3">
        <div className="mb-3 flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <h1 className="text-sm font-semibold">Site access</h1>
            <p className="text-xs text-muted-foreground">
              One grant shares {site.name} and every page, crawl, snapshot,
              finding, and artifact beneath it.
            </p>
          </div>
        </div>
        <div className="grid gap-2 xl:grid-cols-[14rem_9rem_minmax(18rem,1fr)_9rem_13rem_auto]">
          <Select
            value={quickTarget}
            onValueChange={(value) => {
              setQuickTarget(value);
              if (value === "manual") {
                setGranteeId("");
                return;
              }
              const separator = value.indexOf(":");
              setGranteeType(value.slice(0, separator) as SiteGrantTarget);
              setGranteeId(value.slice(separator + 1));
            }}
          >
            <SelectTrigger size="sm" aria-label="Known organization or user">
              <SelectValue placeholder="Choose known target" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">Enter UUID manually</SelectItem>
              {organizations.organizations.map((organization) => (
                <SelectItem
                  key={`organization:${organization.id}`}
                  value={`organization:${organization.id}`}
                >
                  Org · {organization.name}
                </SelectItem>
              ))}
              {users.connections.map((user) => (
                <SelectItem
                  key={`user:${user.user_id}`}
                  value={`user:${user.user_id}`}
                >
                  User · {user.display_name || user.email || user.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={granteeType}
            onValueChange={(value) => setGranteeType(value as SiteGrantTarget)}
          >
            <SelectTrigger size="sm" aria-label="Grantee type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="organization">Organization</SelectItem>
              <SelectItem value="user">User</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="h-7 font-mono text-xs"
            value={granteeId}
            onChange={(event) => setGranteeId(event.target.value)}
            placeholder={`${granteeType} UUID`}
            aria-label="Grantee UUID"
          />
          <Select
            value={level}
            onValueChange={(value) => setLevel(value as SiteGrantLevel)}
          >
            <SelectTrigger size="sm" aria-label="Permission level">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="h-7 text-xs"
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            aria-label="Optional expiration"
          />
          <Button
            size="sm"
            className="h-7 gap-1.5"
            disabled={!validId || grant.isPending}
            onClick={() =>
              grant.mutate({
                siteId: site.id,
                granteeId: granteeId.trim(),
                granteeType,
                level,
                expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
              })
            }
          >
            <UserRoundPlus className="h-3.5 w-3.5" />
            Grant
          </Button>
        </div>
      </section>

      <div className="min-h-0 flex-1">
        {permissions.isError ? (
          <QueryError
            error={permissions.error}
            onRetry={() => void permissions.refetch()}
          />
        ) : (
          <MatrxDataTable<SitePermissionGrant>
            data={permissions.data ?? []}
            columns={columns}
            getRowId={(row) => `${row.grantee_type}:${row.grantee_id}`}
            isLoading={permissions.isLoading}
            toolbar={{ searchPlaceholder: "Search site grants…" }}
            emptyState={{
              icon: <ShieldCheck className="h-8 w-8 text-muted-foreground" />,
              title: "No delegated access",
              description:
                "Only the owning organization currently controls this site.",
            }}
          />
        )}
      </div>

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => {
          if (!open && !revoke.isPending) setRevokeTarget(null);
        }}
        title="Revoke site access?"
        description="This immediately removes access to the site and every component beneath it."
        confirmLabel="Revoke access"
        variant="destructive"
        busy={revoke.isPending}
        onConfirm={() => {
          if (!revokeTarget) return;
          revoke.mutate({
            siteId: site.id,
            granteeId: revokeTarget.grantee_id,
            granteeType: revokeTarget.grantee_type as SiteGrantTarget,
          });
        }}
      />
    </main>
  );
}
