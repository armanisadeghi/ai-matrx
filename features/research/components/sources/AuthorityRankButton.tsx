"use client";

import { useCallback, useState } from "react";
import { Award, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useResearchApi } from "../../hooks/useResearchApi";
import { useResearchStream } from "../../hooks/useResearchStream";
import type { ResearchDataEvent } from "../../types";

interface AuthorityRankButtonProps {
  topicId: string;
  /** Limit ranking to specific sources. Omit = every included source on the topic. */
  sourceIds?: string[];
  /** Re-rank sources that already have a score (default only fills gaps). */
  force?: boolean;
  /** Fired once after ranking completes — refetch sources to show new scores. */
  onRanked?: () => void;
  size?: "sm" | "default";
  className?: string;
}

/**
 * Triggers the server-side Source Authority Ranker: chunks the topic's sources
 * into batches of ≤50, scores each (0-100 + tier + reasoning), and writes the
 * results back to the DB. Streams batch progress into a toast. Replaces the old
 * manual copy/paste "Authority export" round-trip.
 */
export function AuthorityRankButton({
  topicId,
  sourceIds,
  force,
  onRanked,
  size = "sm",
  className,
}: AuthorityRankButtonProps) {
  const api = useResearchApi();
  const stream = useResearchStream();
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const toastId = toast.loading("Ranking source authority…");
    try {
      const response = await api.rankSourceAuthority(topicId, {
        source_ids: sourceIds ?? null,
        force: force ?? false,
      });
      await stream.startStream(response, {
        onData: (e: ResearchDataEvent) => {
          if (e.type === "authority_rank_start") {
            if (e.total === 0) return;
            toast.loading(
              `Ranking ${e.total} source${e.total === 1 ? "" : "s"} in ${e.batches} batch${e.batches === 1 ? "" : "es"}…`,
              { id: toastId },
            );
          } else if (e.type === "authority_rank_batch") {
            toast.loading(`Ranked batch ${e.batch_index}/${e.batch_count}…`, {
              id: toastId,
            });
          } else if (e.type === "authority_rank_complete") {
            if (e.total === 0) {
              toast.success(
                force ? "No sources to rank." : "All sources already ranked.",
                { id: toastId },
              );
            } else if (e.failed > 0) {
              toast.warning(
                `Ranked ${e.ranked}/${e.total} sources · ${e.failed} failed`,
                { id: toastId },
              );
            } else {
              toast.success(
                `Ranked ${e.ranked} source${e.ranked === 1 ? "" : "s"} by authority`,
                { id: toastId },
              );
            }
          }
        },
        onError: (msg) =>
          toast.error(`Authority ranking failed: ${msg}`, { id: toastId }),
        onEnd: () => onRanked?.(),
      });
    } catch (err) {
      toast.error(
        `Authority ranking failed: ${err instanceof Error ? err.message : "unknown error"}`,
        { id: toastId },
      );
    } finally {
      setBusy(false);
    }
  }, [busy, api, topicId, sourceIds, force, stream, onRanked]);

  return (
    <Button
      variant="outline"
      size={size}
      disabled={busy}
      onClick={run}
      className={cn("gap-1.5 text-xs", className)}
      title="Score every source's authoritativeness with AI"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Award className="h-3.5 w-3.5 text-primary" />
      )}
      {busy ? "Ranking…" : "Rank authority"}
    </Button>
  );
}
