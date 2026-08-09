"use client";

// Users & Access › Preferences.
//
// Two modes, one tab:
//  - Default: the drift dashboard (all users on a retired shape) + manual heal.
//  - ?user=<id> (from the Accounts cross-link): that user's ACTUAL preferences,
//    one canonical row per module, with the full value in the detail panel.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import { AdminUserRef } from "./AdminUserRef";
import { USERS_ADMIN_LOCATION } from "../constants";

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
  const router = useRouter();
  const [report, setReport] = useState<DriftReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [healing, setHealing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Preferences Drift</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Accounts whose stored preferences still carry a retired shape. These
            self-heal on load and via the weekly{" "}
            <code className="text-xs">heal-user-preferences-drift</code> cron. Open a
            user from Accounts to see their actual preferences.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading || healing}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
          <Button size="sm" onClick={() => void heal()} disabled={healing || loading || clean === true}>
            {healing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
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
          <div className="text-xs text-muted-foreground">Total preference rows</div>
          <div className="mt-1 text-2xl font-semibold text-foreground">
            {report ? report.total : "—"}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Drifted rows</div>
          <div className={"mt-1 text-2xl font-semibold " + (clean ? "text-foreground" : "text-amber-500")}>
            {report ? report.drifted : "—"}
          </div>
        </div>
        <div className="col-span-2 flex items-center gap-2 rounded-lg border border-border bg-card p-4 sm:col-span-1">
          {clean ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <span className="text-sm font-medium text-foreground">All clean</span>
            </>
          ) : report ? (
            <>
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <span className="text-sm font-medium text-foreground">Drift present</span>
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
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">Drifted fields</th>
                <th className="px-3 py-2 font-medium">Updated</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={`${r.user_id}:${r.organization_id}`} className="border-t border-border">
                  <td className="px-3 py-2">
                    <AdminUserRef userId={r.user_id} />
                  </td>
                  <td className="px-3 py-2">
                    {r.organization_id ? (
                      <MatrxUuidCell
                        value={r.organization_id}
                        label="Organization"
                        token="organization"
                      />
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-amber-600 dark:text-amber-400">{r.drifted_fields}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.updated_at ? new Date(r.updated_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {/* The row names a user whose preferences this same page
                        can focus (`?user=` is read at the `focusUser` line
                        below — verified, not assumed). An anchor, so the row
                        can be opened in a new tab beside the current list. */}
                    <Button
                      size="sm"
                      variant="ghost"
                      asChild
                      className="h-6 text-xs"
                    >
                      <Link
                        href={`/administration/users/preferences?user=${r.user_id}`}
                      >
                        View
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  const [meta, setMeta] = useState<{ exists: boolean; updated_at: string | null }>({
    exists: true,
    updated_at: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/users/preferences?userId=${userId}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load preferences");
        if (!active) return;
        const prefs = (json.preferences ?? {}) as Record<string, unknown>;
        setRows(
          Object.entries(prefs).map(([module, value]) => ({
            module,
            value,
            summary: summarize(value),
          })),
        );
        setMeta({ exists: json.exists !== false, updated_at: json.updated_at ?? null });
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : "Failed"))
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
        cell: (r) => <span className="font-mono text-xs font-medium">{r.module}</span>,
        width: 200,
      },
      {
        id: "summary",
        accessorKey: "summary",
        header: "Value (summary)",
        cell: (r) => (
          <span className="line-clamp-2 text-xs text-muted-foreground">{r.summary}</span>
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
          onClick={() => router.push("/administration/users/preferences")}
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
          onClick={() => router.push("/administration/users")}
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
          <MatrxDataTable
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
        </div>
      )}
    </div>
  );
}

// ── entry ────────────────────────────────────────────────────────────────────

export function PreferencesTabClient() {
  const focusUser = useSearchParams().get("user");
  return focusUser ? <UserPreferencesView userId={focusUser} /> : <DriftDashboard />;
}
