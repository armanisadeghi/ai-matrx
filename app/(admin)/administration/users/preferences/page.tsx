"use client";

// Users & Access › Preferences.
//
// Health + control surface for user-preferences shape drift. The FE normalizes
// legacy shapes on load and the DB self-heals (weekly pg_cron +
// heal-on-load), so this should sit at zero — it exists to PROVE that across
// all users and to give a super-admin a manual "Heal now" lever when needed.
// Data via /api/admin/users/preferences-drift (super-admin gated, service-role).

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, ShieldAlert, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const PAGE_LOCATION =
  "AI Matrx Admin — Preferences (/administration/users/preferences)";

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

export default function PreferencesDriftPage() {
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
    <div className="h-full overflow-y-auto p-6 space-y-6" data-page={PAGE_LOCATION}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Preferences Drift
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Accounts whose stored preferences still carry a retired shape (legacy
            default-model seeds, superseded videoConference audio fields). These
            self-heal on load and via the weekly{" "}
            <code className="text-xs">heal-user-preferences-drift</code> cron —
            this view proves it across every user and offers a manual heal.
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
          <div className="text-xs text-muted-foreground">Total preference rows</div>
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
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">User</th>
                <th className="px-3 py-2 font-medium">Organization</th>
                <th className="px-3 py-2 font-medium">Drifted fields</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={`${r.user_id}:${r.organization_id}`} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{r.user_id}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {r.organization_id ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-amber-600 dark:text-amber-400">
                    {r.drifted_fields}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.updated_at
                      ? new Date(r.updated_at).toLocaleString()
                      : "—"}
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
