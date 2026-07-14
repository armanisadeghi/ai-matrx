"use client";

import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, AreaChart, Area, ResponsiveContainer,
  Legend,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { CxFiltersBar } from "@/features/cx-dashboard/components/CxFiltersBar";
import { CxEmptyState } from "@/features/cx-dashboard/components/CxEmptyState";
import { CxJsonViewer } from "@/features/cx-dashboard/components/CxJsonViewer";
import { formatCost, formatTokens, formatDuration } from "@/features/cx-dashboard/utils/format";
import { exportToCSV, exportToJSON } from "@/features/cx-dashboard/utils/export";

const COLORS = [
  "hsl(215, 70%, 55%)", "hsl(160, 60%, 45%)", "hsl(280, 60%, 55%)",
  "hsl(35, 80%, 50%)", "hsl(0, 65%, 55%)", "hsl(190, 70%, 45%)",
  "hsl(330, 60%, 50%)", "hsl(100, 50%, 45%)",
];

type Analytics = {
  by_model: {
    model_name: string;
    provider: string;
    count: number;
    total_cost: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cached_tokens: number;
    total_tokens: number;
    avg_duration_ms: number;
  }[];
  by_day: {
    date: string;
    count: number;
    cost: number;
    input_tokens: number;
    output_tokens: number;
    cached_tokens: number;
  }[];
  by_provider: { provider: string; count: number; total_cost: number; total_tokens: number }[];
  total_requests: number;
};

