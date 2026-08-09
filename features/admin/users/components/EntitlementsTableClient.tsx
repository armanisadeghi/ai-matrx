"use client";

// Users & Access › Entitlements — canonical MatrxDataTable over the capability
// registry + 30-day usage rollup (billing.*). Read-only; sort/filter every
// column + Copy-for-AI.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { CAPABILITY_REGISTRY, type Capability } from "@/features/entitlements/registry";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { USERS_ADMIN_LOCATION } from "../constants";

interface EntitlementRow {
  capability: string;
  label: string;
  enforced: boolean;
  period: string;
  free_limits: string;
  used_30d: number;
  events: number;
  users: number;
}

export function EntitlementsTableClient() {
  const [rows, setRows] = useState<EntitlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const [capRes, limRes, useRes] = await Promise.all([
        supabase.schema("billing").from("capability").select("capability, enforced, period, min_tier"),
        supabase.schema("billing").from("capability_limit").select("capability, tier, period, limit_value"),
        supabase.schema("billing").rpc("usage_admin_summary"),
      ]);
      if (capRes.error) throw capRes.error;
      const limits = (limRes.data ?? []) as Array<{
        capability: string;
        tier: string;
        period: string;
        limit_value: number | null;
      }>;
      const usage = (useRes.error ? [] : useRes.data ?? []) as Array<{
        capability: string;
        total_quantity: number;
        event_count: number;
        active_users: number;
      }>;
      if (useRes.error) setError(useRes.error.message);
      const freeLimits = (cap: string) =>
        limits
          .filter((l) => l.capability === cap && l.tier === "free")
          .map((l) => `${l.limit_value}/${l.period.replace("rolling_", "")}`)
          .join(" · ") || "—";
      setRows(
        ((capRes.data ?? []) as Array<{ capability: string; enforced: boolean; period: string | null }>).map(
          (c) => {
            const u = usage.find((x) => x.capability === c.capability);
            const def = CAPABILITY_REGISTRY[c.capability as Capability];
            return {
              capability: c.capability,
              label: def?.label ?? c.capability,
              enforced: c.enforced,
              period: c.period ?? "gate",
              free_limits: freeLimits(c.capability),
              used_30d: u?.total_quantity ?? 0,
              events: u?.event_count ?? 0,
              users: u?.active_users ?? 0,
            };
          },
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load entitlements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns = useMemo((): MatrxColumnDef<EntitlementRow>[] => {
    return [
      {
        id: "label",
        accessorKey: "label",
        header: "Capability",
        cell: (r) => (
          <div>
            <div className="font-medium text-foreground">{r.label}</div>
            <div className="font-mono text-[11px] text-muted-foreground">{r.capability}</div>
          </div>
        ),
        width: 240,
      },
      {
        id: "enforced",
        accessorKey: "enforced",
        header: "Enforced",
        filter: "boolean",
        cell: (r) =>
          r.enforced ? (
            <Badge variant="default" className="gap-1 text-[11px]">
              <ShieldCheck className="h-3 w-3" /> on
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1 text-[11px] text-muted-foreground">
              <ShieldOff className="h-3 w-3" /> permissive
            </Badge>
          ),
        width: 120,
      },
      { id: "period", accessorKey: "period", header: "Period", filter: "select", width: 120 },
      {
        id: "free_limits",
        accessorKey: "free_limits",
        header: "Free limits",
        cell: (r) => <span className="font-mono text-[11px] text-muted-foreground">{r.free_limits}</span>,
        width: 140,
      },
      {
        id: "used_30d",
        accessorKey: "used_30d",
        header: "Used (30d)",
        filter: "number",
        align: "right",
        cell: (r) => <span className="tabular-nums">{r.used_30d}</span>,
        width: 100,
      },
      // THE DOOR LAW says "a count is a door" — but a count only becomes a door
      // when the records behind it are actually reachable. `events` and `users`
      // come from the `billing.usage_admin_summary` rollup, and NOTHING in this
      // app lists billing usage events or per-capability users: there is no
      // route, no param, no drill-through. Wiring a link here would point at a
      // page that does not exist, so these stay plain counts until that surface
      // is built. Reported as a gap rather than faked.
      {
        id: "events",
        accessorKey: "events",
        header: "Events",
        filter: "number",
        align: "right",
        cell: (r) => <span className="tabular-nums text-muted-foreground">{r.events}</span>,
        width: 90,
      },
      {
        id: "users",
        accessorKey: "users",
        header: "Users",
        filter: "number",
        align: "right",
        cell: (r) => <span className="tabular-nums text-muted-foreground">{r.users}</span>,
        width: 80,
      },
    ];
  }, []);

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      {error ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
          Usage rollup unavailable: {error} (registry still shown.)
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <MatrxDataTable
          data={rows}
          columns={columns}
          getRowId={(r) => r.capability}
          isLoading={loading}
          pageSize={50}
          emptyState={{ title: "No capabilities registered" }}
          toolbar={{
            search: true,
            searchPlaceholder: "Search capability…",
            actions: (
              <Button size="sm" variant="outline" onClick={() => void load()}>
                Refresh
              </Button>
            ),
          }}
          copy={{
            label: "Capability",
            listLabel: "Entitlements (this view)",
            location: USERS_ADMIN_LOCATION,
            rowKind: "capability",
            listKind: "capabilities",
            humanRow: (r) =>
              `${r.label} (${r.capability}) enforced=${r.enforced} period=${r.period} free=${r.free_limits} used30d=${r.used_30d} users=${r.users}`,
            rowAttributes: (r) => ({ capability: r.capability, enforced: r.enforced }),
          }}
        />
      </div>
    </div>
  );
}
