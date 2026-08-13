"use client";

// features/crm/components/dedup/CandidatePairCard.tsx
//
// One duplicate suggestion: the verdict (WHY these two look like the same
// record), a side-by-side comparison loaded on expand, an explicit statement
// of what moves and what stays, winner selection, and the two decisions —
// Merge (verb-labeled, confirmed) or Not duplicates (durable dismissal).
//
// THE DOOR LAW: both records open — inline link AND new tab — from every
// place their name renders.

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Merge,
  User,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  dismissMergeCandidate,
  fetchPartyDetail,
  mergeParties,
} from "../../service";
import type {
  MergeCandidateWithParties,
  MergePartyRef,
  MergeSignal,
  PartyDetail,
} from "../../types";

function signalLabel(s: MergeSignal): string {
  switch (s.kind) {
    case "identity_collision":
      return `Both hold the identity ${s.channel ?? "contact"} ${s.value ?? ""}`.trim();
    case "shared_medium":
      return `Both hold the ${s.channel ?? "contact"} ${s.value ?? ""}`.trim();
    case "name_key":
      return "Same name after normalization";
    case "domain":
      return `Email addresses at ${s.value ?? "the same domain"}`;
    default:
      return "Detected overlap";
  }
}

function parseSignals(raw: unknown): MergeSignal[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is MergeSignal =>
      typeof s === "object" && s !== null && typeof (s as { kind?: unknown }).kind === "string",
  );
}

function PartyName({ party }: { party: MergePartyRef }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      {party.party_kind === "organization" ? (
        <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      ) : (
        <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      )}
      <Link
        href={`/crm/${party.id}`}
        className="min-w-0 truncate font-medium text-foreground hover:underline"
      >
        {party.display_name}
      </Link>
      <Link
        href={`/crm/${party.id}`}
        target="_blank"
        aria-label={`Open ${party.display_name} in a new tab`}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <ExternalLink className="h-3 w-3" />
      </Link>
    </span>
  );
}

function DetailColumn({
  party,
  detail,
  highlight,
}: {
  party: MergePartyRef;
  detail: PartyDetail | null;
  /** Which side this is once a winner is chosen. */
  highlight: "keep" | "merge";
}) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 rounded-md border px-3 py-2",
        highlight === "keep"
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-muted/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <PartyName party={party} />
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            highlight === "keep"
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          {highlight === "keep" ? "Kept" : "Merged in"}
        </span>
      </div>
      <dl className="mt-2 space-y-1 text-xs">
        {party.job_title && (
          <div className="flex gap-1">
            <dt className="text-muted-foreground">Title:</dt>
            <dd className="min-w-0 truncate text-foreground">
              {party.job_title}
            </dd>
          </div>
        )}
        {party.primary_domain && (
          <div className="flex gap-1">
            <dt className="text-muted-foreground">Domain:</dt>
            <dd className="min-w-0 truncate text-foreground">
              {party.primary_domain}
            </dd>
          </div>
        )}
        <div className="flex gap-1">
          <dt className="text-muted-foreground">Created:</dt>
          <dd className="text-foreground">
            {new Date(party.created_at).toLocaleDateString()}
          </dd>
        </div>
        {detail ? (
          <>
            {detail.contactPoints.length > 0 && (
              <div>
                <dt className="text-muted-foreground">Contact:</dt>
                <dd className="text-foreground">
                  {detail.contactPoints.map((p) => (
                    <div key={p.id} className="truncate">
                      {p.medium.display_value}
                      <span className="text-muted-foreground">
                        {" "}
                        ({p.channel})
                      </span>
                    </div>
                  ))}
                </dd>
              </div>
            )}
            <div className="flex flex-wrap gap-x-3 text-muted-foreground">
              <span>
                {detail.addresses.length} address
                {detail.addresses.length === 1 ? "" : "es"}
              </span>
              <span>
                {(detail.party.party_kind === "person"
                  ? detail.affiliations
                  : detail.members
                ).length}{" "}
                employment link
                {(detail.party.party_kind === "person"
                  ? detail.affiliations
                  : detail.members
                ).length === 1
                  ? ""
                  : "s"}
              </span>
              <span>
                {detail.interactions.length} interaction
                {detail.interactions.length === 1 ? "" : "s"}
              </span>
            </div>
          </>
        ) : (
          <Skeleton className="h-10 w-full" />
        )}
      </dl>
    </div>
  );
}