export function UsageContent({ analytics }: { analytics: Analytics }) {
  const router = useRouter();

  const totalCost = analytics.by_model.reduce((sum, m) => sum + m.total_cost, 0);
  const totalTokens = analytics.by_model.reduce((sum, m) => sum + m.total_tokens, 0);

  const dailyChartConfig: ChartConfig = {
    cost: { label: "Cost ($)", color: "hsl(215, 70%, 55%)" },
    input_tokens: { label: "Input Tokens", color: "hsl(160, 60%, 45%)" },
    output_tokens: { label: "Output Tokens", color: "hsl(280, 60%, 55%)" },
  };

  const providerChartConfig: ChartConfig = {};
  analytics.by_provider.forEach((p, i) => {
    providerChartConfig[p.provider] = { label: p.provider, color: COLORS[i % COLORS.length] };
  });

  const exportData = analytics.by_model.map((m) => ({
    model: m.model_name,
    provider: m.provider,
    requests: m.count,
    total_cost: m.total_cost,
    total_input_tokens: m.total_input_tokens,
    total_output_tokens: m.total_output_tokens,
    total_cached_tokens: m.total_cached_tokens,
    total_tokens: m.total_tokens,
    avg_duration_ms: m.avg_duration_ms,
  }));

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Usage & Cost Analytics
          <span className="text-muted-foreground ml-2 font-normal">
            {analytics.total_requests} API requests · {formatCost(totalCost)} total · {formatTokens(totalTokens)} tokens
          </span>
        </h2>
      </div>

      <CxFiltersBar
        showSearch={false}
        showStatusFilter={false}
        onRefresh={() => router.refresh()}
        onExportCSV={() => exportToCSV(exportData, "usage-by-model")}
        onExportJSON={() => exportToJSON(exportData, "usage-by-model")}
      />

      {analytics.total_requests === 0 ? (
        <CxEmptyState title="No usage data" description="No API requests found for this timeframe." />
      ) : (
        <>
          {/* Daily trends */}
          {analytics.by_day.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="border border-border rounded-md p-3 bg-card">
                <h3 className="text-xs font-medium text-muted-foreground mb-3">Daily Cost Trend</h3>
                <ChartContainer config={dailyChartConfig} className="h-[200px] w-full">
                  <AreaChart data={analytics.by_day} margin={{ left: 0, right: 0, top: 5, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area type="monotone" dataKey="cost" fill="hsl(215, 70%, 55%)" fillOpacity={0.15} stroke="hsl(215, 70%, 55%)" strokeWidth={2} name="Cost ($)" />
                  </AreaChart>
                </ChartContainer>
              </div>

              <div className="border border-border rounded-md p-3 bg-card">
                <h3 className="text-xs font-medium text-muted-foreground mb-3">Daily Token Usage</h3>
                <ChartContainer config={dailyChartConfig} className="h-[200px] w-full">
                  <BarChart data={analytics.by_day} margin={{ left: 0, right: 0, top: 5, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => formatTokens(v)} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="input_tokens" fill="hsl(160, 60%, 45%)" stackId="tokens" radius={[0, 0, 0, 0]} name="Input" />
                    <Bar dataKey="output_tokens" fill="hsl(280, 60%, 55%)" stackId="tokens" radius={[2, 2, 0, 0]} name="Output" />
                  </BarChart>
                </ChartContainer>
              </div>
            </div>
          )}

          {/* Provider breakdown */}
          {analytics.by_provider.length > 1 && (
            <div className="border border-border rounded-md p-3 bg-card">
              <h3 className="text-xs font-medium text-muted-foreground mb-3">Cost by Provider</h3>
              <div className="flex items-center gap-6">
                <ChartContainer config={providerChartConfig} className="h-[160px] w-[160px]">
                  <PieChart>
                    <Pie data={analytics.by_provider} dataKey="total_cost" nameKey="provider" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                      {analytics.by_provider.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
                <div className="flex-1 space-y-2">
                  {analytics.by_provider.map((p, i) => (
                    <div key={p.provider} className="flex items-center gap-3 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="font-medium flex-1">{p.provider}</span>
                      <span className="text-muted-foreground">{p.count} reqs</span>
                      <span className="font-mono">{formatCost(p.total_cost)}</span>
                      <span className="text-muted-foreground">{formatTokens(p.total_tokens)} tok</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Model breakdown table */}
          <div className="border border-border rounded-md bg-card">
            <div className="px-3 py-2 border-b border-border">
              <h3 className="text-xs font-medium text-muted-foreground">Usage by Model</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-1.5 px-3 font-medium">Model</th>
                    <th className="text-left py-1.5 px-3 font-medium">Provider</th>
                    <th className="text-right py-1.5 px-3 font-medium">Requests</th>
                    <th className="text-right py-1.5 px-3 font-medium">Input Tokens</th>
                    <th className="text-right py-1.5 px-3 font-medium">Output Tokens</th>
                    <th className="text-right py-1.5 px-3 font-medium">Cached</th>
                    <th className="text-right py-1.5 px-3 font-medium">Total Tokens</th>
                    <th className="text-right py-1.5 px-3 font-medium">Cost</th>
                    <th className="text-right py-1.5 px-3 font-medium">Avg Duration</th>
                    <th className="text-right py-1.5 px-3 font-medium">% of Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.by_model.map((m) => (
                    <tr key={`${m.model_name}|${m.provider}`} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-1.5 px-3 font-medium">{m.model_name}</td>
                      <td className="py-1.5 px-3 text-muted-foreground">{m.provider}</td>
                      <td className="text-right py-1.5 px-3">{m.count}</td>
                      <td className="text-right py-1.5 px-3 font-mono">{formatTokens(m.total_input_tokens)}</td>
                      <td className="text-right py-1.5 px-3 font-mono">{formatTokens(m.total_output_tokens)}</td>
                      <td className="text-right py-1.5 px-3 font-mono">{formatTokens(m.total_cached_tokens)}</td>
                      <td className="text-right py-1.5 px-3 font-mono">{formatTokens(m.total_tokens)}</td>
                      <td className="text-right py-1.5 px-3 font-mono font-medium">{formatCost(m.total_cost)}</td>
                      <td className="text-right py-1.5 px-3 text-muted-foreground">{formatDuration(m.avg_duration_ms)}</td>
                      <td className="text-right py-1.5 px-3">
                        <div className="flex items-center gap-1 justify-end">
                          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full"
                              style={{ width: `${totalCost > 0 ? (m.total_cost / totalCost) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-[10px]">{totalCost > 0 ? ((m.total_cost / totalCost) * 100).toFixed(1) : 0}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Debug view */}
          <CxJsonViewer data={analytics} label="Raw Analytics Data" />
        </>
      )}
    </div>
  );
}
