"use client";

// Users & Access › Preferences.
//
// Two modes, one tab:
//  - Default: the drift dashboard (all users on a retired shape) + manual heal.
//  - ?user=<id> (from the Accounts cross-link): that user's ACTUAL preferences,
//    one canonical row per module, with the full value in the detail panel.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AppLink from "@/components/navigation/AppLink";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { MatrxUuidCell } from "@ai-matrx/design-system/data-table/uuid-cell";
import { AdminUserRef } from "./AdminUserRef";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildAdminUserMenuSection } from "./admin-user-menu-section";
import { USERS_ADMIN_LOCATION } from "../constants";
import { pushAppHref } from "@/lib/deployment/navigate";

// ── drift dashboard ────────────────────────────────────────────────────────

interface DriftRow {
  user_id: string;
  organization_id: string | null;
  updated_at: string | null;
  drifted_fields: string;
}
interface DriftReport {
  total: number;
  drifted: number;
  rows: DriftRow[];
}

function DriftDashboard() {
  const [report, setReport] = useState<DriftReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [healing, setHealing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clickedRow, setClickedRow] = useState<DriftRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users/preferences-drift", {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load drift report");
      setReport(json as DriftReport);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const heal = useCallback(async () => {
    setHealing(true);
    try {
      const res = await fetch("/api/admin/users/preferences-drift", {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Heal failed");
      toast.success(
        json.healed > 0
          ? `Normalized ${json.healed} drifted row(s).`
          : "Nothing to heal — already clean.",
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Heal failed");
    } finally {
      setHealing(false);
    }
  }, [load]);

  const clean = report && report.drifted === 0;

  const columns = useMemo((): MatrxColumnDef<DriftRow>[] => {
    return [
      {
        id: "user_id",
        accessorKey: "user_id",
        header: "User",
        // Preserve the report's identity door. AdminUserRef carries the
        // user-aware admin link rather than reducing this identity to UUID text.
        cell: (row) => <AdminUserRef userId={row.user_id} />,
        width: 220,
        className: "max-sm:min-w-[9rem]",
        headerClassName: "max-sm:min-w-[9rem]",
      },
      {
        id: "organization_id",
        accessorKey: "organization_id",
        header: "Organization",
        cell: (row) =>
          row.organization_id ? (
            <MatrxUuidCell
              value={row.organization_id}
              label="Organization"
              token="organization"
            />
          ) : (
            <span className="text-muted-foreground/40">—</span>
          ),
        width: 180,
      },
      {
        id: "drifted_fields",
        accessorKey: "drifted_fields",
        header: "Drifted fields",
        cell: (row) => (
          <span className="text-amber-600 dark:text-amber-400">
            {row.drifted_fields}
          </span>
        ),
        width: 280,
      },
      {
        id: "updated_at",
        accessorKey: "updated_at",
        header: "Updated",
        cell: (row) => (
          <span className="text-muted-foreground">
            {row.updated_at
              ? new Date(row.updated_at).toLocaleString()
              : "—"}
          </span>
        ),
        width: 190,
      },
    ];
  }, []);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Preferences Drift
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Accounts whose stored preferences still carry a retired shape. These
            self-heal on load and via the weekly{" "}
            <code className="text-xs">heal-user-preferences-drift</code> cron.
            Open a user from Accounts to see their actual preferences.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading || healing}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => void heal()}
            disabled={healing || loading || clean === true}
          >
            {healing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wrench className="h-4 w-4" />
            )}
            Heal now
          </Button>
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">
            Total preference rows
          </div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {report ? report.total : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Drifted rows</div>
          <div
            className={
              "mt-1 text-2xl font-semibold " +
              (clean ? "text-foreground" : "text-amber-500")
            }
          >
            {report ? report.drifted : "—"}
          </div>
        </div>
        <div className="col-span-2 flex items-center gap-2 rounded-lg border border-border bg-card p-4 sm:col-span-1">
          {clean ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="text-sm font-medium text-foreground">
                All clean
              </span>
            </>
          ) : report ? (
            <>
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <span className="text-sm font-medium text-foreground">
                Drift present
              </span>
            </>
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading drift report…
        </div>
      ) : clean ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-2 text-sm text-muted-foreground">
            No drifted preference rows. Every account is on the current shape.
          </p>
        </div>
      ) : report && report.rows.length > 0 ? (
        <NonEditableContextMenu
          sourceFeature="admin"
          contentSource={{ type: "raw" }}
          contextData={{ content: "" }}
          resolveContextOnOpen={(element) => {
            const id = element
              ?.closest("[data-row-id]")
              ?.getAttribute("data-row-id");
            const row = id
              ? (report.rows.find(
                  (r) => `${r.user_id}:${r.organization_id ?? "none"}` === id,
                ) ?? null)
              : null;
            setClickedRow(row);
            if (!row) return null;
            return { content: `Drifted fields: ${row.drifted_fields}` };
          }}
          extraSections={[
            buildAdminUserMenuSection(clickedRow ? { id: clickedRow.user_id } : null),
          ]}
        >
        <MatrxDataTable
          urlState={{ id: "preference-drift-report" }}
          data={report.rows}
          columns={columns}
          getRowId={(row) => `${row.user_id}:${row.organization_id ?? "none"}`}
          searchText={(row) =>
            [row.user_id, row.organization_id, row.drifted_fields]
              .filter(Boolean)
              .join(" ")
          }
          detail={{ enabled: false }}
          pageSize={50}
          emptyState={{ title: "No drifted preference rows" }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search user, organization, or field…",
          }}
          copy={{
            label: "Drifted preference row",
            listLabel: "Drifted preference rows (this report)",
            location: USERS_ADMIN_LOCATION,
            rowKind: "drifted-preference-row",
            listKind: "drifted-preference-rows",
            humanRow: (row) =>
              `user_id=${row.user_id}\norganization_id=${row.organization_id ?? "none"}\ndrifted_fields=${row.drifted_fields}\nupdated_at=${row.updated_at ?? "unknown"}`,
            agentRow: (row) => row,
            // This is an admin report. The source provides its own total and
            // drift counts above; table copy must describe this complete
            // report collection rather than imply source-side filtering.
            listAttributes: (rows) => ({
              report_rows: rows.length,
              report_total: report.total,
              report_drifted: report.drifted,
            }),
          }}
          rowActions={(row) => (
            <Button size="sm" variant="ghost" asChild className="h-6 text-xs">
              <AppLink
                href={`/administration/users/preferences?user=${row.user_id}`}
              >
                View
              </AppLink>
            </Button>
          )}
        />
        </NonEditableContextMenu>
      ) : null}
    </div>
  );
}

