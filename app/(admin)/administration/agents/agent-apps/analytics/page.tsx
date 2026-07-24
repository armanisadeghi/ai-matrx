"use client";

/**
 * Analytics dashboard for agent-apps.
 *
 * Reads the aggregate counters that already live on each `aga_apps` row
 * (`total_executions`, `total_tokens_used`, `total_cost`,
 * `unique_users_count`, `success_rate`, `avg_execution_time_ms`,
 * `last_execution_at`). For deeper time-window splits (executions_24h /
 * 7d / 30d) and percentile latencies (p50/p95) we'd need a dedicated
 * analytics view — added later as a follow-up if needed.
 *
 * Replaces the legacy `AnalyticsAdmin` from prompt-apps. The fundamental
 * shape is the same: overview cards on top, per-app table below.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/components/ui/use-toast";
import {
  Activity,
  BarChart3,
  CheckCircle,
  Clock,
  DollarSign,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import {
  fetchAgentAppsAdmin,
  type AgentAppAdminView,
} from "@/lib/services/agent-apps-admin-service";

export default function AgentAppsAnalyticsPage() {
  const [apps, setApps] = useState<AgentAppAdminView[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchAgentAppsAdmin({ limit: 200 });
      setApps(data);
    } catch (error) {
      console.error("Error loading agent-app analytics:", error);
      toast({
        title: "Error",
        description: "Failed to load analytics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totals = useMemo(() => {
    return apps.reduce(
      (acc, app) => ({
        totalExecutions: acc.totalExecutions + (app.total_executions ?? 0),
        totalUniqueUsers:
          acc.totalUniqueUsers + (app.unique_users_count ?? 0),
        totalCost: acc.totalCost + Number(app.total_cost ?? 0),
        totalTokens: acc.totalTokens + Number(app.total_tokens_used ?? 0),
      }),
      {
        totalExecutions: 0,
        totalUniqueUsers: 0,
        totalCost: 0,
        totalTokens: 0,
      },
    );
  }, [apps]);

  // success_rate is stored as numeric(5,4) = 0..1 fraction. Multiply by 100
  // for display.
  const overallSuccessRate = useMemo(() => {
    if (apps.length === 0) return "0.00";
    const weightedSum = apps.reduce(
      (sum, app) =>
        sum + (app.success_rate ?? 0) * (app.total_executions ?? 0),
      0,
    );
    const total = totals.totalExecutions;
    return total > 0
      ? ((weightedSum / total) * 100).toFixed(2)
      : "0.00";
  }, [apps, totals.totalExecutions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <MatrxMiniLoader />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-textured overflow-hidden">
      <div className="p-4 border-b border-border bg-textured">
        <h2 className="text-lg font-semibold text-foreground">
          Analytics Dashboard
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Aggregate metrics across all agent apps
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <OverviewCard
              icon={<Activity className="w-4 h-4 text-blue-600" />}
              label="Total Executions"
              value={totals.totalExecutions.toLocaleString()}
              sub={`Across ${apps.length} app${apps.length === 1 ? "" : "s"}`}
            />
            <OverviewCard
              icon={<Users className="w-4 h-4 text-purple-600" />}
              label="Unique Users"
              value={totals.totalUniqueUsers.toLocaleString()}
              sub="All identified callers"
            />
            <OverviewCard
              icon={<CheckCircle className="w-4 h-4 text-green-600" />}
              label="Success Rate"
              value={`${overallSuccessRate}%`}
              sub="Execution-weighted average"
            />
            <OverviewCard
              icon={<DollarSign className="w-4 h-4 text-green-600" />}
              label="Total Cost"
              value={`$${totals.totalCost.toFixed(4)}`}
              sub={`${totals.totalTokens.toLocaleString()} tokens`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>App Performance</CardTitle>
              <CardDescription>
                Per-app aggregates from `aga_apps`
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {apps.map((app) => {
                  const successPct = ((app.success_rate ?? 0) * 100).toFixed(
                    2,
                  );
                  const successOk = (app.success_rate ?? 0) >= 0.95;
                  return (
                    <div
                      key={app.id}
                      className="border border-border rounded-lg p-4 hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h4 className="font-semibold text-foreground">
                              {app.name}
                            </h4>
                            <Badge variant="outline">{app.status}</Badge>
                            {app.is_featured && (
                              <Badge variant="outline" className="text-amber-600 border-amber-600">
                                Featured
                              </Badge>
                            )}
                            {app.is_verified && (
                              <Badge variant="outline" className="text-blue-600 border-blue-600">
                                Verified
                              </Badge>
                            )}
                            <code className="text-xs px-1 py-0.5 bg-muted rounded">
                              {app.slug}
                            </code>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                            <Stat
                              icon={<Activity className="w-3 h-3" />}
                              label="Executions"
                              value={(app.total_executions ?? 0).toLocaleString()}
                            />
                            <Stat
                              icon={<Users className="w-3 h-3" />}
                              label="Unique Users"
                              value={(app.unique_users_count ?? 0).toLocaleString()}
                            />
                            <Stat
                              icon={
                                successOk ? (
                                  <CheckCircle className="w-3 h-3 text-green-600" />
                                ) : (
                                  <XCircle className="w-3 h-3 text-red-600" />
                                )
                              }
                              label="Success"
                              value={`${successPct}%`}
                            />
                            <Stat
                              icon={<Clock className="w-3 h-3" />}
                              label="Avg Time"
                              value={`${app.avg_execution_time_ms ?? 0}ms`}
                            />
                            <Stat
                              icon={<DollarSign className="w-3 h-3" />}
                              label="Cost"
                              value={`$${Number(app.total_cost ?? 0).toFixed(4)}`}
                            />
                          </div>

                          {app.last_execution_at && (
                            <div className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                              Last execution:{" "}
                              {new Date(app.last_execution_at).toLocaleString()}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {(app.total_executions ?? 0) > 100 && (
                            <Badge
                              variant="outline"
                              className="text-green-600 border-green-600"
                            >
                              <TrendingUp className="w-3 h-3 mr-1" />
                              Active
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {apps.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <BarChart3 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No analytics data available</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}

function OverviewCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{sub}</div>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="font-medium flex items-center gap-1">
        {icon}
        {value}
      </div>
    </div>
  );
}
