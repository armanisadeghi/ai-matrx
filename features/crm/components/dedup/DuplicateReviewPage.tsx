"use client";

// features/crm/components/dedup/DuplicateReviewPage.tsx
//
// The merge review queue (/crm/duplicates): run detection, review suggested
// pairs side-by-side, merge or dismiss each one, and undo recent merges.
//
// The rules this surface enforces (crm_03_dedup.sql):
//   * Only identity-key collisions ever merge automatically — everything shown
//     here is a SUGGESTION until a human presses the verb button.
//   * Dismissal is durable; a dismissed pair never resurfaces from a scan.
//   * Merge never destroys: the loser stays live with canonical_id set and the
//     exact move list recorded, so Unmerge replays it perfectly.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  RefreshCw,
  Undo2,
  User,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { useCrmContext } from "../../hooks/useCrmContext";
import {
  fetchMergeCandidates,
  fetchRecentMerges,
  runDedupScan,
  unmergeParties,
} from "../../service";
import type {
  MergeCandidateWithParties,
  PartyMergeWithParties,
} from "../../types";
import { CandidatePairCard } from "./CandidatePairCard";

export function DuplicateReviewPage() {
  const router = useRouter();
  const ctx = useCrmContext();

  const [candidates, setCandidates] = useState<
    MergeCandidateWithParties[] | null
  >(null);
  const [merges, setMerges] = useState<PartyMergeWithParties[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const reload = useCallback(async () => {
    if (!ctx) return;
    try {
      const [cands, recent] = await Promise.all([
        fetchMergeCandidates(ctx.orgIds),
        fetchRecentMerges(ctx.orgIds),
      ]);
      setCandidates(cands);
      setMerges(recent);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [ctx]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onScan = async () => {
    if (!ctx || scanning) return;
    setScanning(true);
    let autoMerged = 0;
    let pending = 0;
    let failed = 0;
    // Sequential on purpose — each scan can auto-merge, and hammering the
    // same tables from N orgs in parallel buys nothing at this scale.
    for (const orgId of ctx.orgIds) {
      try {
        const result = await runDedupScan(orgId);
        autoMerged += result.auto_merged.length;
        pending += result.pending_candidates;
      } catch (e) {
        failed += 1;
        console.error(`[crm] dedup scan failed for org ${orgId}:`, e);
      }
    }
    setScanning(false);
    if (failed > 0 && autoMerged === 0 && pending === 0) {
      toast.error(`Scan failed for ${failed} organization${failed === 1 ? "" : "s"}`);
    } else {
      toast.success(
        autoMerged > 0
          ? `Scan complete — ${autoMerged} record${autoMerged === 1 ? "" : "s"} auto-merged on identity keys, ${pending} suggestion${pending === 1 ? "" : "s"} to review`
          : `Scan complete — ${pending} suggestion${pending === 1 ? "" : "s"} to review`,
      );
    }
    void reload();
  };

  const onUnmerge = async (m: PartyMergeWithParties) => {
    const ok = await confirm({
      title: "Undo this merge?",
      description: `${m.loser?.display_name ?? "The merged record"} becomes its own record again, and everything the merge moved goes back to it exactly.`,
      confirmLabel: "Undo merge",
    });
    if (!ok) return;
    try {
      await unmergeParties(m.id);
      toast.success(
        `Unmerged — ${m.loser?.display_name ?? "the record"} is separate again`,
      );
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Unmerge failed");
    }
  };

  const isLoading = ctx === null || candidates === null;

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              onClick={() => router.back()}
              ariaLabel="Back"
            />
            <span className="ml-1 text-sm font-medium text-foreground">
              Duplicates
            </span>
          </>
        }
        right={
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            disabled={scanning || !ctx}
            onClick={() => void onScan()}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`}
            />
            {scanning ? "Scanning…" : "Scan now"}
          </Button>
        }
      />

      <div
        className="h-full overflow-y-auto bg-textured px-3 pb-6"
        style={{ paddingTop: "calc(var(--shell-header-h) + 0.5rem)" }}
      >
        <div className="mx-auto max-w-4xl space-y-4">
          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Records sharing an identity email or phone merge automatically
            during a scan. Everything below is a suggestion — nothing merges
            until you decide, dismissals are permanent, and every merge can be
            undone exactly.
          </p>

          {isLoading && (
            <div className="space-y-3">
              <Skeleton className="h-28 w-full rounded-md" />
              <Skeleton className="h-28 w-full rounded-md" />
            </div>
          )}

          {!isLoading && candidates.length === 0 && (
            <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-card px-4 py-8 text-center">
              <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                No duplicate suggestions
              </p>
              <p className="text-xs text-muted-foreground">
                Run a scan to check every record for shared emails, phones,
                matching names and domains.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-1 h-7 gap-1 px-2 text-xs"
                disabled={scanning}
                onClick={() => void onScan()}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${scanning ? "animate-spin" : ""}`}
                />
                Scan now
              </Button>
            </div>
          )}

          {!isLoading &&
            candidates.map((c) => (
              <CandidatePairCard
                key={c.id}
                candidate={c}
                onResolved={() => void reload()}
              />
            ))}

          {merges && merges.length > 0 && (
            <section className="space-y-2 pt-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Recent merges
              </h2>
              <div className="divide-y divide-border rounded-md border border-border bg-card">
                {merges.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm"
                  >
                    {m.loser?.party_kind === "organization" ? (
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    {m.loser ? (
                      <Link
                        href={`/crm/${m.loser.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {m.loser.display_name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">
                        Removed record
                      </span>
                    )}
                    <ArrowLeft className="h-3 w-3 rotate-180 text-muted-foreground" />
                    {m.winner ? (
                      <Link
                        href={`/crm/${m.winner.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {m.winner.display_name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">
                        Removed record
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {m.method === "auto" ? "auto-merged" : "merged"}{" "}
                      {new Date(m.merged_at).toLocaleDateString()}
                      {m.reason ? ` — ${m.reason}` : ""}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto h-7 gap-1 px-2 text-xs"
                      onClick={() => void onUnmerge(m)}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      Undo
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
