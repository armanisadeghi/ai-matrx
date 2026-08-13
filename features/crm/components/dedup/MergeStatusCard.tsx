"use client";

// features/crm/components/dedup/MergeStatusCard.tsx
//
// The record page's dedup surface. Renders nothing when there is nothing to
// say; otherwise, in priority order:
//   * this record IS a merge loser (canonical_id set) → loud banner with a
//     door to the surviving record and an exact Undo;
//   * pending duplicate suggestions naming this record → each with a door to
//     the other record and to the review queue;
//   * merges this record absorbed → each with a door to the (still live)
//     loser and an exact Undo.
//
// THE DOOR LAW: every record named here opens.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, GitMerge, Merge, Undo2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import {
  fetchCandidatesForParty,
  fetchMergesForParty,
  unmergeParties,
} from "../../service";
import type {
  MergeCandidateWithParties,
  PartyMergeWithParties,
  PartyRow,
} from "../../types";

export function MergeStatusCard({
  party,
  onChanged,
}: {
  party: PartyRow;
  onChanged: () => void;
}) {
  const [candidates, setCandidates] = useState<MergeCandidateWithParties[]>([]);
  const [merges, setMerges] = useState<PartyMergeWithParties[]>([]);

  const reload = useCallback(async () => {
    try {
      const [cands, hist] = await Promise.all([
        fetchCandidatesForParty(party.id),
        fetchMergesForParty(party.id),
      ]);
      setCandidates(cands);
      setMerges(hist);
    } catch (e) {
      // Non-fatal on the record page; the review queue is the full surface.
      console.error("[crm] merge status load failed:", e);
    }
  }, [party.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const activeAsLoser = merges.find(
    (m) => m.loser_id === party.id && !m.unmerged_at,
  );
  const activeAsWinner = merges.filter(
    (m) => m.winner_id === party.id && !m.unmerged_at,
  );

  const onUnmerge = async (m: PartyMergeWithParties) => {
    const ok = await confirm({
      title: "Undo this merge?",
      description: `${m.loser?.display_name ?? "The merged record"} becomes its own record again, and everything the merge moved goes back to it exactly.`,
      confirmLabel: "Undo merge",
    });
    if (!ok) return;
    try {
      await unmergeParties(m.id);
      toast.success("Merge undone");
      onChanged();
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unmerge failed");
    }
  };

  if (!party.canonical_id && candidates.length === 0 && activeAsWinner.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {party.canonical_id && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
            Merged record
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            This record was merged into{" "}
            <Link
              href={`/crm/${party.canonical_id}`}
              className="font-medium text-foreground hover:underline"
            >
              {activeAsLoser?.winner?.display_name ?? "the surviving record"}
            </Link>
            . It is kept so the merge can be undone exactly.
          </p>
          {activeAsLoser && (
            <Button
              size="sm"
              variant="outline"
              className="mt-1.5 h-7 gap-1 px-2 text-xs"
              onClick={() => void onUnmerge(activeAsLoser)}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo merge
            </Button>
          )}
        </div>
      )}

      {candidates.length > 0 && (
        <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <Merge className="h-3.5 w-3.5 text-muted-foreground" />
            Possible duplicate
          </div>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {candidates.map((c) => {
              const other = c.source?.id === party.id ? c.target : c.source;
              if (!other) return null;
              return (
                <li key={c.id}>
                  Looks like the same {other.party_kind === "organization" ? "company" : "person"} as{" "}
                  <Link
                    href={`/crm/${other.id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {other.display_name}
                  </Link>{" "}
                  ({c.confidence}% match)
                </li>
              );
            })}
          </ul>
          <Button size="sm" variant="outline" className="mt-1.5 h-7 gap-1 px-2 text-xs" asChild>
            <Link href="/crm/duplicates">
              <GitMerge className="h-3.5 w-3.5" />
              Review side by side
            </Link>
          </Button>
        </div>
      )}

      {activeAsWinner.length > 0 && (
        <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <GitMerge className="h-3.5 w-3.5 text-muted-foreground" />
            Merged into this record
          </div>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {activeAsWinner.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                <span className="min-w-0 truncate">
                  {m.loser ? (
                    <Link
                      href={`/crm/${m.loser.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {m.loser.display_name}
                    </Link>
                  ) : (
                    "A record"
                  )}{" "}
                  — {m.method === "auto" ? "auto-merged" : "merged"}{" "}
                  {new Date(m.merged_at).toLocaleDateString()}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-6 gap-1 px-1.5 text-[11px]"
                  onClick={() => void onUnmerge(m)}
                >
                  <Undo2 className="h-3 w-3" />
                  Undo
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
