"use client";

/**
 * The scopes-context organization index (lane SCOPE-ADMIN-INDEX).
 *
 * `/administration/scopes-context/organizations/[orgId]` (lane SCOPE-ADMIN-2) is the
 * platform-admin scope console for ANY organization — but it was reachable only by typing
 * the URL, a dead end (no-dead-ends law). This is the door: every organization, its member
 * count, how many scope types it has, and when its scope tree last changed, searchable, each
 * row opening the console.
 *
 * The organization list itself comes from the SAME door `/administration/users/organizations`
 * already uses (`/api/admin/users/organizations` → `loadAdminOrganizationDirectory`) — never a
 * new fetch for something we already have. The scope-type count and last-change timestamp are
 * not carried by that directory, so this reads them per organization through
 * `scopesService.getOrganizationTreeForAdmin`, the same admin-lane door the console itself
 * uses to open a non-member organization's tree — this route sits under `/administration`, so
 * the admin lane is already open here.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Building2, Tags } from "lucide-react";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { AdminPageCapture } from "@/components/agent-copy/page-capture/AdminPageCapture";
import { scopesService } from "@/features/scopes/service/scopesService";
import type { AdminOrganizationDirectory, AdminOrganizationRow } from "@/features/admin/users/types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface OrganizationScopeSummary {
  /** `null` while loading, `undefined` if the fetch failed. */
  scopeTypeCount: number | null | undefined;
  lastScopeChange: string | null | undefined;
}

export type LoadDirectory = () => Promise<AdminOrganizationDirectory>;
export type LoadScopeSummary = (organizationId: string) => Promise<OrganizationScopeSummary>;

async function fetchDirectory(): Promise<AdminOrganizationDirectory> {
  const response = await fetch("/api/admin/users/organizations", { cache: "no-store" });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? "Failed to load organizations");
  return json.directory as AdminOrganizationDirectory;
}

/** The real door: the admin-lane organization tree, reduced to what this list shows. */
export async function loadOrganizationScopeSummary(organizationId: string): Promise<OrganizationScopeSummary> {
  const result = await scopesService.getOrganizationTreeForAdmin(organizationId);
  if (!result.ok || !result.data.organization) {
    return { scopeTypeCount: undefined, lastScopeChange: undefined };
  }
  const { scope_types } = result.data.organization;
  let last: string | null = null;
  for (const type of scope_types) {
    if (!last || type.updated_at > last) last = type.updated_at;
    for (const scope of type.scopes) {
      if (!last || scope.updated_at > last) last = scope.updated_at;
    }
  }
  return { scopeTypeCount: scope_types.length, lastScopeChange: last };
}

// A platform admin's organization list runs into the hundreds — firing one tree fetch per
// organization at once (676 in the live directory, verified 2026-09-25) opened that many
// concurrent Supabase connections at once and the browser started answering
// ERR_CONNECTION_CLOSED mid-walk. A small worker pool keeps this list's own load honest without
// needing a new aggregate RPC.
const SUMMARY_FETCH_CONCURRENCY = 6;

async function loadSummariesWithLimit(
  organizationIds: string[],
  loadScopeSummary: LoadScopeSummary,
  onEach: (id: string, summary: OrganizationScopeSummary) => void,
  isCancelled: () => boolean,
): Promise<void> {
  let next = 0;
  async function worker() {
    for (;;) {
      if (isCancelled()) return;
      const index = next++;
      if (index >= organizationIds.length) return;
      const id = organizationIds[index];
      const summary = await loadScopeSummary(id).catch(
        (): OrganizationScopeSummary => ({ scopeTypeCount: undefined, lastScopeChange: undefined }),
      );
      if (!isCancelled()) onEach(id, summary);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SUMMARY_FETCH_CONCURRENCY, organizationIds.length) }, () => worker()),
  );
}

