"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, UserRound } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { AdminUserRef } from "@/features/admin/users/components/AdminUserRef";
import {
  AdminUserSearchResponseSchema,
  type UserSearchCandidate,
} from "@/features/user-search/types";
import { emitUserSearchEvent } from "@/features/user-search/callbacks";

export interface UserSearchWindowProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
  callbackGroupId: string;
  title: string;
  initialQuery: string;
  directory: "admin" | "provided";
  candidates: UserSearchCandidate[];
  excludeUserIds: string[];
}

function mapAdminUser(
  row: (typeof AdminUserSearchResponseSchema)["_output"]["users"][number],
): UserSearchCandidate {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name ?? row.full_name,
    avatarUrl: row.avatar_url,
    phone: row.phone,
    adminLevel: row.admin_level,
    organizations: row.organizations.map((organization) => organization.name),
    source: "Account directory",
    createdAt: row.created_at,
    lastSignInAt: row.last_sign_in_at,
  };
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString();
}

export function UserSearchWindow(props: UserSearchWindowProps) {
  if (!props.isOpen) return null;
  return <UserSearchWindowInner {...props} />;
}

function UserSearchWindowInner({
  onClose,
  instanceId,
  callbackGroupId,
  title,
  initialQuery,
  directory,
  candidates,
  excludeUserIds,
}: UserSearchWindowProps) {
  const [rows, setRows] = useState<UserSearchCandidate[]>(candidates);
  const [loading, setLoading] = useState(directory === "admin");
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialQuery);

  useEffect(() => {
    if (directory !== "admin") return;
    let cancelled = false;
    fetch("/api/admin/users", { cache: "no-store" })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : "Failed to load the user directory";
          throw new Error(message);
        }
        const parsed = AdminUserSearchResponseSchema.safeParse(payload);
        if (!parsed.success) {
          throw new Error("The user directory returned an invalid response");
        }
        if (!cancelled) setRows(parsed.data.users.map(mapAdminUser));
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(
            reason instanceof Error ? reason.message : "Failed to load users",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [directory]);

  const excluded = new Set(excludeUserIds);
  const visibleRows = rows.filter((row) => !excluded.has(row.id));

  const columns: MatrxColumnDef<UserSearchCandidate>[] = [
    {
      id: "user",
      header: "User",
      accessorFn: (row) => row.displayName ?? row.email ?? row.id,
      width: 230,
      cell: (row) =>
        directory === "admin" ? (
          <AdminUserRef
            userId={row.id}
            name={row.displayName}
            email={row.email}
          />
        ) : (
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">
              {row.displayName ?? row.email ?? "Unnamed user"}
            </div>
            {row.displayName && row.email ? (
              <div className="truncate text-xs text-muted-foreground">
                {row.email}
              </div>
            ) : null}
          </div>
        ),
    },
    {
      id: "email",
      header: "Email",
      accessorKey: "email",
      width: 220,
      cell: (row) => row.email ?? "—",
    },
    {
      id: "phone",
      header: "Phone",
      accessorKey: "phone",
      width: 140,
      cell: (row) => row.phone ?? "—",
      mobileHidden: true,
    },
    {
      id: "organizations",
      header: "Organizations",
      accessorFn: (row) => row.organizations.join(", "),
      width: 210,
      cell: (row) => row.organizations.join(", ") || "—",
      mobileHidden: true,
    },
    {
      id: "adminLevel",
      header: "Admin level",
      accessorKey: "adminLevel",
      filter: "select",
      width: 130,
      cell: (row) => row.adminLevel ?? "None",
      mobileHidden: true,
    },
    {
      id: "source",
      header: "Source",
      accessorKey: "source",
      filter: "select",
      width: 130,
      cell: (row) => row.source ?? "—",
      mobileHidden: true,
    },
    {
      id: "lastSignInAt",
      header: "Last sign-in",
      accessorKey: "lastSignInAt",
      width: 130,
      cell: (row) => formatDate(row.lastSignInAt),
      mobileHidden: true,
    },
  ];

  const close = () => {
    emitUserSearchEvent(callbackGroupId, { type: "window-close", instanceId });
    onClose();
  };

  const select = (user: UserSearchCandidate) => {
    emitUserSearchEvent(callbackGroupId, {
      type: "selected",
      instanceId,
      user,
    });
    close();
  };

  return (
    <WindowPanel
      id={`user-search:${instanceId}`}
      overlayId="userSearchWindow"
      title={title}
      titleNode={
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <Search className="size-3.5 shrink-0 text-primary" />
          <span className="truncate">{title}</span>
        </span>
      }
      onClose={close}
      width={1040}
      height={680}
      minWidth={380}
      minHeight={420}
      position="center"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-3"
    >
      {error ? (
        <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={visibleRows}
          columns={columns}
          getRowId={(row) => row.id}
          searchText={(row) =>
            [
              row.id,
              row.email,
              row.displayName,
              row.phone,
              row.adminLevel,
              row.source,
              ...row.organizations,
            ]
              .filter(Boolean)
              .join(" ")
          }
          isLoading={loading}
          pageSize={25}
          pageSizeOptions={[10, 25, 50, 100]}
          toolbar={{
            search: true,
            searchPlaceholder:
              "Search name, email, phone, organization, or ID…",
            searchValue: search,
            onSearchChange: setSearch,
          }}
          emptyState={{
            icon: loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <UserRound className="h-5 w-5" />
            ),
            title: loading ? "Loading users" : "No matching users",
            description: loading
              ? "Reading the available user directory."
              : "Change the search or clear column filters.",
          }}
          rowActions={(row) => (
            <Button size="sm" onClick={() => select(row)}>
              Select
            </Button>
          )}
          mobile="scroll"
        />
      </div>
    </WindowPanel>
  );
}

export default UserSearchWindow;
