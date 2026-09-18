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
import { buildCxSourcePageExportConfig } from "@/features/cx-dashboard/utils/export";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_CX_DASHBOARD_SURFACE_NAME,
  createAdminCxDashboardScope,
} from "@/features/surfaces/manifests/admin-cx-dashboard.manifest";
import type { CxUsageAnalytics } from "@/features/cx-dashboard/types/cxDashboardTypes";
import {
  originClassColor,
  originClassLabel,
  sortByOriginOrder,
} from "@/lib/usage/originClass";

const COLORS = [
  "hsl(215, 70%, 55%)", "hsl(160, 60%, 45%)", "hsl(280, 60%, 55%)",
  "hsl(35, 80%, 50%)", "hsl(0, 65%, 55%)", "hsl(190, 70%, 45%)",
  "hsl(330, 60%, 50%)", "hsl(100, 50%, 45%)",
];

export function UsageContent({ analytics }: { analytics: CxUsageAnalytics }) {
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

  // Spend by witnessed origin, in the canonical trust order rather than by
  // size — the ladder itself is the information (a person at the top, platform
  // background work at the bottom), and a stable order keeps the bar readable
  // as the timeframe changes.
  const originRows = sortByOriginOrder(
    analytics.by_origin,
    (o) => o.origin_class,
  );
  const originCost = originRows.reduce((sum, o) => sum + o.total_cost, 0);

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

  const modelColumns: MatrxColumnDef<CxUsageAnalytics["by_model"][number]>[] = [
    { accessorKey: "model_name", header: "Model", width: 200, cell: (row) => <span className="font-medium whitespace-nowrap">{row.model_name}</span> },
    { accessorKey: "provider", header: "Provider", width: 130, cell: (row) => <span className="text-muted-foreground whitespace-nowrap">{row.provider}</span> },
    { accessorKey: "count", header: "Requests", align: "right", width: 100, className: "whitespace-nowrap", cell: (row) => <span className="whitespace-nowrap tabular-nums">{row.count}</span> },
    { accessorKey: "total_input_tokens", header: "Input tokens", align: "right", width: 120, className: "whitespace-nowrap", cell: (row) => <span className="font-mono whitespace-nowrap">{formatTokens(row.total_input_tokens)}</span> },
    { accessorKey: "total_output_tokens", header: "Output tokens", align: "right", width: 120, className: "whitespace-nowrap", cell: (row) => <span className="font-mono whitespace-nowrap">{formatTokens(row.total_output_tokens)}</span> },
    { accessorKey: "total_cached_tokens", header: "Cached", align: "right", width: 100, className: "whitespace-nowrap", cell: (row) => <span className="font-mono whitespace-nowrap">{formatTokens(row.total_cached_tokens)}</span> },
    { accessorKey: "total_tokens", header: "Total tokens", align: "right", width: 120, className: "whitespace-nowrap", cell: (row) => <span className="font-mono whitespace-nowrap">{formatTokens(row.total_tokens)}</span> },
    { accessorKey: "total_cost", header: "Cost", align: "right", width: 110, className: "whitespace-nowrap", cell: (row) => <span className="font-mono font-medium whitespace-nowrap">{formatCost(row.total_cost)}</span> },
    { accessorKey: "avg_duration_ms", header: "Avg duration", align: "right", width: 110, className: "whitespace-nowrap", cell: (row) => <span className="whitespace-nowrap text-muted-foreground">{formatDuration(row.avg_duration_ms)}</span> },
    {
      id: "cost_share",
      header: "Cost share",
      accessorFn: (row) => totalCost > 0 ? (row.total_cost / totalCost) * 100 : 0,
      align: "right",
      width: 130,
      cell: (row) => {
        const share = totalCost > 0 ? (row.total_cost / totalCost) * 100 : 0;
        return (
          <div className="flex items-center justify-end gap-1 whitespace-nowrap">
            <div className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
            </div>
            <span className="text-[10px] tabular-nums">{share.toFixed(1)}%</span>
          </div>
        );
      },
    },
  ];

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_CX_DASHBOARD_SURFACE_NAME}
      getScope={() =>
        createAdminCxDashboardScope({
          dashboard_section: "usage",
          usage_analytics: analytics,
          usage_total_requests: analytics.total_requests,
        })
      }
    >
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

          {/* Origin breakdown — the witnessed trust axis */}
          {originRows.length > 0 && (
            <div className="border border-border rounded-md p-3 bg-card">
              <h3 className="text-xs font-medium text-muted-foreground mb-3">
                Cost by Origin
                <span className="ml-2 font-normal">
                  what kind of thing initiated the spend
                </span>
              </h3>

              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                {originRows.map((o) => (
                  <div
                    key={o.origin_class}
                    className="h-full"
                    style={{
                      width: `${originCost > 0 ? (o.total_cost / originCost) * 100 : 0}%`,
                      backgroundColor: originClassColor(o.origin_class),
                    }}
                    title={`${originClassLabel(o.origin_class)}: ${formatCost(o.total_cost)}`}
                  />
                ))}
              </div>

              <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {originRows.map((o) => (
                  <div
                    key={o.origin_class}
                    className="flex items-center gap-3 text-xs"
                  >
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: originClassColor(o.origin_class) }}
                    />
                    <span className="font-medium flex-1">
                      {originClassLabel(o.origin_class)}
                    </span>
                    <span className="text-muted-foreground">{o.count} reqs</span>
                    <span className="font-mono">{formatCost(o.total_cost)}</span>
                    <span className="text-muted-foreground w-16 text-right">
                      {formatTokens(o.total_tokens)} tok
                    </span>
                    <span className="w-10 text-right text-[10px]">
                      {originCost > 0
                        ? ((o.total_cost / originCost) * 100).toFixed(1)
                        : "0.0"}
                      %
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Model breakdown table */}
          <MatrxDataTable
            tableId="cx-dashboard-usage-by-model"
            data={analytics.by_model}
            columns={modelColumns}
            getRowId={(row) => JSON.stringify([row.model_name, row.provider])}
            toolbar={{
              title: "Usage by Model",
              search: true,
              searchPlaceholder: "Search models and providers…",
              refresh: { onRefresh: () => router.refresh() },
            }}
            copy={{
              label: "Usage by model",
              listLabel: "Usage by model (source page)",
              location: "/administration/chat/cx-dashboard/usage",
              rowKind: "cx-usage-by-model",
              listKind: "cx-usage-by-model",
              humanRow: (row) => [
                `Model: ${row.model_name}`,
                `Provider: ${row.provider}`,
                `Requests: ${row.count}`,
                `Cost: ${formatCost(row.total_cost)}`,
                `Tokens: ${formatTokens(row.total_tokens)}`,
              ].join("\n"),
              rowAttributes: (row) => ({
                model: row.model_name,
                provider: row.provider,
                requests: row.count,
              }),
              export: () => buildCxSourcePageExportConfig(exportData, "usage-by-model"),
            }}
          />

          {/* Debug view */}
          <CxJsonViewer data={analytics} label="Raw Analytics Data" />
        </>
      )}
    </div>
    </SurfaceRuntimeProvider>
  );
}
