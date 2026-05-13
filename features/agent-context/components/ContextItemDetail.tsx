"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil,
  MoreHorizontal,
  Copy,
  History,
  Archive,
  Trash2,
  Cable,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContextStatusBadge } from "./ContextStatusBadge";
import { ContextValuePreview } from "./ContextValuePreview";
import {
  STATUS_TRANSITIONS,
  STATUS_CONFIG,
  FETCH_HINT_CONFIG,
  SENSITIVITY_CONFIG,
  VALUE_TYPE_CONFIG,
} from "../constants";
import {
  useContextItem,
  useContextItemValue,
  useContextAccessSummary,
  useUpdateContextStatus,
  useDuplicateContextItem,
  useArchiveContextItem,
} from "../hooks/useContextItems";
import type { ContextItemStatus } from "../types";
import type { ScopeState } from "../hooks/useContextScope";

type Props = {
  itemId: string;
  scope: ScopeState;
};

export function ContextItemDetail({ itemId, scope }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { data: item, isLoading: itemLoading } = useContextItem(itemId);
  const { data: value, isLoading: valueLoading } = useContextItemValue(itemId);
  const { data: accessSummary } = useContextAccessSummary(itemId);
  const statusMutation = useUpdateContextStatus(scope.scopeType, scope.scopeId);
  const duplicateMutation = useDuplicateContextItem(
    scope.scopeType,
    scope.scopeId,
  );
  const archiveMutation = useArchiveContextItem(scope.scopeType, scope.scopeId);

  if (itemLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid md:grid-cols-[1fr_300px] gap-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">Item not found</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => router.back()}
        >
          Go back
        </Button>
      </div>
    );
  }

  const suggestedNext = STATUS_TRANSITIONS[item.status]?.[0];
  const suggestedConfig = suggestedNext ? STATUS_CONFIG[suggestedNext] : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-bold">{item.display_name}</h1>
          <p className="text-xs font-mono text-muted-foreground">{item.key}</p>
          <div className="flex items-center gap-2 mt-2">
            <ContextStatusBadge
              status={item.status}
              size="md"
              interactive
              onStatusChange={(status, note) =>
                statusMutation.mutate({
                  itemId: item.id,
                  status,
                  statusNote: note,
                })
              }
            />
            {item.status_note && (
              <span className="text-xs text-muted-foreground italic">
                {item.status_note}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {suggestedNext && suggestedConfig && (
            <Button
              size="sm"
              className={`text-xs gap-1 ${suggestedConfig.colorText}`}
              variant="outline"
              onClick={() =>
                statusMutation.mutate({
                  itemId: item.id,
                  status: suggestedNext,
                })
              }
            >
              {suggestedConfig.label} &rarr;
            </Button>
          )}
          <Button
            size="sm"
            className="text-xs gap-1"
            onClick={() =>
              startTransition(() =>
                router.push(`/app-context/items/${item.id}/edit`),
              )
            }
          >
            <Pencil className="h-3 w-3" /> Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                onClick={() => duplicateMutation.mutate(item.id)}
              >
                <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  startTransition(() =>
                    router.push(`/app-context/items/${item.id}/history`),
                  )
                }
              >
                <History className="h-3.5 w-3.5 mr-2" /> View History
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => archiveMutation.mutate(item.id)}
                className="text-destructive"
              >
                <Archive className="h-3.5 w-3.5 mr-2" /> Archive
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Body */}
      <div className="grid md:grid-cols-[1fr_280px] gap-4">
        {/* Left — Value */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold">Value</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {valueLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <ContextValuePreview item={item} value={value} mode="detail" />
            )}
            {value && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground">
                <span>Version {value.version}</span>
                <span>&middot;</span>
                <span>
                  Updated {new Date(value.created_at).toLocaleDateString()}
                </span>
                {value.authored_by && (
                  <>
                    <span>&middot;</span>
                    <span>by {value.authored_by}</span>
                  </>
                )}
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs"
                  onClick={() =>
                    startTransition(() =>
                      router.push(`/app-context/items/${item.id}/history`),
                    )
                  }
                >
                  View history &rarr;
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right — Metadata */}
        <div className="space-y-3">
          <Card>
            <CardContent className="p-3 space-y-3">
              <MetadataRow label="Category" value={item.category || "—"} />
              {item.tags && item.tags.length > 0 && (
                <MetadataRow label="Tags">
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((t) => (
                      <Badge
                        key={t}
                        variant="outline"
                        className="h-4 text-[10px] px-1"
                      >
                        {t}
                      </Badge>
                    ))}
                  </div>
                </MetadataRow>
              )}
              <MetadataRow label="Value Type">
                <Badge variant="secondary" className="h-5 text-[10px]">
                  {VALUE_TYPE_CONFIG[item.value_type].label}
                </Badge>
              </MetadataRow>
              <MetadataRow
                label="Fetch Hint"
                value={FETCH_HINT_CONFIG[item.fetch_hint].label}
              />
              <MetadataRow
                label="Sensitivity"
                value={SENSITIVITY_CONFIG[item.sensitivity].label}
              />
              <MetadataRow label="Source" value={item.source_type} />
              {item.review_interval_days && (
                <MetadataRow
                  label="Review"
                  value={`Every ${item.review_interval_days} days`}
                />
              )}
              {item.next_review_at && (
                <MetadataRow label="Next Review">
                  {item.is_overdue_review ? (
                    <Badge
                      variant="destructive"
                      className="h-4 text-[10px] px-1"
                    >
                      Overdue
                    </Badge>
                  ) : (
                    <span className="text-xs">
                      {new Date(item.next_review_at).toLocaleDateString()}
                    </span>
                  )}
                </MetadataRow>
              )}
            </CardContent>
          </Card>

          {/* Access summary */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Access Log
              </p>
              {accessSummary ? (
                <>
                  <p className="text-sm font-semibold">
                    {accessSummary.total_fetches} fetches
                  </p>
                  {accessSummary.last_fetched && (
                    <p className="text-[10px] text-muted-foreground">
                      Last:{" "}
                      {new Date(
                        accessSummary.last_fetched,
                      ).toLocaleDateString()}
                    </p>
                  )}
                  {accessSummary.useful_rate != null && (
                    <p className="text-[10px] text-muted-foreground">
                      {Math.round(accessSummary.useful_rate * 100)}% useful
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Never accessed
                </p>
              )}
            </CardContent>
          </Card>

          {/* Agent placeholder */}
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs gap-1 h-7"
          >
            <Cable className="h-3 w-3" /> Suggest Dependencies
            {/* TODO: Wire agent */}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MetadataRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-[11px] text-muted-foreground shrink-0">
        {label}
      </span>
      {children ?? (
        <span className="text-xs font-medium text-right">{value}</span>
      )}
    </div>
  );
}
