"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  CheckCircle,
  AlertTriangle,
  FileText,
  Cpu,
  ChevronRight,
  Activity,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ContextStatusBadge } from "./ContextStatusBadge";
import { ContextEmptyState } from "./ContextEmptyState";
import { STATUS_CONFIG, ATTENTION_STATUSES } from "../constants";
import type {
  ContextItemManifest,
  ContextDashboardStats,
  ContextCategoryHealth,
  ContextItemStatus,
} from "../types";
import {
  useContextDashboardStats,
  useContextCategoryHealth,
  useContextAttentionQueue,
  useUpdateContextStatus,
} from "../hooks/useContextItems";
import type { ScopeState } from "../hooks/useContextScope";

type Props = {
  scope: ScopeState;
};

export function ContextDashboard({ scope }: Props) {
  const { data: stats, isLoading: statsLoading } = useContextDashboardStats(
    scope.scopeType,
    scope.scopeId,
  );
  const { data: health, isLoading: healthLoading } = useContextCategoryHealth(
    scope.scopeType,
    scope.scopeId,
  );
  const { data: attention, isLoading: attentionLoading } =
    useContextAttentionQueue(scope.scopeType, scope.scopeId);
  const statusMutation = useUpdateContextStatus(scope.scopeType, scope.scopeId);

  if (statsLoading) return <DashboardSkeleton />;
  if (stats && stats.totalItems === 0)
    return <ContextEmptyState variant="no-items" />;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={Database}
          label="Total Items"
          value={stats?.totalItems ?? 0}
        />
        <StatCard
          icon={CheckCircle}
          label="Active & Verified"
          value={stats?.activeVerified ?? 0}
          accent="text-green-500"
        />
        <StatCard
          icon={AlertTriangle}
          label="Needs Attention"
          value={stats?.needsAttention ?? 0}
          accent="text-orange-500"
        />
        <StatCard
          icon={FileText}
          label="Empty / Stub"
          value={stats?.emptyStub ?? 0}
          accent="text-muted-foreground"
        />
      </div>

      {/* Two column layout */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Health by category */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold">
              Health by Category
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-2">
            {healthLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : health && health.length > 0 ? (
              health.map((cat) => (
                <CategoryHealthRow key={cat.category} category={cat} />
              ))
            ) : (
              <p className="text-xs text-muted-foreground py-2">
                No categories yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Attention queue */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Attention Queue
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[11px] gap-1 text-muted-foreground"
            >
              <Cpu className="h-3 w-3" /> Auto-Triage
              {/* TODO: Wire agent */}
            </Button>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1.5">
            {attentionLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : attention && attention.length > 0 ? (
              attention.slice(0, 8).map((item) => (
                <AttentionItem
                  key={item.id}
                  item={item}
                  onStatusChange={(status, note) =>
                    statusMutation.mutate({
                      itemId: item.id,
                      status,
                      statusNote: note,
                    })
                  }
                />
              ))
            ) : (
              <div className="py-4 text-center">
                <CheckCircle className="h-8 w-8 text-green-500/30 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">
                  All clear — no items need attention
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <Icon className={`h-4 w-4 ${accent || "text-muted-foreground"}`} />
        </div>
        <div>
          <p className={`text-xl font-bold leading-none ${accent || ""}`}>
            {value}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryHealthRow({ category }: { category: ContextCategoryHealth }) {
  const total = category.total || 1;
  const activeW = (category.active / total) * 100;
  const partialW = (category.partial / total) * 100;
  const stubW = (category.stub / total) * 100;
  const attentionW = (category.needsAttention / total) * 100;

  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium truncate">
            {category.category}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {category.total} items
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-muted flex overflow-hidden">
          {activeW > 0 && (
            <div
              className="bg-green-500 transition-all"
              style={{ width: `${activeW}%` }}
            />
          )}
          {partialW > 0 && (
            <div
              className="bg-yellow-500 transition-all"
              style={{ width: `${partialW}%` }}
            />
          )}
          {stubW > 0 && (
            <div
              className="bg-slate-400 transition-all"
              style={{ width: `${stubW}%` }}
            />
          )}
          {attentionW > 0 && (
            <div
              className="bg-orange-500 transition-all"
              style={{ width: `${attentionW}%` }}
            />
          )}
        </div>
      </div>
      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
    </div>
  );
}

function AttentionItem({
  item,
  onStatusChange,
}: {
  item: ContextItemManifest;
  onStatusChange: (status: ContextItemStatus, note?: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const config = STATUS_CONFIG[item.status];

  const ctaLabel =
    item.status === "needs_review"
      ? "Review"
      : item.status === "ai_enriched"
        ? "Verify"
        : item.status === "stale"
          ? "Refresh"
          : item.status === "needs_update"
            ? "Update"
            : item.status === "partial"
              ? "Continue"
              : "View";

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50 cursor-pointer transition-colors ${isPending ? "opacity-60" : ""}`}
      onClick={() =>
        startTransition(() => router.push(`/agent-context/items/${item.id}`))
      }
    >
      <span className={`h-2 w-2 rounded-full shrink-0 ${config.colorDot}`} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{item.display_name}</p>
        <p className="text-[10px] text-muted-foreground truncate">
          {config.tagline}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-[11px] px-2 shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          startTransition(() => router.push(`/agent-context/items/${item.id}`));
        }}
      >
        {ctaLabel}
      </Button>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}
