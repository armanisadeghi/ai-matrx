"use client";

import { useState } from "react";
import { Badge, Button, Chip, ChipSet } from "@ai-matrx/design-system/controls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@ai-matrx/design-system";
import { cn } from "@ai-matrx/design-system";
import { toast } from "@ai-matrx/chat/host/notify";
import { supabase } from "@ai-matrx/chat/host/db";
import { useAgentDuplicateFlow } from "@/features/agents/hooks/useAgentDuplicateFlow";
import {
  Copy,
  GitCompareArrows,
  ArrowRight,
  ChevronDown,
  Atom,
  ShieldAlert,
  AlertTriangle,
} from "lucide-react";
import type { AgentVersionHistoryItem } from "@ai-matrx/chat/agents/types/agent-definition.types";
import { useSmartVersionFetch } from "@/features/agents/hooks/useSmartVersionFetch";
import type { EnrichedVersion } from "@/features/agents/hooks/useSmartVersionFetch";
import { formatChangeType } from "@ai-matrx/diff/structural";
import { VersionIdBadge } from "@/features/agents/components/diff/VersionIdBadge";
import {
  MOBILE_TABLE,
  MOBILE_TABLE_CELL,
  MOBILE_TABLE_FROZEN_CELL,
  MOBILE_TABLE_FROZEN_HEAD,
} from "@/components/official/mobile-table/mobileTable";
import { ErrorAlchemyMenu } from "@ai-matrx/chat/host/ui-slots";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";

import { Spinner } from "@/components/ui/loaders/Spinner";
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
    failedVersions,
    failureReason,
    fetchEnrichedHistory,
    fetchGap,
  } = useSmartVersionFetch(agentId, versions);

  // Any row copies into a NEW agent through the one Duplicate dialog, with
  // that version preselected (the current one copies the agent as it is now).
  const duplicateFlow = useAgentDuplicateFlow();
  const onDuplicate = (version: { version_id: string }) =>
    void duplicateFlow.openDuplicate({ agentId, versionId: version.version_id });

  const hasEnrichedData = enrichedVersions.some((v) => v.diffSummary);

  if (versions.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 type-body text-muted-foreground">
        No version history
      </div>
    );
  }

  // If not enriched yet, show the prompt to load
  if (!hasEnrichedData && !enrichLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="text-center">
          <div className="type-title mb-1">
            {versions.length} version{versions.length !== 1 ? "s" : ""}{" "}
            available
          </div>
          <p className="type-secondary text-muted-foreground max-w-[320px]">
            Load history to see what changed in each version
          </p>
        </div>

        {/* A load that ran and failed must never fall back to looking like a
            load that was never started. */}
        {failedVersions.length > 0 && (
          <div className="flex items-start gap-2 max-w-[420px] px-3 py-2 rounded-md border border-destructive/30 bg-destructive/10 type-secondary text-destructive-ink">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              {failedVersions.length} of {progress.total} snapshot
              {failedVersions.length !== 1 ? "s" : ""} could not be read
              {failureReason ? `: ${failureReason}` : "."} Retrying loads the
              ones that are readable.
            </span>
            <ErrorAlchemyMenu />
          </div>
        )}
        <Button
          icon={<Atom />}
          variant="primary"
          onClick={fetchEnrichedHistory}
        >
          Load Full History
        </Button>

        {/* Still show basic timeline below as a preview */}
        <div className="w-full mt-4 border-t border-border pt-4 px-4">
          <BasicTimeline
            versions={enrichedVersions}
            currentVersion={currentVersion}
            onCompare={onCompare}
            onDuplicate={onDuplicate}
            duplicating={duplicateFlow.isDuplicating}
          />
        </div>
        {duplicateFlow.dialog}
      </div>
    );
  }

  // Loading state
  if (enrichLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Spinner size="md" className="text-primary" />
        <div className="type-body text-muted-foreground">
          {/* read-gate-exempt: fetch progress shown only while the fetch is in flight, never a result count */}
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
        <div className="type-secondary text-muted-foreground">
          {/* read-gate-exempt: this is the tally of versions whose read succeeded, with the failed ones counted beside it */}
          {enrichedVersions.filter((v) => v.snapshotLoaded).length} of{" "}
          {versions.length} versions loaded
          {failedVersions.length > 0 && (
            <span className="text-destructive">
              {" "}
              · {failedVersions.length} could not be read
              <ErrorAlchemyMenu error={failureReason ?? "Some version snapshots could not be read"} />
            </span>
          )}
        </div>
      </div>

      {/* Enriched timeline as a table */}
      <table className={cn("type-secondary", MOBILE_TABLE)}>
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th className={cn("text-left py-2 pr-3 font-medium w-[70px]", MOBILE_TABLE_FROZEN_HEAD, "max-sm:min-w-[64px]")}>
              Version
            </th>
            <th className={cn("text-left py-2 pr-3 font-medium w-[110px]", MOBILE_TABLE_CELL)}>ID</th>
            <th className={cn("text-left py-2 pr-3 font-medium w-[140px]", MOBILE_TABLE_CELL)}>Date</th>
            <th className={cn("text-left py-2 pr-3 font-medium", MOBILE_TABLE_CELL)}>
              Changes from Previous
            </th>
            <th className={cn("text-right py-2 font-medium w-[170px]", MOBILE_TABLE_CELL)}>Actions</th>
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
                agentId={agentId}
                version={version}
                prevVersion={prevVersion ?? undefined}
                isLatest={isLatest}
                currentVersion={currentVersion}
                date={date}
                gapVersions={gapVersions}
                onCompare={onCompare}
                onFetchGap={fetchGap}
                onDuplicate={onDuplicate}
                duplicating={duplicateFlow.isDuplicating}
              />
            );
          })}
        </tbody>
      </table>

      <div className="h-[50dvh]" />
      {duplicateFlow.dialog}
    </div>
  );
}

