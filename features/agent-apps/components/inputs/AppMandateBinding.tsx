"use client";

/**
 * The app's Agent tab, AFTER the mandate cutover.
 *
 * THE ONE-UI LAW. Once an app names a mandate, "which agent runs this app" is
 * not a question the app settings page answers any more — it is the mandate's
 * Holder, and the mandate workspace already owns editing it (system default,
 * org binding, the user's own override, the provenance pill, the health
 * states, the notes). Rebuilding a second agent editor here would be a second
 * writer for one fact, and the two would drift within a release. So this
 * component states what runs today and hands the user THE DOOR — deep-linked
 * to this app's own job, never the 331-row list, which is a scroll and not a
 * door (`/common-docs/policies/no-dead-ends.md`).
 *
 * It renders ONLY with APP_MANDATE_CUTOVER ON. With the switch OFF the
 * settings page keeps the pinned pickers exactly as they were.
 */

import Link from "next/link";
import { BrainCircuit, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AppHolder } from "@/features/agent-apps/lib/appHolder";

const PROVENANCE_LABEL: Record<string, string> = {
  system: "System default",
  org: "Organization override",
  user: "Your override",
};

export function AppMandateBinding({
  holder,
  agentName,
}: {
  holder: AppHolder;
  /** Resolved agent's display name, when the caller already has it loaded. */
  agentName?: string | null;
}) {
  const mandateHref = holder.mandateKey
    ? `/mandates/${encodeURIComponent(holder.mandateKey)}`
    : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <BrainCircuit className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {holder.mandateKey ?? "No job assigned"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            This app runs whichever agent holds this job. Change the agent on
            the job and every run of this app follows — no republish.
          </p>
        </div>
        {holder.provenance ? (
          <Badge variant="secondary" className="shrink-0">
            {PROVENANCE_LABEL[holder.provenance] ?? holder.provenance}
          </Badge>
        ) : null}
      </div>

      <div className="text-sm">
        <span className="text-muted-foreground">Running today: </span>
        {holder.loading ? (
          <span className="text-muted-foreground">resolving…</span>
        ) : holder.error ? (
          <span className="text-destructive">{holder.error}</span>
        ) : (
          <span className="font-medium">
            {agentName ?? holder.agentId ?? "—"}
          </span>
        )}
      </div>

      {mandateHref ? (
        <Button asChild variant="outline" size="sm">
          <Link href={mandateHref}>
            Open this job
            <ExternalLink className="size-3.5" />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
