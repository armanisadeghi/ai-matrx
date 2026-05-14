"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContextStatusBadge } from "./ContextStatusBadge";
import {
  useContextAccessVolume,
  useContextUsageRankings,
  useContextManifest,
} from "../hooks/useContextItems";
import type { ScopeState } from "../hooks/useContextScope";
import {
  Activity,
  Eye,
  EyeOff,
  ThumbsUp,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { isContextReviewOverdue } from "../utils/contextItemPresentation";

type Props = {
  scope: ScopeState;
};

export function ContextAnalytics({ scope }: Props) {
  const { data: volume, isLoading: volumeLoading } = useContextAccessVolume(
    scope.scopeType,
    scope.scopeId,
  );
  const { data: rankings, isLoading: rankingsLoading } =
    useContextUsageRankings(scope.scopeType, scope.scopeId);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const totalFetches = volume?.reduce((sum, v) => sum + v.count, 0) ?? 0;
  const uniqueAccessed =
    rankings?.filter((r) => r.total_fetches > 0).length ?? 0;
  const totalItems = rankings?.length ?? 0;
  const neverAccessed =
    rankings?.filter((r) => r.total_fetches === 0).length ?? 0;
  const withUseful = rankings?.filter((r) => r.useful_rate != null);
  const avgUseful =
    withUseful && withUseful.length > 0
      ? withUseful.reduce((sum, r) => sum + (r.useful_rate ?? 0), 0) /
        withUseful.length
      : null;

  if (volumeLoading && rankingsLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AnalyticsStat
          icon={Activity}
          label="Total Fetches (30d)"
          value={totalFetches.toLocaleString()}
        />
        <AnalyticsStat
          icon={Eye}
          label="Items Accessed"
          value={`${uniqueAccessed} / ${totalItems}`}
        />
        <AnalyticsStat
          icon={EyeOff}
          label="Never Accessed"
          value={String(neverAccessed)}
          accent={neverAccessed > 0 ? "text-red-400" : undefined}
        />
        <AnalyticsStat
          icon={ThumbsUp}
          label="Useful Rate"
          value={avgUseful != null ? `${Math.round(avgUseful * 100)}%` : "—"}
        />
      </div>

      {/* Fetch volume chart (simple bar chart) */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 text-muted-foreground" /> Fetch Volume
            (Last 30 Days)
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {volume && volume.length > 0 ? (
            <SimpleBarChart data={volume} />
          ) : (
            <div className="py-8 text-center">
              <p className="text-xs text-muted-foreground">
                No fetch data available yet
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage rankings table */}
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-muted-foreground" /> Item Usage
            Rankings
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {rankings && rankings.length > 0 ? (
            <div className="border border-border rounded-lg overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-xs">
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Fetches</TableHead>
                    <TableHead>Last Fetched</TableHead>
                    <TableHead className="text-right">Useful</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead className="w-[80px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankings
                    .sort((a, b) => b.total_fetches - a.total_fetches)
                    .map((item) => {
                      const isNever = item.total_fetches === 0;
                      const lowUseful =
                        item.useful_rate != null &&
                        item.useful_rate < 0.3 &&
                        item.total_fetches > 5;
                      return (
                        <TableRow
                          key={item.id}
                          className={`text-xs cursor-pointer hover:bg-muted/50 ${isNever ? "bg-red-500/5" : lowUseful ? "bg-orange-500/5" : ""}`}
                          onClick={() =>
                            startTransition(() =>
                              router.push(`/agent-context/items/${item.id}`),
                            )
                          }
                        >
                          <TableCell className="font-medium truncate max-w-[180px]">
                            {item.display_name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.category || "—"}
                          </TableCell>
                          <TableCell>
                            <ContextStatusBadge
                              status={item.status}
                              size="sm"
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {item.total_fetches}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {item.last_fetched
                              ? new Date(item.last_fetched).toLocaleDateString()
                              : "Never"}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.useful_rate != null
                              ? `${Math.round(item.useful_rate * 100)}%`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {item.char_count
                              ? `${item.char_count.toLocaleString()}c`
                              : "—"}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {isNever && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-[10px] px-1.5 text-destructive"
                              >
                                Archive
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-xs text-muted-foreground">
                No items to analyze
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stale detection */}
      {rankings && (
        <StaleDetection
          items={rankings.filter((r) => isContextReviewOverdue(r))}
        />
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function AnalyticsStat({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Icon className={`h-4 w-4 ${accent || "text-muted-foreground"}`} />
        </div>
        <div>
          <p className={`text-lg font-bold leading-none ${accent || ""}`}>
            {value}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SimpleBarChart({ data }: { data: { date: string; count: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-px h-32">
      {data.map((d) => (
        <div
          key={d.date}
          className="flex-1 bg-primary/20 hover:bg-primary/40 transition-colors rounded-t-sm relative group min-w-[4px]"
          style={{ height: `${(d.count / max) * 100}%` }}
          title={`${d.date}: ${d.count} fetches`}
        >
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-popover border border-border rounded px-1.5 py-0.5 text-[9px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
            {d.count}
          </div>
        </div>
      ))}
    </div>
  );
}

function StaleDetection({
  items,
}: {
  items: { id: string; display_name: string; next_review_at: string | null }[];
}) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-amber-500">
            Stale Items ({items.length})
          </CardTitle>
          <Button variant="outline" size="sm" className="h-6 text-[10px] px-2">
            Mark all as needs_update
          </Button>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="space-y-1">
          {items.slice(0, 10).map((item) => {
            const overdueDays = item.next_review_at
              ? Math.floor(
                  (Date.now() - new Date(item.next_review_at).getTime()) /
                    86400000,
                )
              : 0;
            return (
              <div
                key={item.id}
                className="flex items-center justify-between py-1"
              >
                <span className="text-xs">{item.display_name}</span>
                <Badge variant="destructive" className="h-4 text-[10px] px-1">
                  {overdueDays}d overdue
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