export function CandidatePairCard({
  candidate,
  onResolved,
}: {
  candidate: MergeCandidateWithParties;
  onResolved: () => void;
}) {
  // fetchMergeCandidates filters null parties before rendering; narrow once.
  const source = candidate.source;
  const target = candidate.target;

  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState<{
    source: PartyDetail | null;
    target: PartyDetail | null;
  }>({ source: null, target: null });
  // Default winner: the earlier-created record (same rule as auto-merge).
  const [winnerId, setWinnerId] = useState<string>(() =>
    source && target && new Date(source.created_at) <= new Date(target.created_at)
      ? source.id
      : (target?.id ?? ""),
  );
  const [busy, setBusy] = useState(false);

  if (!source || !target) return null;

  const winner = winnerId === source.id ? source : target;
  const loser = winnerId === source.id ? target : source;
  const winnerDetail =
    winnerId === source.id ? details.source : details.target;
  const loserDetail = winnerId === source.id ? details.target : details.source;

  const signals = parseSignals(candidate.signals);

  const onToggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !details.source) {
      void (async () => {
        try {
          const [s, t] = await Promise.all([
            fetchPartyDetail(source.id),
            fetchPartyDetail(target.id),
          ]);
          setDetails({ source: s, target: t });
        } catch (e) {
          toast.error(
            e instanceof Error ? e.message : "Failed to load record details",
          );
        }
      })();
    }
  };

  // What moves vs stays — computed from the loaded details so the confirm
  // states the actual consequence, not a generic warning.
  const collidingMediums = new Set(
    (winnerDetail?.contactPoints ?? []).map((p) => p.medium_id),
  );
  const movingPoints = (loserDetail?.contactPoints ?? []).filter(
    (p) => !collidingMediums.has(p.medium_id),
  );
  const stayingPoints = (loserDetail?.contactPoints ?? []).filter((p) =>
    collidingMediums.has(p.medium_id),
  );

  const onMerge = async () => {
    const ok = await confirm({
      title: `Merge ${loser.display_name} into ${winner.display_name}?`,
      description:
        `Everything on ${loser.display_name} — contact methods, addresses, employment, activity, links — moves to ${winner.display_name}. ` +
        (stayingPoints.length > 0
          ? `${stayingPoints.length} contact method${stayingPoints.length === 1 ? "" : "s"} both records share stay on the merged record. `
          : "") +
        "Nothing is deleted, and you can undo the merge exactly.",
      confirmLabel: `Merge into ${winner.display_name}`,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await mergeParties({
        winnerId: winner.id,
        loserId: loser.id,
        reason:
          signals.length > 0 ? signals.map(signalLabel).join("; ") : undefined,
      });
      toast.success(
        `Merged ${loser.display_name} into ${winner.display_name} — undo any time from Recent merges`,
      );
      onResolved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setBusy(false);
    }
  };

  const onDismiss = async () => {
    setBusy(true);
    try {
      await dismissMergeCandidate(candidate.id);
      toast.success("Marked as not duplicates — this pair won't be suggested again");
      onResolved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dismiss failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-card">
      {/* Collapsed row: verdict + both doors + expand */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <PartyName party={source} />
            <span className="text-muted-foreground">and</span>
            <PartyName party={target} />
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {signals.map(signalLabel).join(" · ") || "Detected overlap"}
          </p>
        </div>
        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {candidate.confidence}% match
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <DetailColumn
              party={winner}
              detail={winnerDetail}
              highlight="keep"
            />
            <div className="flex items-center justify-center text-muted-foreground">
              <ArrowRight className="hidden h-4 w-4 rotate-180 sm:block" />
            </div>
            <DetailColumn party={loser} detail={loserDetail} highlight="merge" />
          </div>

          {/* The verdict: what a merge actually does. */}
          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            {loserDetail && winnerDetail ? (
              <>
                Merging moves{" "}
                <span className="text-foreground">
                  {movingPoints.length} contact method
                  {movingPoints.length === 1 ? "" : "s"},{" "}
                  {loserDetail.addresses.length} address
                  {loserDetail.addresses.length === 1 ? "" : "es"},{" "}
                  {(loserDetail.party.party_kind === "person"
                    ? loserDetail.affiliations
                    : loserDetail.members
                  ).length}{" "}
                  employment link
                  {(loserDetail.party.party_kind === "person"
                    ? loserDetail.affiliations
                    : loserDetail.members
                  ).length === 1
                    ? ""
                    : "s"}{" "}
                  and {loserDetail.interactions.length} interaction
                  {loserDetail.interactions.length === 1 ? "" : "s"}
                </span>{" "}
                from {loser.display_name} to {winner.display_name}.
                {stayingPoints.length > 0 && (
                  <>
                    {" "}
                    {stayingPoints.length} shared contact method
                    {stayingPoints.length === 1 ? "" : "s"} already on{" "}
                    {winner.display_name}{" "}
                    {stayingPoints.length === 1 ? "is" : "are"} kept once.
                  </>
                )}{" "}
                Notes, tasks and files linked to {loser.display_name} follow
                it. The merge is recorded and can be undone exactly.
              </>
            ) : (
              "Loading what this merge would move…"
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="h-8 gap-1 px-3 text-xs"
              disabled={busy}
              onClick={() => void onMerge()}
            >
              <Merge className="h-3.5 w-3.5" />
              Merge into {winner.display_name}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-xs"
              disabled={busy}
              onClick={() =>
                setWinnerId(winnerId === source.id ? target.id : source.id)
              }
            >
              Keep {loser.display_name} instead
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-8 gap-1 px-2 text-xs text-muted-foreground"
              disabled={busy}
              onClick={() => void onDismiss()}
            >
              <X className="h-3.5 w-3.5" />
              Not duplicates
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
