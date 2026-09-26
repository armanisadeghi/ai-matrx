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
import { useEffect, useMemo, useState } from "react";
import { Building2, Search, Tags } from "lucide-react";
import { Input } from "@ai-matrx/design-system";
import { AdminPageCapture } from "@/components/agent-copy/page-capture/AdminPageCapture";
import { scopesService } from "@/features/scopes/service/scopesService";
import type { AdminOrganizationDirectory, AdminOrganizationRow } from "@/features/admin/users/types";

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
  const [query, setQuery] = useState("");

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

  const visible = useMemo(() => {
    const rows = organizations ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((org) => org.name.toLowerCase().includes(needle) || org.slug.toLowerCase().includes(needle));
  }, [organizations, query]);

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

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search organizations…"
          className="pl-8"
          aria-label="Search organizations"
        />
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : organizations === null ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          Loading organizations…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          {organizations.length === 0
            ? "No organizations yet."
            : `Nothing matches "${query}".`}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Organization</th>
                <th className="px-3 py-2">Members</th>
                <th className="px-3 py-2">Scope types</th>
                <th className="px-3 py-2">Last scope change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((org) => {
                const summary = summaries[org.id];
                return (
                  <tr key={org.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <Link
                        href={`/administration/scopes-context/organizations/${org.id}`}
                        className="flex items-center gap-2 font-medium text-foreground hover:underline"
                      >
                        <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        {org.name}
                        {org.archived_at ? (
                          <span className="text-xs font-normal text-muted-foreground">(archived)</span>
                        ) : null}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{org.member_count}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Tags className="h-3.5 w-3.5" />
                        {summary === undefined ? "…" : summary.scopeTypeCount ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {summary === undefined ? "…" : formatWhen(summary.lastScopeChange)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
