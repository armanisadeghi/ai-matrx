"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { safeVaultLoginUrl } from "@/features/secrets/utils";
import {
  listProviderAccounts,
  type ProviderAccountRegistryRow,
} from "./service";

function label(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "needs_verification") return "outline";
  if (status === "blocked") return "destructive";
  return "secondary";
}

const columns: MatrxColumnDef<ProviderAccountRegistryRow>[] = [
  {
    id: "displayName",
    accessorKey: "displayName",
    header: "Provider account",
    label: "Provider account",
    sortValue: (row) => row.displayName,
    cell: (row) => (
      <div>
        <div className="font-medium">{row.displayName}</div>
        <div className="text-xs text-muted-foreground">
          {row.providerKey}
          {row.workspaceName ? ` · ${row.workspaceName}` : ""}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Login: {row.loginIdentity ?? "Unknown — verification required"}
        </div>
      </div>
    ),
  },
  {
    id: "environmentKey",
    accessorKey: "environmentKey",
    header: "Environment",
    label: "Environment",
    sortValue: (row) => row.environmentKey,
    cell: (row) => label(row.environmentKey),
  },
  {
    id: "accountKind",
    accessorKey: "accountKind",
    header: "Purpose",
    label: "Purpose",
    sortValue: (row) => row.accountKind,
    cell: (row) => label(row.accountKind),
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    label: "Status",
    sortValue: (row) => row.status,
    cell: (row) => (
      <Badge variant={statusVariant(row.status)}>{label(row.status)}</Badge>
    ),
  },
  {
    id: "vault",
    header: "Organization Vault",
    label: "Organization Vault",
    sortValue: (row) => row.credentialCount,
    cell: (row) => (
      <span className="inline-flex items-center gap-1.5">
        {row.primaryCredentialPresent ? (
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
        ) : (
          <ShieldAlert className="h-4 w-4 text-amber-600" />
        )}
        {row.primaryCredentialPresent
          ? `${row.credentialCount} linked item${row.credentialCount === 1 ? "" : "s"}`
          : "Needs organization credential"}
      </span>
    ),
  },
  {
    id: "lastVerifiedAt",
    accessorKey: "lastVerifiedAt",
    header: "Verified",
    label: "Verified",
    sortValue: (row) => row.lastVerifiedAt ?? "",
    cell: (row) => (
      <span className="text-muted-foreground">
        {row.lastVerifiedAt
          ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
              new Date(row.lastVerifiedAt),
            )
          : "Not verified"}
      </span>
    ),
  },
  {
    id: "open",
    header: "Open",
    label: "Open",
    filter: false,
    cell: (row) => {
      const href = row.loginUrl ? safeVaultLoginUrl(row.loginUrl) : null;
      return href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={`Open ${row.displayName}`}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      ) : null;
    },
  },
];

export function ProviderAccountsSection({
  organizationId,
}: {
  organizationId: string;
}) {
  const [rows, setRows] = useState<ProviderAccountRegistryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listProviderAccounts(organizationId)
      .then((nextRows) => {
        if (!cancelled) setRows(nextRows);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load provider accounts.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, reloadKey]);

  const refresh = () => {
    setLoading(true);
    setError(null);
    setReloadKey((key) => key + 1);
  };

  if (loading) {
    return <MatrxMiniLoader />;
  }

  if (error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
        <p className="text-sm text-destructive">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={refresh}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <MatrxDataTable<ProviderAccountRegistryRow>
      data={rows}
      columns={columns}
      getRowId={(row) => row.id}
      defaultSort={{ id: "displayName", direction: "asc" }}
      emptyState={{
        title:
          "No provider-native accounts are registered for this organization.",
      }}
      toolbar={{
        search: true,
        refresh: {
          onRefresh: refresh,
          label: "Refresh provider accounts",
        },
      }}
    />
  );
}
