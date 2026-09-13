"use client";

import { ExternalLink, PackageCheck, PackageOpen } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_APPLICATIONS_SURFACE_NAME,
  createAdminApplicationsScope,
} from "@/features/surfaces/manifests/admin-applications.manifest";
import type { NpmPackageCatalogRow } from "../npmRegistry";

interface PackagesCatalogClientProps {
  rows: NpmPackageCatalogRow[];
  error: string | null;
}

const columns: MatrxColumnDef<NpmPackageCatalogRow>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Package",
    cell: (row) => (
      <a
        href={row.npmUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 font-mono text-sm font-medium text-primary hover:underline"
      >
        {row.name}
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    ),
    width: 250,
  },
  {
    id: "lifecycle",
    accessorKey: "lifecycle",
    header: "Registry status",
    filter: "select",
    cell: (row) =>
      row.lifecycle === "reserved" ? (
        <Badge variant="outline" className="gap-1">
          <PackageOpen className="h-3 w-3" /> Reserved
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
        >
          <PackageCheck className="h-3 w-3" /> Published
        </Badge>
      ),
    width: 140,
  },
  {
    id: "version",
    accessorKey: "version",
    header: "Latest",
    cell: (row) => <code className="text-xs">{row.version}</code>,
    width: 100,
  },
  {
    id: "deprecated",
    accessorKey: "deprecated",
    header: "Deprecated",
    filter: "boolean",
    cell: (row) =>
      row.deprecated ? (
        <span className="text-xs text-destructive" title={row.deprecationMessage ?? undefined}>
          Yes
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">No</span>
      ),
    width: 105,
  },
  {
    id: "publishedAt",
    accessorKey: "publishedAt",
    header: "Latest publish",
    cell: (row) =>
      row.publishedAt ? (
        <time dateTime={row.publishedAt} className="text-xs">
          {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
            new Date(row.publishedAt),
          )}
        </time>
      ) : (
        <span className="text-xs text-muted-foreground">Not reported</span>
      ),
    width: 130,
  },
  {
    id: "source",
    accessorFn: (row) => row.repositoryDirectory ?? "",
    header: "Registry-declared source",
    cell: (row) =>
      row.sourceUrl && row.repositoryDirectory ? (
        <a
          href={row.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
        >
          {row.repositoryDirectory}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      ) : row.lifecycle === "reserved" ? (
        <span className="text-xs text-muted-foreground">Reserved name; no live source asserted</span>
      ) : (
        <span className="text-xs text-amber-700 dark:text-amber-400">Not declared on npm</span>
      ),
    width: 330,
  },
];

export function PackagesCatalogClient({ rows, error }: PackagesCatalogClientProps) {
  const publishedCount = rows.filter((row) => row.lifecycle === "published").length;
  const reservedCount = rows.filter((row) => row.lifecycle === "reserved").length;
  const deprecatedCount = rows.filter((row) => row.deprecated).length;

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_APPLICATIONS_SURFACE_NAME}
      getScope={() =>
        createAdminApplicationsScope({
          active_tab: "packages",
          npm_package_load_state: error ? "error" : "ready",
          ...(error
            ? { npm_package_error: error }
            : {
                npm_package_count: rows.length,
                npm_package_published_count: publishedCount,
                npm_package_reserved_count: reservedCount,
                npm_package_deprecated_count: deprecatedCount,
                npm_packages_summary: rows.map((row) => ({
                  name: row.name,
                  version: row.version,
                  lifecycle: row.lifecycle,
                  deprecated: row.deprecated,
                  registry_declared_source: row.repositoryDirectory,
                })),
              }),
        })
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3 p-4">
        <div>
          <h1 className="text-base font-semibold">npm packages</h1>
          <p className="text-xs text-muted-foreground">
            Live public registry inventory for the exact <code>@ai-matrx/</code> scope.
            Repository paths are declarations from each package&apos;s published metadata.
          </p>
        </div>

        {error ? (
          <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            The npm registry inventory could not be loaded. No cached or invented package status is being shown. {error}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Exact scope", rows.length],
                ["Published", publishedCount],
                ["Reserved", reservedCount],
                ["Deprecated", deprecatedCount],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-border bg-card px-3 py-2">
                  <div className="text-lg font-semibold">{value}</div>
                  <div className="text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
            <div className="min-h-0 flex-1">
              <MatrxDataTable
                urlState={{ id: "npm-packages" }}
                data={rows}
                columns={columns}
                getRowId={(row) => row.name}
                pageSize={50}
                toolbar={{
                  search: true,
                  searchPlaceholder: "Search package, version, or source…",
                }}
                emptyState={{
                  title: "No @ai-matrx packages found",
                  description: "The live npm registry returned no exact-scope packages.",
                }}
                detail={{ enabled: false }}
              />
            </div>
          </>
        )}
      </div>
    </SurfaceRuntimeProvider>
  );
}
