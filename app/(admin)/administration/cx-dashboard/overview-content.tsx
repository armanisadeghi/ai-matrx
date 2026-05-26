"use client";

import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Send,
  Zap,
  Wrench,
  DollarSign,
  Hash,
  Clock,
  AlertTriangle,
  Hourglass,
  Ban,
  FileText,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CxKpiCard } from "@/features/cx-dashboard/components/CxKpiCard";
import { CxEmptyState } from "@/features/cx-dashboard/components/CxEmptyState";
import { CxJsonViewer } from "@/features/cx-dashboard/components/CxJsonViewer";
import {
  formatCost,
  formatTokens,
  formatDuration,
} from "@/features/cx-dashboard/utils/format";
import type { CxOverviewKpis } from "@/features/cx-dashboard/types/cxDashboardTypes";

const COLORS = [
  "hsl(215, 70%, 55%)",
  "hsl(160, 60%, 45%)",
  "hsl(280, 60%, 55%)",
  "hsl(35, 80%, 50%)",
  "hsl(0, 65%, 55%)",
  "hsl(190, 70%, 45%)",
];

export function OverviewContent({ kpis }: { kpis: CxOverviewKpis }) {
  const router = useRouter();

  const costChartConfig: ChartConfig = {
    cost: { label: "Cost", color: "hsl(215, 70%, 55%)" },
    requests: { label: "Requests", color: "hsl(160, 60%, 45%)" },
  };

  const modelChartConfig: ChartConfig = {};
  kpis.models_used.forEach((m, i) => {
    modelChartConfig[m.model_name] = {
      label: m.model_name,
      color: COLORS[i % COLORS.length],
    };
  });

  return (
    <div className="p-4 space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
        <CxKpiCard
          label="Conversations"
          value={kpis.total_conversations.toString()}
          icon={MessageSquare}
          onClick={() =>
            router.push("/administration/cx-dashboard/conversations")
          }
        />
        <CxKpiCard
          label="User Requests"
          value={kpis.total_user_requests.toString()}
          icon={Send}
          onClick={() => router.push("/administration/cx-dashboard/requests")}
        />
        <CxKpiCard
          label="API Requests"
          value={kpis.total_api_requests.toString()}
          subValue={`${formatTokens(kpis.total_tokens)} tokens`}
          icon={Zap}
        />
        <CxKpiCard
          label="Total Cost"
          value={formatCost(kpis.total_cost)}
          subValue={`avg ${formatCost(kpis.avg_cost_per_request)}/req`}
          icon={DollarSign}
          onClick={() => router.push("/administration/cx-dashboard/usage")}
        />
        <CxKpiCard
          label="Avg Duration"
          value={formatDuration(kpis.avg_duration_ms)}
          icon={Clock}
        />
        <CxKpiCard
          label="Errors"
          value={kpis.error_count.toString()}
          subValue={`${(kpis.error_rate * 100).toFixed(1)}% rate`}
          trend={kpis.error_count > 0 ? "down" : "neutral"}
          icon={AlertTriangle}
          onClick={() => router.push("/administration/cx-dashboard/errors")}
        />
      </div>

      {/* Status indicators */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        <CxKpiCard
          label="Messages"
          value={kpis.total_messages.toString()}
          icon={FileText}
        />
        <CxKpiCard
          label="Tool Calls"
          value={kpis.total_tool_calls.toString()}
          icon={Wrench}
        />
        <CxKpiCard
          label="Pending (Bug)"
          value={kpis.pending_count.toString()}
          icon={Hourglass}
          className={kpis.pending_count > 0 ? "border-amber-500/30" : ""}
        />
        <CxKpiCard
          label="Max Tokens Hit"
          value={kpis.max_tokens_count.toString()}
          icon={Ban}
        />
        <CxKpiCard
          label="Input Tokens"
          value={formatTokens(kpis.total_input_tokens)}
          icon={Hash}
        />
        <CxKpiCard
          label="Output Tokens"
          value={formatTokens(kpis.total_output_tokens)}
          subValue={
            kpis.total_cached_tokens > 0
              ? `${formatTokens(kpis.total_cached_tokens)} cached`
              : undefined
          }
          icon={Hash}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Daily Cost & Requests */}
        {kpis.daily_stats.length > 0 ? (
          <div className="border border-border rounded-md p-3 bg-card">
            <h3 className="text-xs font-medium text-muted-foreground mb-3">
              Daily Cost & Requests
            </h3>
            <ChartContainer
              config={costChartConfig}
              className="h-[220px] w-full"
            >
              <AreaChart
                data={kpis.daily_stats}
                margin={{ left: 0, right: 0, top: 5, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis
                  yAxisId="cost"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `$${v}`}
                />
                <YAxis
                  yAxisId="reqs"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Area
                  yAxisId="cost"
                  type="monotone"
                  dataKey="cost"
                  fill="hsl(215, 70%, 55%)"
                  fillOpacity={0.15}
                  stroke="hsl(215, 70%, 55%)"
                  strokeWidth={2}
                  name="Cost ($)"
                />
                <Bar
                  yAxisId="reqs"
                  dataKey="requests"
                  fill="hsl(160, 60%, 45%)"
                  opacity={0.6}
                  radius={[2, 2, 0, 0]}
                  name="Requests"
                />
              </AreaChart>
            </ChartContainer>
          </div>
        ) : (
          <div className="border border-border rounded-md p-3 bg-card">
            <h3 className="text-xs font-medium text-muted-foreground mb-3">
              Daily Cost & Requests
            </h3>
            <CxEmptyState title="No daily data yet" />
          </div>
        )}

        {/* Model Usage Pie */}
        {kpis.models_used.length > 0 ? (
          <div className="border border-border rounded-md p-3 bg-card">
            <h3 className="text-xs font-medium text-muted-foreground mb-3">
              Cost by Model
            </h3>
            <div className="flex items-center gap-4">
              <ChartContainer
                config={modelChartConfig}
                className="h-[200px] w-[200px]"
              >
                <PieChart>
                  <Pie
                    data={kpis.models_used}
                    dataKey="total_cost"
                    nameKey="model_name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                  >
                    {kpis.models_used.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
              <div className="flex-1 space-y-1.5">
                {kpis.models_used.map((m, i) => (
                  <div
                    key={m.model_name}
                    className="flex items-center gap-2 text-xs"
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="flex-1 truncate">{m.model_name}</span>
                    <span className="text-muted-foreground">{m.count}x</span>
                    <span className="font-mono">
                      {formatCost(m.total_cost)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-border rounded-md p-3 bg-card">
            <h3 className="text-xs font-medium text-muted-foreground mb-3">
              Cost by Model
            </h3>
            <CxEmptyState title="No model data" />
          </div>
        )}
      </div>

      {/* Tool Usage */}
      {kpis.tool_usage.length > 0 && (
        <div className="border border-border rounded-md p-3 bg-card">
          <h3 className="text-xs font-medium text-muted-foreground mb-3">
            Tool Usage
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-1.5 pr-4 font-medium">Tool</th>
                  <th className="text-right py-1.5 px-3 font-medium">Calls</th>
                  <th className="text-right py-1.5 px-3 font-medium">Errors</th>
                  <th className="text-right py-1.5 px-3 font-medium">
                    Avg Duration
                  </th>
                  <th className="text-right py-1.5 pl-3 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {kpis.tool_usage.map((t) => (
                  <tr
                    key={t.tool_name}
                    className="border-b border-border/50 hover:bg-muted/30"
                  >
                    <td className="py-1.5 pr-4 font-mono">{t.tool_name}</td>
                    <td className="text-right py-1.5 px-3">{t.count}</td>
                    <td className="text-right py-1.5 px-3">
                      {t.error_count > 0 ? (
                        <span className="text-red-500">{t.error_count}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="text-right py-1.5 px-3">
                      {formatDuration(t.avg_duration_ms)}
                    </td>
                    <td className="text-right py-1.5 pl-3 font-mono">
                      {formatCost(t.total_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Raw KPIs debug viewer */}
      <CxJsonViewer data={kpis} label="Raw KPI Data (Debug)" />
    </div>
  );
}
