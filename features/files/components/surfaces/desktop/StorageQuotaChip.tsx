/**
 * features/files/components/surfaces/desktop/StorageQuotaChip.tsx
 *
 * Compact storage-usage indicator for the cloud-files sidebar. Mirrors
 * the Dropbox / Google Drive footer:
 *   - Tier name + percent used.
 *   - Tinted progress bar (turns amber at 80 %, red at 95 %, solid red
 *     when the tier hard-blocks the account).
 *   - Hover tooltip with bytes detail, file count, daily-upload usage,
 *     and the blocked reason (if any).
 *
 * Renders nothing (returns `null`) when:
 *   - The user isn't authenticated yet.
 *   - The first fetch hasn't completed (avoids layout flash).
 *   - The fetch errors out (silent; we don't want a noisy chip).
 *
 * Backed by `useStorageQuota` against `GET /files/usage`.
 */

"use client";

import { HardDrive, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStorageQuota } from "@/features/files/hooks/useStorageQuota";
import { formatFileSize } from "@/features/files/utils/format";

export interface StorageQuotaChipProps {
  className?: string;
}

export function StorageQuotaChip({ className }: StorageQuotaChipProps) {
  const { summary, data, error } = useStorageQuota();

  if (error || !summary || !data) return null;

  const {
    tierName,
    bytesUsed,
    maxBytes,
    fraction,
    percent,
    isBlocked,
    blockedReason,
    severity,
  } = summary;

  const usedLabel = formatFileSize(bytesUsed);
  const maxLabel = maxBytes ? formatFileSize(maxBytes) : null;

  // Severity-driven colors. Default tracks the primary token; warning /
  // critical / blocked switch to amber / red so users notice before the
  // upload fails.
  const barClass = (() => {
    switch (severity) {
      case "blocked":
      case "critical":
        return "bg-destructive";
      case "warning":
        return "bg-amber-500";
      default:
        return "bg-primary";
    }
  })();

  const TitleIcon = isBlocked ? AlertTriangle : HardDrive;

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex flex-col gap-1.5 rounded-md border bg-card/40 px-2.5 py-2 text-[12px]",
              isBlocked && "border-destructive/40 bg-destructive/5",
              className,
            )}
            role="status"
            aria-label={
              maxLabel
                ? `Storage: ${usedLabel} of ${maxLabel} used (${percent}%)`
                : `Storage: ${usedLabel} used`
            }
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="flex items-center gap-1.5 text-foreground/90 truncate">
                <TitleIcon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isBlocked ? "text-destructive" : "text-muted-foreground",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate font-medium">{tierName}</span>
              </span>
              {percent !== null && (
                <span
                  className={cn(
                    "tabular-nums text-[11px]",
                    severity === "blocked" || severity === "critical"
                      ? "text-destructive"
                      : severity === "warning"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground",
                  )}
                >
                  {percent}%
                </span>
              )}
            </div>

            {fraction !== null ? (
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                aria-hidden="true"
              >
                <div
                  className={cn("h-full rounded-full transition-all", barClass)}
                  style={{ width: `${Math.max(fraction * 100, 2)}%` }}
                />
              </div>
            ) : null}

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="truncate">
                {maxLabel ? `${usedLabel} of ${maxLabel}` : `${usedLabel} used`}
              </span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="end"
          className="bg-popover text-popover-foreground border max-w-xs"
        >
          <QuotaTooltipBody data={data} blockedReason={blockedReason} />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface QuotaTooltipBodyProps {
  data: ReturnType<typeof useStorageQuota>["data"];
  blockedReason: string | null;
}

function QuotaTooltipBody({ data, blockedReason }: QuotaTooltipBodyProps) {
  if (!data) return null;
  const dailyMax = data.max_daily_upload_bytes;
  return (
    <div className="flex flex-col gap-1.5 py-0.5 text-[12px]">
      <div className="font-semibold">{data.tier_name} plan</div>
      <Row
        label="Storage"
        value={
          data.max_storage_bytes
            ? `${formatFileSize(data.bytes_used)} / ${formatFileSize(data.max_storage_bytes)}`
            : `${formatFileSize(data.bytes_used)} used`
        }
      />
      <Row
        label="Files"
        value={
          data.max_files
            ? `${data.files_count.toLocaleString()} / ${data.max_files.toLocaleString()}`
            : data.files_count.toLocaleString()
        }
      />
      <Row
        label="Today's uploads"
        value={
          dailyMax
            ? `${formatFileSize(data.daily_upload_bytes)} of ${formatFileSize(dailyMax)}`
            : formatFileSize(data.daily_upload_bytes)
        }
      />
      {data.max_file_size_bytes ? (
        <Row
          label="Max file size"
          value={formatFileSize(data.max_file_size_bytes)}
        />
      ) : null}
      {blockedReason ? (
        <div className="mt-1 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-destructive">
          {blockedReason}
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
