"use client";

// Super-admin entitlements + usage dashboard (P8, DoD #6). Read-only: the
// capability registry with live enforcement flags + free-tier limits, and the
// 30-day usage rollup from billing.usage_admin_summary. The (admin) layout
// already gates super-admin, so no extra guard here.

import { useCallback, useEffect, useState } from "react";
import { Gauge, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/utils/supabase/client";
import { CAPABILITY_REGISTRY, type Capability } from "@/features/entitlements/registry";

interface CapabilityRow {
  capability: string;
  enforced: boolean;
  period: string | null;
  min_tier: string;
}
interface LimitRow {
  capability: string;
  tier: string;
  period: string;
  limit_value: number | null;
}
interface UsageRow {
  capability: string;
  total_quantity: number;
  event_count: number;
  active_users: number;
}

export default function EntitlementsAdminPage() {
  const [caps, setCaps] = useState<CapabilityRow[]>([]);
  const [limits, setLimits] = useState<LimitRow[]>([]);
  const [usage, setUsage] = useState<UsageRow[]>([]);
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
      setCaps((capRes.data as CapabilityRow[]) ?? []);
      setLimits((limRes.data as LimitRow[]) ?? []);
      // usage RPC raises for non-super-admins; surface gracefully.
      if (useRes.error) setError(useRes.error.message);
      else setUsage((useRes.data as UsageRow[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load entitlements");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const freeLimits = (cap: string) =>
    limits
      .filter((l) => l.capability === cap && l.tier === "free")
      .map((l) => `${l.limit_value}/${l.period.replace("rolling_", "")}`)
      .join(" · ") || "—";

  const usageFor = (cap: string) => usage.find((u) => u.capability === cap);
  const enforcedCount = caps.filter((c) => c.enforced).length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 p-4 border-b border-border bg-card flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-primary/10 text-primary flex items-center justify-center">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Entitlements &amp; Usage</h1>
            <p className="text-sm text-muted-foreground">
              Capability registry, live enforcement, and 30-day usage. {enforcedCount} of {caps.length} capabilities enforced.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4 max-w-6xl mx-auto">
          {error && (
            <Card className="border-amber-500/40">
              <CardContent className="p-3 text-sm text-amber-600 dark:text-amber-400">
                Usage rollup unavailable: {error} (registry still shown below.)
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="p-3 font-medium">Capability</th>
                    <th className="p-3 font-medium">Enforced</th>
                    <th className="p-3 font-medium">Primary period</th>
                    <th className="p-3 font-medium">Free limits</th>
                    <th className="p-3 font-medium text-right">Used (30d)</th>
                    <th className="p-3 font-medium text-right">Events</th>
                    <th className="p-3 font-medium text-right">Users</th>
                  </tr>
                </thead>
                <tbody>
                  {caps.map((c) => {
                    const u = usageFor(c.capability);
                    const def = CAPABILITY_REGISTRY[c.capability as Capability];
                    return (
                      <tr key={c.capability} className="border-b border-border/50 hover:bg-muted/40">
                        <td className="p-3">
                          <div className="font-medium text-foreground">{def?.label ?? c.capability}</div>
                          <div className="text-[11px] text-muted-foreground font-mono">{c.capability}</div>
                        </td>
                        <td className="p-3">
                          {c.enforced ? (
                            <Badge variant="default" className="gap-1 text-[11px]">
                              <ShieldCheck className="h-3 w-3" /> on
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1 text-[11px] text-muted-foreground">
                              <ShieldOff className="h-3 w-3" /> permissive
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground">{c.period ?? "gate"}</td>
                        <td className="p-3 text-muted-foreground font-mono text-[11px]">{freeLimits(c.capability)}</td>
                        <td className="p-3 text-right tabular-nums">{u?.total_quantity ?? 0}</td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">{u?.event_count ?? 0}</td>
                        <td className="p-3 text-right tabular-nums text-muted-foreground">{u?.active_users ?? 0}</td>
                      </tr>
                    );
                  })}
                  {caps.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted-foreground">
                        No capabilities registered.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardContent className="p-4 text-sm text-muted-foreground space-y-1.5">
              <div className="font-medium text-foreground">How enforcement works</div>
              <p>
                Every capability ships <span className="font-mono">enforced = false</span> (permissive). Flip a capability to
                enforced ONLY after the aidream-side spend re-check exists for it. Free-tier limits are pre-encoded
                (generous monthly + a short burst window) and take effect the moment a capability is enforced. We meter AI
                generation only — never saved content.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
