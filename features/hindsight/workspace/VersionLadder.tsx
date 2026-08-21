"use client";

/**
 * VersionLadder — the ratchet made visible: the agent's recent versions, with
 * the ones a Hindsight proposal produced marked, a door to the full version
 * diff page, and a door to try the current agent.
 *
 * Version history is a pure DB read, so it goes DIRECT to Supabase via the
 * same RPC the agent version-diff page uses (`agx_get_version_history`) —
 * never through Python.
 */
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GitCommitVertical, History, Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { operationFailed } from "@/utils/errors";
import { supabase } from "@/utils/supabase/client";

import type { Finding } from "../types";
import { canRevert, RevertButton } from "../components/RevertButton";
import { fmtDate } from "../components/tokens";

const SHOWN = 8;

interface VersionRow {
  version_id: string;
  version_number: number;
  name: string;
  changed_at: string;
  change_note: string;
}

export function VersionLadder({
  agentId,
  findings,
  onChanged,
}: {
  agentId: string;
  findings: Finding[];
  /** Called after a revert lands, so the host refetches its findings. */
  onChanged?: () => void;
}) {
  const queryClient = useQueryClient();
  const versions = useQuery({
    queryKey: ["hindsight", "agent-versions", agentId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("agx_get_version_history", {
        p_agent_id: agentId,
        p_limit: SHOWN,
        p_offset: 0,
      });
      if (error) throw operationFailed("load the version history", error);
      return (data ?? []) as VersionRow[];
    },
  });

  // version_number → the applied finding that produced it.
  const appliedByVersion = new Map<number, Finding>();
  for (const f of findings) {
    if (f.applied_version_number != null) {
      appliedByVersion.set(f.applied_version_number, f);
    }
  }

  return (
    <div data-testid="hindsight-version-ladder">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase text-muted-foreground">
          Version history
        </span>
        <div className="flex items-center gap-2">
          <Link
            href={`/agents/${agentId}/run`}
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            title="Try the current version"
          >
            <Play className="h-3 w-3" />
            Try it
          </Link>
          <Link
            href={`/agents/${agentId}/latest`}
            className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            title="Every version, with diffs"
          >
            <History className="h-3 w-3" />
            All versions
          </Link>
        </div>
      </div>

      {versions.isLoading && <Skeleton className="h-20" />}
      {versions.isError && (
        <p className="text-xs text-muted-foreground">
          Could not load versions: {(versions.error as Error).message}
        </p>
      )}
      {versions.data && versions.data.length === 0 && (
        <p className="text-xs text-muted-foreground">No saved versions yet.</p>
      )}

      {versions.data && versions.data.length > 0 && (
        <ol className="space-y-0.5">
          {versions.data.map((v, i) => {
            const from = appliedByVersion.get(v.version_number);
            // Reverting only makes sense on the CURRENT version — undoing a
            // change the agent already moved past would erase later work, so
            // the server refuses it and the door is not rendered at all.
            const revertable = i === 0 && from != null && canRevert(from);
            return (
              <li key={v.version_id} className={cn(revertable && "flex items-start gap-1")}>
                <Link
                  href={`/agents/${agentId}/v/${v.version_number}`}
                  className={cn(
                    "flex items-start gap-1.5 rounded-md px-1.5 py-1 hover:bg-muted/50",
                    i === 0 && "bg-muted/30",
                    revertable && "min-w-0 flex-1",
                  )}
                  title="Open this version"
                >
                  <GitCommitVertical
                    className={cn(
                      "mt-0.5 h-3.5 w-3.5 shrink-0",
                      from ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-medium tabular-nums">
                        v{v.version_number}
                      </span>
                      {i === 0 && <Badge variant="secondary" className="text-[10px]">current</Badge>}
                      {from && (
                        <Badge className="border-0 bg-primary/10 text-[10px] text-primary">
                          from review
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground">
                        {fmtDate(v.changed_at)}
                      </span>
                    </div>
                    {(from?.title || v.change_note) && (
                      <p className="truncate text-[11px] text-muted-foreground">
                        {from?.title ?? v.change_note}
                      </p>
                    )}
                  </div>
                </Link>
                {revertable && from != null && (
                  <RevertButton
                    finding={from}
                    agentId={agentId}
                    className="mt-0.5 h-6 shrink-0 px-1.5 text-[11px]"
                    onChanged={() => {
                      void queryClient.invalidateQueries({
                        queryKey: ["hindsight", "agent-versions", agentId],
                      });
                      onChanged?.();
                    }}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
