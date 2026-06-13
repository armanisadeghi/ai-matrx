/**
 * One usage row in the find-usages list — pin state, drift badge, owner/org
 * line (admin / org-managed), one-click update + notify actions, and an
 * expandable stored-vs-current detail pane.
 */

"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Loader2, RotateCw, Send, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "sonner";
import { updateUsageToActive } from "@/features/agents/redux/usages/usages.thunks";
import { makeSelectRowMutation } from "@/features/agents/redux/usages/usages.selectors";
import type { UsageScope } from "@/features/agents/redux/usages/usages.slice";
import type { AgentUsageRow } from "@/features/agents/redux/usages/usages.types";
import { DriftSeverityBadge } from "./DriftSeverityBadge";
import { PinStateBadge } from "./PinStateBadge";
import { UsageRowDetail } from "./UsageRowDetail";
import { usageTypeMeta } from "./usageTypeMeta";

interface UsageRowProps {
  row: AgentUsageRow;
  scope: UsageScope;
  /** Show owner/org column (admin scope, or org-managed rows in user scope). */
  showOwner?: boolean;
  onNotify?: (row: AgentUsageRow) => void;
}

export function UsageRow({ row, scope, showOwner, onNotify }: UsageRowProps) {
  const dispatch = useAppDispatch();
  const [expanded, setExpanded] = useState(false);
  const meta = usageTypeMeta(row.usageType);
  const selectMutation = useMemo(
    () => makeSelectRowMutation(row.usageType, row.usageId),
    [row.usageType, row.usageId],
  );
  const mutation = useAppSelector(selectMutation);
  const updating = mutation === "updating";

  const canUpdate = row.managedByCaller && row.stalePin && meta.remediable;
  const hasDetail = row.findings.length > 0 || row.config != null;

  const handleUpdate = async () => {
    const ok = await confirm({
      title: `Update this ${meta.label.toLowerCase()} to the active version?`,
      description: `"${row.label}" will be re-pinned to v${row.currentVersion} (the agent's active version).`,
      confirmLabel: "Update to active",
    });
    if (!ok) return;
    try {
      const result = await dispatch(
        updateUsageToActive({
          agentId: row.agentId,
          scope,
          usageType: row.usageType,
          usageId: row.usageId,
        }),
      ).unwrap();
      if (result.success) {
        toast.success(`Updated "${row.label}" to v${result.pinnedVersionNumber ?? row.currentVersion}`);
      } else {
        toast.error(result.message ?? result.error ?? "Could not update this usage");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <div className="flex items-start gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => hasDetail && setExpanded((v) => !v)}
          className={cn(
            "mt-0.5 shrink-0 text-muted-foreground",
            hasDetail ? "hover:text-foreground" : "invisible",
          )}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">{row.label}</span>
            {row.isUsageActive === false && (
              <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                inactive
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <PinStateBadge row={row} />
            {row.worstSeverity && <DriftSeverityBadge severity={row.worstSeverity} size="sm" />}
            {showOwner && (row.ownerUserId || row.organizationName) && (
              <span className="text-[11px] text-muted-foreground">
                {row.organizationName ? `org: ${row.organizationName}` : null}
                {row.organizationName && row.ownerUserId ? " · " : null}
                {row.ownerUserId ? `owner: ${row.ownerUserId.slice(0, 8)}` : null}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {canUpdate && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={handleUpdate}
              disabled={updating}
            >
              {updating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RotateCw className="h-3 w-3" />
              )}
              Update
            </Button>
          )}
          {!row.managedByCaller && onNotify && (row.ownerUserId || row.orgManagerUserIds.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => onNotify(row)}
            >
              <Send className="h-3 w-3" />
              Notify
            </Button>
          )}
          {row.usageType === "workflow_node" && (
            <a
              href={`/workflows/${(row.config?.workflow_id as string) ?? ""}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-7 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              title="Open the workflow to update this node"
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
          )}
        </div>
      </div>
      {expanded && hasDetail && <UsageRowDetail row={row} />}
    </div>
  );
}
