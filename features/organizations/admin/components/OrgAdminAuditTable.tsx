"use client";

/**
 * Governance audit log — every org-admin action (suspend, controls, reassign, remove).
 * Read-only; the single place to answer "who changed what" for this org.
 */
import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { listOrgAdminAudit } from "../service";
import type { OrgAdminAuditEntry } from "../types";
import { formatRelativeTime } from "../utils";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import {
  auditCsvRows,
  auditEntrySummary,
  auditListHuman,
  auditRow,
  buildAuditListPayload,
  buildAuditRowPayload,
} from "../copy";

const ACTION_LABEL: Record<string, string> = {
  "member.suspend": "Suspended",
  "member.reactivate": "Reactivated",
  "member.remove": "Removed",
  "controls.update": "Updated controls",
  "resources.reassign": "Reassigned resources",
};

const ACTION_TONE: Record<
  string,
  "destructive" | "success" | "info" | "warning"
> = {
  "member.suspend": "warning",
  "member.reactivate": "success",
  "member.remove": "destructive",
  "controls.update": "info",
  "resources.reassign": "info",
};

/** The label the log renders for an action — reused by every payload. */
const labelFor = (action: string): string => ACTION_LABEL[action] ?? action;

export function OrgAdminAuditTable({ orgId }: { orgId: string }) {
  const [entries, setEntries] = useState<OrgAdminAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listOrgAdminAudit(orgId)
      .then((e) => !cancelled && setEntries(e))
      .catch(
        (err: unknown) =>
          !cancelled &&
          setError(
            err instanceof Error ? err.message : "Failed to load audit log",
          ),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  if (loading) {
    return (
      <div className="flex items-center py-6 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading audit log…
      </div>
    );
  }
  if (error) return <p className="py-4 text-sm text-destructive">{error}</p>;
  if (entries.length === 0)
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No governance actions recorded yet.
      </p>
    );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {entries.length} action{entries.length === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-1">
          <CopyButtons
            size="icon"
            label="Governance audit log"
            human={() => auditListHuman(entries, labelFor)}
            json={() => entries.map(auditRow)}
            agent={() => buildAuditListPayload({ entries, orgId, labelFor })}
          />
          <ExportMenu
            label="Org governance audit"
            items={[
              jsonExportItem(() => entries.map(auditRow)),
              csvExportItem(() => auditCsvRows(entries), "CSV (all actions)"),
            ]}
          />
        </div>
      </div>
      <ul className="divide-y divide-border">
        {entries.map((e) => (
          <li
            key={e.id}
            className="group/audit flex items-center justify-between gap-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <Badge variant={ACTION_TONE[e.action] ?? "neutral"}>
                {ACTION_LABEL[e.action] ?? e.action}
              </Badge>
              <span className="text-muted-foreground">
                {e.targetEmail ?? "—"}
                <span className="text-muted-foreground/60"> by </span>
                {e.actorEmail ?? "system"}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <CopyButtons
                size="xs"
                label={`${labelFor(e.action)} ${e.targetEmail ?? ""}`.trim()}
                className="lg:opacity-0 lg:group-hover/audit:opacity-100 lg:focus-within:opacity-100 transition-opacity"
                human={() => auditEntrySummary(e, labelFor(e.action))}
                json={() => auditRow(e)}
                agent={() =>
                  buildAuditRowPayload({
                    entry: e,
                    orgId,
                    labelFor,
                    totalEntries: entries.length,
                  })
                }
              />
              <time
                className="text-xs text-muted-foreground"
                dateTime={e.createdAt}
              >
                {formatRelativeTime(e.createdAt)}
              </time>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
