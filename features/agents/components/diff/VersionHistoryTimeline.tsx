"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  GitCompareArrows,
  ArrowRight,
  Loader2,
  ChevronDown,
  Atom,
} from "lucide-react";
import type { AgentVersionHistoryItem } from "@/features/agents/redux/agent-definition/thunks";
import { useSmartVersionFetch } from "@/features/agents/hooks/useSmartVersionFetch";
import type { EnrichedVersion } from "@/features/agents/hooks/useSmartVersionFetch";
import { formatChangeType } from "@/components/diff/engine/diff-utils";
import { VersionIdBadge } from "./VersionIdBadge";

interface VersionHistoryTimelineProps {
  agentId: string;
  versions: AgentVersionHistoryItem[];
  currentVersion: number | null;
  onCompare: (version: number, compareToVersion: number | "current") => void;
}

export function VersionHistoryTimeline({
  agentId,
  versions,
  currentVersion,
  onCompare,
}: VersionHistoryTimelineProps) {
  const {
    enrichedVersions,
    loading: enrichLoading,
    progress,
    fetchEnrichedHistory,
    fetchGap,
  } = useSmartVersionFetch(agentId, versions);

  const hasEnrichedData = enrichedVersions.some((v) => v.diffSummary);

  if (versions.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No version history
      </div>
    );
  }

  // If not enriched yet, show the prompt to load
  if (!hasEnrichedData && !enrichLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-center">
          <div className="text-sm font-medium mb-1">
            {versions.length} version{versions.length !== 1 ? "s" : ""}{" "}
            available
          </div>
          <p className="text-xs text-muted-foreground max-w-[320px]">
            Load the full history to see what changed at each version — which
            fields were modified, added, or removed.
          </p>
        </div>
        <Button
          variant="default"
          size="sm"
          className="gap-2"
          onClick={fetchEnrichedHistory}
        >
          <Atom className="w-4 h-4" />
          Load Full History
        </Button>

        {/* Still show basic timeline below as a preview */}
        <div className="w-full mt-4 border-t border-border pt-4 px-4">
          <BasicTimeline
            versions={enrichedVersions}
            currentVersion={currentVersion}
            onCompare={onCompare}
          />
        </div>
      </div>
    );
  }

  // Loading state
  if (enrichLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <div className="text-sm text-muted-foreground">
          Loading version details... {progress.fetched}/{progress.total}
        </div>
        <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{
              width: `${progress.total > 0 ? (progress.fetched / progress.total) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
    );
  }

  // Enriched view — the actual useful timeline
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-border">
        <div className="text-xs text-muted-foreground">
          {enrichedVersions.filter((v) => v.snapshotLoaded).length} of{" "}
          {versions.length} versions loaded
        </div>
      </div>

      {/* Enriched timeline as a table */}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className="text-left py-2 pr-3 font-medium w-[70px]">
              Version
            </th>
            <th className="text-left py-2 pr-3 font-medium w-[110px]">ID</th>
            <th className="text-left py-2 pr-3 font-medium w-[140px]">Date</th>
            <th className="text-left py-2 pr-3 font-medium">
              Changes from Previous
            </th>
            <th className="text-right py-2 font-medium w-[140px]">Compare</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {enrichedVersions.map((version, index) => {
            const prevVersion =
              index < enrichedVersions.length - 1
                ? enrichedVersions[index + 1]
                : null;
            const isLatest = version.version_number === currentVersion;
            const date = new Date(version.changed_at);

            // Check for gap
            const hasGap =
              prevVersion &&
              !prevVersion.snapshotLoaded &&
              version.snapshotLoaded;
            const gapVersions = hasGap
              ? getGapVersionNumbers(enrichedVersions, index)
              : [];

            return (
              <VersionRow
                key={version.version_number}
                version={version}
                prevVersion={prevVersion ?? undefined}
                isLatest={isLatest}
                currentVersion={currentVersion}
                date={date}
                gapVersions={gapVersions}
                onCompare={onCompare}
                onFetchGap={fetchGap}
              />
            );
          })}
        </tbody>
      </table>

      <div className="h-[50vh]" />
    </div>
  );
}

function VersionRow({
  version,
  prevVersion,
  isLatest,
  currentVersion,
  date,
  gapVersions,
  onCompare,
  onFetchGap,
}: {
  version: EnrichedVersion;
  prevVersion?: EnrichedVersion;
  isLatest: boolean;
  currentVersion: number | null;
  date: Date;
  gapVersions: number[];
  onCompare: (version: number, compareToVersion: number | "current") => void;
  onFetchGap: (versions: number[]) => void;
}) {
  const diff = version.diffSummary;
  const changedFields =
    diff?.root.filter((n) => n.changeType !== "unchanged") ?? [];

  return (
    <>
      <tr
        className={cn(
          "group hover:bg-muted/20 transition-colors",
          isLatest && "bg-primary/5",
        )}
      >
        {/* Version */}
        <td className="py-2.5 pr-3">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "w-2 h-2 rounded-full shrink-0",
                isLatest
                  ? "bg-primary"
                  : version.snapshotLoaded
                    ? "bg-primary/40"
                    : "bg-muted-foreground/30",
              )}
            />
            <span
              className={cn(
                "font-mono font-medium tabular-nums",
                isLatest && "text-primary",
              )}
            >
              v{version.version_number}
            </span>
          </div>
        </td>

        {/* Version ID */}
        <td className="py-2.5 pr-3">
          <VersionIdBadge versionId={version.version_id} showLabel={false} />
        </td>

        {/* Date */}
        <td className="py-2.5 pr-3 text-muted-foreground">
          {date.toLocaleDateString()}{" "}
          {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </td>

        {/* Changes */}
        <td className="py-2.5 pr-3">
          {version.change_note && (
            <div className="text-muted-foreground mb-1">
              {version.change_note}
            </div>
          )}
          {diff && changedFields.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {changedFields.map((n) => (
                <span
                  key={n.key}
                  className={cn(
                    "inline-block px-1.5 py-0.5 rounded text-[0.5625rem] font-medium",
                    n.changeType === "added"
                      ? "bg-green-950/40 text-green-400"
                      : n.changeType === "removed"
                        ? "bg-red-950/40 text-red-400"
                        : "bg-amber-950/40 text-amber-400",
                  )}
                >
                  {n.key}
                  {n.changeType === "added"
                    ? " +"
                    : n.changeType === "removed"
                      ? " −"
                      : ""}
                </span>
              ))}
            </div>
          ) : diff && changedFields.length === 0 ? (
            <span className="text-muted-foreground/50">No changes</span>
          ) : !version.snapshotLoaded ? (
            <span className="text-muted-foreground/40">—</span>
          ) : (
            <span className="text-muted-foreground/50">First version</span>
          )}
        </td>

        {/* Compare buttons */}
        <td className="py-2.5 text-right">
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {prevVersion && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[0.5625rem] gap-0.5 text-muted-foreground"
                onClick={() =>
                  onCompare(prevVersion.version_number, version.version_number)
                }
              >
                <ArrowRight className="w-2.5 h-2.5" />v
                {prevVersion.version_number}
              </Button>
            )}
            {!isLatest && currentVersion != null && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-[0.5625rem] gap-0.5 text-muted-foreground"
                onClick={() => onCompare(version.version_number, "current")}
              >
                <GitCompareArrows className="w-2.5 h-2.5" />
                Current
              </Button>
            )}
          </div>
        </td>
      </tr>

      {/* Gap row */}
      {gapVersions.length > 0 && (
        <tr>
          <td colSpan={5} className="py-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[0.625rem] gap-1 text-muted-foreground w-full justify-center"
              onClick={() => onFetchGap(gapVersions)}
            >
              <ChevronDown className="w-3 h-3" />
              Load {gapVersions.length} more version
              {gapVersions.length !== 1 ? "s" : ""}
            </Button>
          </td>
        </tr>
      )}
    </>
  );
}

/** Basic timeline shown before enrichment — just version numbers and dates */
function BasicTimeline({
  versions,
  currentVersion,
  onCompare,
}: {
  versions: EnrichedVersion[];
  currentVersion: number | null;
  onCompare: (version: number, compareToVersion: number | "current") => void;
}) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b border-border text-muted-foreground">
          <th className="text-left py-1.5 pr-3 font-medium w-[70px]">
            Version
          </th>
          <th className="text-left py-1.5 pr-3 font-medium w-[110px]">ID</th>
          <th className="text-left py-1.5 pr-3 font-medium">Date</th>
          <th className="text-left py-1.5 font-medium">Note</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/50">
        {versions.map((v) => {
          const date = new Date(v.changed_at);
          const isLatest = v.version_number === currentVersion;
          return (
            <tr
              key={v.version_number}
              className="group hover:bg-muted/20 cursor-pointer"
              onClick={() => onCompare(v.version_number, "current")}
            >
              <td className="py-1.5 pr-3">
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    isLatest && "text-primary font-medium",
                  )}
                >
                  v{v.version_number}
                </span>
              </td>
              <td className="py-1.5 pr-3" onClick={(e) => e.stopPropagation()}>
                <VersionIdBadge versionId={v.version_id} showLabel={false} />
              </td>
              <td className="py-1.5 pr-3 text-muted-foreground">
                {date.toLocaleDateString()}{" "}
                {date.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="py-1.5 text-muted-foreground">
                {v.change_note ?? "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function getGapVersionNumbers(
  versions: EnrichedVersion[],
  currentIndex: number,
): number[] {
  const gap: number[] = [];
  for (let i = currentIndex + 1; i < versions.length; i++) {
    if (versions[i].snapshotLoaded) break;
    gap.push(versions[i].version_number);
  }
  return gap;
}