function VersionRow({
  agentId,
  version,
  prevVersion,
  isLatest,
  currentVersion,
  date,
  gapVersions,
  onCompare,
  onFetchGap,
  onDuplicate,
  duplicating,
}: {
  agentId: string;
  version: EnrichedVersion;
  prevVersion?: EnrichedVersion;
  isLatest: boolean;
  currentVersion: number | null;
  date: Date;
  gapVersions: number[];
  onCompare: (version: number, compareToVersion: number | "current") => void;
  onFetchGap: (versions: number[]) => void;
  onDuplicate: (version: EnrichedVersion) => void;
  duplicating: boolean;
}) {
  const diff = version.diffSummary;
  const changedFields =
    diff?.root.filter((n) => n.changeType !== "unchanged") ?? [];
  // Optimistic mirror of the manual declaration — the RPC is the authority.
  const [declared, setDeclared] = useState<string | null>(
    version.contract_break_declared ?? null,
  );

  async function declareBreak(kind: "input" | "output" | "both" | null) {
    const previous = declared;
    setDeclared(kind);
    const { error } = await supabase.rpc("agx_declare_contract_break", {
      p_agent_id: agentId,
      p_version_number: version.version_number,
      p_kind: kind ?? undefined,
    });
    if (error) {
      setDeclared(previous);
      toast.error(`Couldn't record the contract break: ${error.message}`);
    } else {
      toast.success(
        kind
          ? `v${version.version_number} marked as a ${kind} contract break.`
          : `Contract-break declaration cleared for v${version.version_number}.`,
      );
    }
  }

  const autoChange = version.contract_change || null;
  const effectiveChange = declared ?? autoChange;

  return (
    <>
      <tr
        className={cn(
          "group hover:bg-muted/20 transition-colors",
          isLatest && "bg-primary/5",
        )}
      >
        {/* Version */}
        <td className={cn("py-2.5 pr-3", MOBILE_TABLE_FROZEN_CELL, "max-sm:min-w-[64px]")}>
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
        <td className={cn("py-2.5 pr-3", MOBILE_TABLE_CELL)}>
          <VersionIdBadge versionId={version.version_id} showLabel={false} />
        </td>

        {/* Date */}
        <td className={cn("py-2.5 pr-3 text-muted-foreground", MOBILE_TABLE_CELL)}>
          {date.toLocaleDateString()}{" "}
          {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </td>

        {/* Changes */}
        <td className="py-2.5 pr-3 max-sm:min-w-[12rem]">
          <div className="mb-1 flex flex-wrap items-center gap-1">
            {effectiveChange && (
              <Badge
                tone="warning"
                title={
                  declared
                    ? "Manually declared: the way this agent is used could break at this version."
                    : "The declared input/output structure changed at this version — pinned callers and saved sample inputs may no longer fit."
                }
              >
                {`Contract: ${effectiveChange}${declared ? " (declared)" : ""}`}
              </Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  icon={<ShieldAlert />} aria-label="Mark this version as a contract break the hashes cannot see (e.g. a prompt-level output change)"
                  variant="quiet"
                  className="opacity-0 transition-opacity group-hover:opacity-100 max-sm:opacity-100"
                  title="Mark this version as a contract break the hashes cannot see (e.g. a prompt-level output change)"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => void declareBreak("input")}>
                  Declare input break
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void declareBreak("output")}>
                  Declare output break
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void declareBreak("both")}>
                  Declare input + output break
                </DropdownMenuItem>
                {declared && (
                  <DropdownMenuItem onClick={() => void declareBreak(null)}>
                    Clear declaration
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {version.change_note && (
            <div className="text-muted-foreground mb-1">
              {version.change_note}
            </div>
          )}
          {diff && changedFields.length > 0 ? (
            <ChipSet>
              {changedFields.map((n) => (
                <Chip
                  key={n.key}
                  tone={
                    n.changeType === "added"
                      ? "success"
                      : n.changeType === "removed"
                        ? "destructive"
                        : "warning"
                  }
                  label={`${humanizeIdentifier(n.key) || n.key}${
                    n.changeType === "added" ? " +" : n.changeType === "removed" ? " −" : ""
                  }`}
                />
              ))}
            </ChipSet>
          ) : diff && changedFields.length === 0 ? (
            <span className="text-muted-foreground/50">No changes</span>
          ) : !version.snapshotLoaded ? (
            <span className="text-muted-foreground/40">—</span>
          ) : (
            <span className="text-muted-foreground/50">First version</span>
          )}
        </td>

        {/* Compare buttons */}
        <td className={cn("py-2.5 text-right", MOBILE_TABLE_CELL)}>
          <div className="flex items-center justify-end gap-1 transition-opacity max-sm:opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
            {prevVersion && (
              <Button
                icon={<ArrowRight />}
                variant="quiet"
                onClick={() =>
                  onCompare(prevVersion.version_number, version.version_number)
                }
              >v
                {prevVersion.version_number}
              </Button>
            )}
            {!isLatest && currentVersion != null && (
              <Button
                icon={<GitCompareArrows />}
                variant="quiet"
                onClick={() => onCompare(version.version_number, "current")}
              >
                Current
              </Button>
            )}
            <Button
              icon={<Copy />}
              variant="quiet"
              disabled={duplicating}
              aria-label={`Duplicate v${version.version_number} as a new agent`}
              title={`Duplicate v${version.version_number} as a new agent`}
              onClick={() => onDuplicate(version)}
            />
          </div>
        </td>
      </tr>

      {/* Gap row */}
      {gapVersions.length > 0 && (
        <tr>
          <td colSpan={5} className="py-1">
            <Button
              icon={<ChevronDown />}
              variant="quiet"
              className="w-full justify-center"
              onClick={() => onFetchGap(gapVersions)}
            >
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
  onDuplicate,
  duplicating,
}: {
  versions: EnrichedVersion[];
  currentVersion: number | null;
  onCompare: (version: number, compareToVersion: number | "current") => void;
  onDuplicate: (version: EnrichedVersion) => void;
  duplicating: boolean;
}) {
  return (
    <table className={cn("type-secondary", MOBILE_TABLE)}>
      <thead>
        <tr className="border-b border-border text-muted-foreground">
          <th className={cn("text-left py-1.5 pr-3 font-medium w-[70px]", MOBILE_TABLE_FROZEN_HEAD, "max-sm:min-w-[64px]")}>
            Version
          </th>
          <th className={cn("text-left py-1.5 pr-3 font-medium w-[110px]", MOBILE_TABLE_CELL)}>ID</th>
          <th className={cn("text-left py-1.5 pr-3 font-medium", MOBILE_TABLE_CELL)}>Date</th>
          <th className={cn("text-left py-1.5 font-medium", MOBILE_TABLE_CELL)}>Note</th>
          <th className={cn("text-right py-1.5 font-medium w-[48px]", MOBILE_TABLE_CELL)}>
            <span className="sr-only">Actions</span>
          </th>
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
              <td className={cn("py-1.5 pr-3", MOBILE_TABLE_FROZEN_CELL, "max-sm:min-w-[64px]")}>
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    isLatest && "text-primary font-medium",
                  )}
                >
                  v{v.version_number}
                </span>
              </td>
              <td className={cn("py-1.5 pr-3", MOBILE_TABLE_CELL)} onClick={(e) => e.stopPropagation()}>
                <VersionIdBadge versionId={v.version_id} showLabel={false} />
              </td>
              <td className={cn("py-1.5 pr-3 text-muted-foreground", MOBILE_TABLE_CELL)}>
                {date.toLocaleDateString()}{" "}
                {date.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className={cn("py-1.5 text-muted-foreground", MOBILE_TABLE_CELL)}>
                {v.change_note ?? "—"}
              </td>
              <td className={cn("py-1.5 text-right", MOBILE_TABLE_CELL)} onClick={(e) => e.stopPropagation()}>
                <Button
                  icon={<Copy />}
                  variant="quiet"
                  disabled={duplicating}
                  aria-label={`Duplicate v${v.version_number} as a new agent`}
                  title={`Duplicate v${v.version_number} as a new agent`}
                  onClick={() => onDuplicate(v)}
                />
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
