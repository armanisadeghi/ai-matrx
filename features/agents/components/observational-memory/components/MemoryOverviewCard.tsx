"use client";

/**
 * MemoryOverviewCard
 *
 * Top-of-panel status card for Observational Memory on a single conversation.
 * Shows the persisted state (enabled/disabled, model, scope, enabled_at/by)
 * plus a live "degraded" warning when any `memory_error` event has fired.
 */

import React from "react";
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Clock,
  PowerOff,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectMemoryDegraded,
  selectMemoryLastError,
  selectMemoryMetadata,
} from "@/features/agents/redux/execution-system/observational-memory/observational-memory.selectors";
import { formatDateTime, formatRelativeTime } from "./format";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface MemoryOverviewCardProps {
  conversationId: string;
  className?: string;
}

export function MemoryOverviewCard({
  conversationId,
  className,
}: MemoryOverviewCardProps) {
  const metadata = useAppSelector(selectMemoryMetadata(conversationId));
  const degraded = useAppSelector(selectMemoryDegraded(conversationId));
  const lastError = useAppSelector(selectMemoryLastError(conversationId));

  const enabled = Boolean(metadata?.enabled);

  return (
    <div
      className={cn(
        "rounded-md border border-border bg-card/60 p-3 space-y-2",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={cn(
              "flex items-center justify-center w-7 h-7 rounded-md shrink-0",
              enabled
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Brain className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
              Observational Memory
            </div>
            <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
              {enabled ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Enabled for this conversation</span>
                </>
              ) : (
                <>
                  <PowerOff className="w-3.5 h-3.5 text-muted-foreground" />
                  <span>Disabled</span>
                </>
              )}
            </div>
          </div>
        </div>

        {degraded && (
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[10px] font-medium shrink-0"
            title={lastError?.error ?? "A memory operation failed. The conversation continues normally."}
          >
            <AlertTriangle className="w-3 h-3" />
            Degraded
          </div>
        )}
      </div>

      {/* Metadata grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <MetaRow
          icon={<Activity className="w-3 h-3" />}
          label="Model"
          value={metadata?.model ?? "default"}
          mono
        />
        <MetaRow
          icon={<Activity className="w-3 h-3" />}
          label="Scope"
          value={metadata?.scope ?? "thread"}
          mono
        />
        <MetaRow
          icon={<Clock className="w-3 h-3" />}
          label="Enabled"
          value={
            metadata?.enabled_at
              ? `${formatRelativeTime(metadata.enabled_at)} (${formatDateTime(metadata.enabled_at)})`
              : "—"
          }
        />
        <MetaRow
          icon={<User className="w-3 h-3" />}
          label="Enabled by"
          value={metadata?.enabled_by ?? "—"}
          mono
        />
        {metadata?.disabled_at && (
          <MetaRow
            icon={<PowerOff className="w-3 h-3" />}
            label="Disabled at"
            value={`${formatRelativeTime(metadata.disabled_at)} (${formatDateTime(metadata.disabled_at)})`}
          />
        )}
      </div>

      {degraded && lastError && (
        <div className="text-[11px] bg-amber-500/5 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded p-2">
          <div className="font-medium mb-0.5">
            Memory error — conversation continues normally
          </div>
          <div className="text-muted-foreground">
            <span className="font-mono">{lastError.phase ?? "unknown"}</span>
            {" · "}
            {lastError.error ?? "No details"}
            <ErrorAlchemyMenu error={lastError.error} />
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({
  icon,
  label,
  value,
  mono,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="flex items-center gap-1 text-muted-foreground/80 shrink-0">
        {icon}
        {label}:
      </span>
      <span
        className={cn(
          "truncate text-foreground",
          mono && "font-mono text-[11px]",
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
