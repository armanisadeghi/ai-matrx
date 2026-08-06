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

const ACTION_LABEL: Record<string, string> = {
  "member.suspend": "Suspended",
  "member.reactivate": "Reactivated",
  "member.remove": "Removed",
  "controls.update": "Updated controls",
  "resources.reassign": "Reassigned resources",
};

const ACTION_TONE: Record<string, "destructive" | "success" | "info" | "warning"> = {
  "member.suspend": "warning",
  "member.reactivate": "success",
  "member.remove": "destructive",
  "controls.update": "info",
  "resources.reassign": "info",
};

export function OrgAdminAuditTable({ orgId }: { orgId: string }) {
  const [entries, setEntries] = useState<OrgAdminAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listOrgAdminAudit(orgId)
      .then((e) => !cancelled && setEntries(e))
      .catch((err: unknown) => !cancelled && setError(err instanceof Error ? err.message : "Failed to load audit log"))
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
    return <p className="py-4 text-sm text-muted-foreground">No governance actions recorded yet.</p>;

  return (
    <ul className="divide-y divide-border">
      {entries.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
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
          <time className="shrink-0 text-xs text-muted-foreground" dateTime={e.createdAt}>
            {formatRelativeTime(e.createdAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
