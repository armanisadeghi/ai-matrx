import React, { useEffect, useState } from "react";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { Input } from "@ai-matrx/design-system";
import { Search } from "lucide-react";
import type { DatabasePermission } from "./types";
import { stringUrlCodec, useUrlState } from "@ai-matrx/kit/url-state";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

interface PermissionsListProps {
  permissions?: DatabasePermission[];
  loading?: boolean;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  error?: string | null;
}

const PRIVILEGES = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
] as const;

const columns: MatrxColumnDef<DatabasePermission>[] = [
  {
    id: "object_name",
    accessorKey: "object_name",
    header: "Object name",
    width: 240,
  },
  {
    id: "object_type",
    accessorKey: "object_type",
    header: "Type",
    filter: "select",
    width: 110,
  },
  {
    id: "role",
    accessorKey: "role",
    header: "Role",
    filter: "select",
    width: 150,
  },
  ...PRIVILEGES.map((privilege): MatrxColumnDef<DatabasePermission> => ({
    id: privilege.toLowerCase(),
    header: privilege,
    accessorFn: (row) => row.privileges.includes(privilege),
    filter: "boolean",
    width: 100,
  })),
];

/** A permission row has no UUID; the catalog identifies it by object, type and role. */
export function permissionRowId(row: DatabasePermission): string {
  return JSON.stringify([row.object_name, row.object_type, row.role]);
}

const PermissionsList = ({
  permissions = [],
  loading = false,
  isRefreshing = false,
  onRefresh,
  error,
}: PermissionsListProps) => {
  const [, setFilterUrl] = useUrlState("permissionQ", stringUrlCodec());
  const [, setTypeUrl] = useUrlState("permissionType", stringUrlCodec("all"));
  const [filter, setFilter] = useState("");
  const [selectedType, setSelectedType] = useState("all");

  // The shared URL writer can complete a Next navigation after this input's
  // next keystroke. Keep the editor immediately responsive and restore state
  // from the URL on first mount and browser Back/Forward.
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      setFilter(params.get("permissionQ") ?? "");
      setSelectedType(params.get("permissionType") ?? "all");
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  // Retain the URL-backed object/role search and type scope. The shared table
  // owns sorting, column filters, density, pagination and the standard toolbar.
  const matching = permissions.filter((row) => {
    const query = filter.trim().toLowerCase();
    return (
      (selectedType === "all" || row.object_type === selectedType) &&
      (!query ||
        row.object_name.toLowerCase().includes(query) ||
        row.role.toLowerCase().includes(query))
    );
  });
  const types = [...new Set(permissions.map((row) => row.object_type))].sort();

  return (
    <div className="min-w-0" data-surface-value="database_permissions">
      {error && (
        <ErrorNotice size="inline" className="mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm" message={error} />
      )}
      <MatrxDataTable
        tableId="database-admin-permissions"
        data={matching}
        columns={columns}
        getRowId={permissionRowId}
        isLoading={loading}
        isFetching={isRefreshing}
        viewTabs={false}
        pageSize={25}
        detail={{ enabled: false }}
        emptyState={{
          title: error
            ? "Permissions could not be loaded"
            : "No permissions match",
        }}
        coverage={
          error
            ? undefined
            : {
                loaded: permissions.length,
                // The RPC returns the complete public-catalog query. Fewer than the
                // PostgREST default 1,000-row response ceiling is a complete answer;
                // at the ceiling the true total is unknown until source paging exists.
                ...(permissions.length < 1000
                  ? { total: permissions.length }
                  : { cap: 1000 }),
                noun: "permission",
                answeredBy: "client",
              }
        }
        toolbar={{
          title: "Permissions overview",
          search: false,
          customSearch: (
            <div className="relative w-64 max-w-full">
              <Search
                aria-hidden="true"
                className="absolute left-2 top-2 h-4 w-4 text-muted-foreground"
              />
              <Input
                aria-label="Search permission object or role"
                placeholder="Object or role…"
                value={filter}
                onChange={(event) => {
                  setFilter(event.target.value);
                  setFilterUrl(event.target.value, { history: "replace" });
                }}
                className="h-8 pl-8"
              />
            </div>
          ),
          facets: [
            {
              type: "custom",
              id: "object-type",
              filter: {
                active: selectedType !== "all",
                onReset: () => {
                  setSelectedType("all");
                  setTypeUrl("all");
                },
              },
              render: () => (
                <select
                  aria-label="Permission object type"
                  value={selectedType}
                  onChange={(event) => {
                    setSelectedType(event.target.value);
                    setTypeUrl(event.target.value);
                  }}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="all">All object types</option>
                  {types.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              ),
            },
          ],
          ...(onRefresh ? { refresh: { onRefresh } } : {}),
        }}
      />
    </div>
  );
};

export default PermissionsList;
