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
 * Every state is honest (folder-sync SCOPE 31, law 4):
 *   - USAGE NOT MEASURED — `files.user_storage_usage` holds no row, so the RPC
 *     synthesizes zeros. The chip says "usage being recalculated" and draws no
 *     bar, because "0 of 5 GB" about an unmeasured account is a lie.
 *   - OVER QUOTA / BLOCKED — the reason, plus a real link to the plan page.
 *   - COULD NOT READ — says so with a Retry, never a silent empty corner.
 *   - Not signed in / first fetch in flight — renders nothing, deliberately
 *     (there is nothing true to say yet, and a flash is not information).
 *
 * The plan NAME comes from billing (`billing.plan_status`), not from the
 * retiring `files.account_tiers` ladder — folder-sync D11.
 *
 * Backed by `useStorageQuota` (direct-to-Supabase `get_usage_status`).
 */

"use client";

import Link from "next/link";
import { HardDrive, AlertTriangle, RefreshCw, Gauge } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useStorageQuota } from "@/features/files/hooks/useStorageQuota";
import { formatFileSize } from "@/features/files/utils/format";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface StorageQuotaChipProps {
  className?: string;
}

/** Where a user goes to buy more storage. The public plan page is the one
 *  purchasable surface today (`app/(public)/pricing/page.tsx`). */
export const PLAN_PAGE_HREF = "/pricing";

export function StorageQuotaChip({ className }: StorageQuotaChipProps) {
  const { summary, data, error, loading, refresh } = useStorageQuota();

  if (error) {
    return (
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-[12px]",
          className,
        )}
        role="status"
      >
        <span className="flex items-center gap-1.5 truncate text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">Storage usage could not be read</span>
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-60"
        >
          <RefreshCw
            className={cn("h-3 w-3", loading && "animate-spin")}
            aria-hidden="true"
          />
          Retry
        </button>
        <ErrorAlchemyMenu />
      </div>
    );
  }

  if (!summary || !data) return null;

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

  const { unmeasured } = summary;
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

  const TitleIcon = isBlocked
    ? AlertTriangle
    : unmeasured
      ? Gauge
      : HardDrive;

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
              unmeasured
                ? "Storage usage is being recalculated"
                : maxLabel
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

            <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span className="truncate">
                {unmeasured
                  ? "Usage being recalculated"
                  : maxLabel
                    ? `${usedLabel} of ${maxLabel}`
                    : `${usedLabel} used`}
              </span>
              {severity === "blocked" || severity === "critical" ? (
                <Link
                  href={PLAN_PAGE_HREF}
                  className="shrink-0 font-medium text-destructive underline underline-offset-2 hover:opacity-80"
                >
                  {isBlocked ? "Get more storage" : "Upgrade"}
                </Link>
              ) : null}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          align="end"
          className="bg-popover text-popover-foreground border max-w-xs"
        >
          <QuotaTooltipBody
            data={data}
            planName={tierName}
            blockedReason={blockedReason}
          />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface QuotaTooltipBodyProps {
  data: ReturnType<typeof useStorageQuota>["data"];
  planName: string;
  blockedReason: string | null;
}

function QuotaTooltipBody({
  data,
  planName,
  blockedReason,
}: QuotaTooltipBodyProps) {
  if (!data) return null;
  const dailyMax = data.max_daily_upload_bytes;
  return (
    <div className="flex flex-col gap-1.5 py-0.5 text-[12px]">
      <div className="font-semibold">{planName} plan</div>
      {!data.ledger_measured ? (
        <div className="rounded border border-border bg-muted/40 px-2 py-1 text-muted-foreground">
          Nobody has measured this account&rsquo;s storage yet, so there is no
          number to show. It appears as soon as the usage ledger is built.
        </div>
      ) : null}
      <Row
        label="Storage"
        value={
          !data.ledger_measured
            ? "Being recalculated"
            : data.max_storage_bytes
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
        <div className="mt-1 flex flex-col gap-1 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-destructive">
          <span>{blockedReason}</span>
          <Link
            href={PLAN_PAGE_HREF}
            className="font-medium underline underline-offset-2"
          >
            See plans and add storage
          </Link>
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