function formatWhen(iso: string | null | undefined): string {
  if (iso === undefined) return "—";
  if (iso === null) return "No scopes yet";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ScopesContextOrganizationsIndex({
  loadDirectory = fetchDirectory,
  loadScopeSummary = loadOrganizationScopeSummary,
}: {
  loadDirectory?: LoadDirectory;
  loadScopeSummary?: LoadScopeSummary;
}) {
  const [organizations, setOrganizations] = useState<AdminOrganizationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, OrganizationScopeSummary>>({});
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const directory = await loadDirectory();
        if (cancelled) return;
        const rows = [...directory.organizations].sort((a, b) => a.name.localeCompare(b.name));
        setOrganizations(rows);
        void loadSummariesWithLimit(
          rows.map((org) => org.id),
          loadScopeSummary,
          (id, summary) => setSummaries((prev) => ({ ...prev, [id]: summary })),
          () => cancelled,
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load organizations");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadDirectory, loadScopeSummary]);

  const columns = useMemo(
    (): MatrxColumnDef<AdminOrganizationRow>[] => [
      {
        id: "name",
        header: "Organization",
        accessorKey: "name",
        width: 320,
        cell: (org) => (
          <Link
            href={`/administration/scopes-context/organizations/${org.id}`}
            className="flex items-center gap-2 font-medium text-foreground hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
            {org.name}
            {org.archived_at ? (
              <span className="text-xs font-normal text-muted-foreground">(archived)</span>
            ) : null}
          </Link>
        ),
      },
      // The old search also matched the slug; it keeps its own (hidden) column so it stays searchable.
      { id: "slug", header: "Slug", accessorKey: "slug", width: 220, hidden: true },
      { id: "member_count", header: "Members", accessorKey: "member_count", filter: "number", width: 110 },
      {
        id: "scope_types",
        header: "Scope types",
        // `…` while the per-organization read is in flight; `—` when it failed.
        accessorFn: (org) => summaries[org.id]?.scopeTypeCount ?? null,
        filter: "number",
        width: 130,
        cell: (org) => {
          const summary = summaries[org.id];
          return (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Tags className="h-3.5 w-3.5" />
              {summary === undefined ? "…" : (summary.scopeTypeCount ?? "—")}
            </span>
          );
        },
      },
      {
        id: "last_scope_change",
        header: "Last scope change",
        accessorFn: (org) => summaries[org.id]?.lastScopeChange ?? null,
        width: 220,
        cell: (org) => {
          const summary = summaries[org.id];
          return (
            <span className="text-muted-foreground">
              {summary === undefined ? "…" : formatWhen(summary.lastScopeChange)}
            </span>
          );
        },
      },
    ],
    [summaries],
  );

  return (
    <div className="space-y-3">
      <AdminPageCapture
        title="Scopes & Context — Organizations"
        route="/administration/scopes-context/organizations"
        sections={[
          {
            id: "organizations",
            title: "Organizations",
            role: "data",
            value: (organizations ?? []).map((org) => ({
              name: org.name,
              member_count: org.member_count,
              scope_type_count: summaries[org.id]?.scopeTypeCount ?? null,
              last_scope_change: summaries[org.id]?.lastScopeChange ?? null,
            })),
          },
        ]}
      />

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive-ink">
          {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      ) : (
        <MatrxDataTable
          tableId="admin/scopes-context-organizations"
          urlState={{ id: "scopes-context-organizations", defaultSort: { id: "name", direction: "asc" } }}
          data={organizations ?? []}
          columns={columns}
          getRowId={(org) => org.id}
          isLoading={organizations === null}
          rowVersion={(org) => summaries[org.id]}
          emptyState={{ title: "No organizations yet." }}
          onRowOpen={(org) => router.push(`/administration/scopes-context/organizations/${org.id}`)}
          detail={{ enabled: false }}
          copy={{
            label: "Organization",
            listLabel: "Organizations",
            location: "/administration/scopes-context/organizations",
            rowKind: "scopes-context-organization",
            listKind: "scopes-context-organizations",
            humanRow: (org) => {
              const summary = summaries[org.id];
              return [
                `${org.name} (${org.slug})${org.archived_at ? " — archived" : ""}`,
                `${org.member_count} members · ${summary?.scopeTypeCount ?? "unknown"} scope types · last scope change ${formatWhen(summary?.lastScopeChange)}`,
              ].join("\n");
            },
            agentRow: (org) => ({
              id: org.id,
              name: org.name,
              slug: org.slug,
              archived: Boolean(org.archived_at),
              member_count: org.member_count,
              scope_type_count: summaries[org.id]?.scopeTypeCount ?? null,
              last_scope_change: summaries[org.id]?.lastScopeChange ?? null,
            }),
          }}
        />
      )}
    </div>
  );
}