// ── per-user actual preferences ──────────────────────────────────────────────

interface ModuleRow {
  module: string;
  value: unknown;
  summary: string;
}

function summarize(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.length} items]`;
  const keys = Object.keys(value as Record<string, unknown>);
  return keys.length ? keys.join(", ") : "{}";
}

function UserPreferencesView({ userId }: { userId: string }) {
  const router = useRouter();
  const [rows, setRows] = useState<ModuleRow[]>([]);
  const [meta, setMeta] = useState<{
    exists: boolean;
    updated_at: string | null;
  }>({
    exists: true,
    updated_at: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/users/preferences?userId=${userId}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok)
          throw new Error(json.error ?? "Failed to load preferences");
        if (!active) return;
        const prefs = (json.preferences ?? {}) as Record<string, unknown>;
        setRows(
          Object.entries(prefs).map(([module, value]) => ({
            module,
            value,
            summary: summarize(value),
          })),
        );
        setMeta({
          exists: json.exists !== false,
          updated_at: json.updated_at ?? null,
        });
      })
      .catch(
        (e) => active && setError(e instanceof Error ? e.message : "Failed"),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [userId]);

  const columns = useMemo((): MatrxColumnDef<ModuleRow>[] => {
    return [
      {
        id: "module",
        accessorKey: "module",
        header: "Module",
        cell: (r) => (
          <span className="font-mono text-xs font-medium">{r.module}</span>
        ),
        width: 200,
      },
      {
        id: "summary",
        accessorKey: "summary",
        header: "Value (summary)",
        cell: (r) => (
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {r.summary}
          </span>
        ),
      },
    ];
  }, []);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="gap-1"
          onClick={() => pushAppHref(router, "/administration/users/preferences")}
        >
          <ArrowLeft className="h-4 w-4" /> Drift overview
        </Button>
        <h2 className="text-sm font-semibold">Preferences for {userId}</h2>
        {meta.updated_at ? (
          <span className="text-xs text-muted-foreground">
            updated {new Date(meta.updated_at).toLocaleString()}
          </span>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 gap-1 px-2 text-xs"
          onClick={() => pushAppHref(router, "/administration/users")}
        >
          <X className="h-3 w-3" /> Back to Accounts
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : !loading && !meta.exists ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          This user has no saved preferences row yet (using platform defaults).
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          {/* Preference module (e.g. "chat_preferences") — a settings blob
             page-local to this view; no other surface names a module row.
             Wrapped for Copy/Export/AI only, no extraSections. */}
          <NonEditableContextMenu
            sourceFeature="admin"
            contentSource={{ type: "raw" }}
            contextData={{ content: "" }}
            resolveContextOnOpen={(element) => {
              const id = element
                ?.closest("[data-row-id]")
                ?.getAttribute("data-row-id");
              const row = id ? (rows.find((r) => r.module === id) ?? null) : null;
              if (!row) return null;
              return { content: `${row.module}: ${row.summary}` };
            }}
          >
          <MatrxDataTable
            urlState={{ id: "user-preferences" }}
            data={rows}
            columns={columns}
            getRowId={(r) => r.module}
            isLoading={loading}
            pageSize={50}
            emptyState={{ title: "No preference modules" }}
            toolbar={{ search: true, searchPlaceholder: "Search module…" }}
            detail={{
              title: (r) => r.module,
              render: (r) => (
                <pre className="overflow-auto whitespace-pre-wrap p-3 text-xs">
                  {JSON.stringify(r.value, null, 2)}
                </pre>
              ),
            }}
            copy={{
              label: "Preference module",
              location: USERS_ADMIN_LOCATION,
              rowKind: "preference-module",
              listKind: "preference-modules",
              humanRow: (r) => `${r.module}: ${JSON.stringify(r.value)}`,
              agentRow: (r) => ({ module: r.module, value: r.value }),
            }}
          />
          </NonEditableContextMenu>
        </div>
      )}
    </div>
  );
}

// ── entry ────────────────────────────────────────────────────────────────────

export function PreferencesTabClient() {
  const focusUser = useSearchParams().get("user");
  return focusUser ? (
    <UserPreferencesView userId={focusUser} />
  ) : (
    <DriftDashboard />
  );
}
