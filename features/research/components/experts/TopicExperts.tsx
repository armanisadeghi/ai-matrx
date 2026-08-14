"use client";

// features/research/components/experts/TopicExperts.tsx
//
// THE LOOP THE CRM WAS BUILT TO CLOSE. The research pipeline has always named
// experts — quote speakers, expert-opinion findings, credentialed authors —
// and buried them in `rs_source.page_analysis` JSONB. This is where they come
// out and become real `crm.party` records a user can open, work, and contact.
//
// Two halves, in the order the user thinks:
//   ROSTER    — who this topic already promoted (every name opens in the CRM).
//   CANDIDATES— who the evidence names, ranked, with the WHY spelled out.
//
// Promotion is suggestion-gated: strong candidates are pre-selected, weak ones
// are not selectable until the user explicitly says "include weak" — the same
// doctrine as the dedup merge candidates. No name is ever written by a scan.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import {
  ExternalLink,
  GraduationCap,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";
import { fetchTopicExperts } from "@/features/crm/service";
import type { TopicExpertLink } from "@/features/crm/types";
import { EXPERT_STATUS_LABEL, EXPERT_STATUSES } from "@/features/crm/types";
import { useTopicContext } from "../../context/ResearchContext";
import { useResearchApi } from "../../hooks/useResearchApi";
import type {
  ExpertCandidate,
  ExpertCandidateTier,
  ExpertExtraction,
} from "../../types";

const TIER_STYLE: Record<ExpertCandidateTier, string> = {
  strong:
    "border-emerald-500/20 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  probable: "border-amber-500/20 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  weak: "border-border bg-muted text-muted-foreground",
};

const TIER_LABEL: Record<ExpertCandidateTier, string> = {
  strong: "Strong",
  probable: "Probable",
  weak: "Weak",
};

function statusLabel(raw: string | null): string | null {
  if (!raw) return null;
  return (EXPERT_STATUSES as readonly string[]).includes(raw)
    ? EXPERT_STATUS_LABEL[raw as (typeof EXPERT_STATUSES)[number]]
    : raw;
}

function CandidateRow({
  candidate,
  selected,
  disabled,
  onToggle,
}: {
  candidate: ExpertCandidate;
  selected: boolean;
  disabled: boolean;
  onToggle: (key: string) => void;
}) {
  const already = candidate.existing_party_id;
  return (
    <div className="flex items-start gap-2 border-b border-border/60 px-2 py-2 last:border-b-0">
      <Checkbox
        checked={selected}
        disabled={disabled || Boolean(already)}
        onCheckedChange={() => onToggle(candidate.key)}
        aria-label={`Select ${candidate.display_name}`}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">
            {candidate.display_name}
          </span>
          {candidate.credentials.length > 0 && (
            <span className="text-[11px] font-medium text-muted-foreground">
              {candidate.credentials.join(", ")}
            </span>
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none",
              TIER_STYLE[candidate.tier],
            )}
          >
            {TIER_LABEL[candidate.tier]} · {candidate.confidence}
          </span>
          {/* Already in the CRM: a door, never a silent no-op checkbox. */}
          {already && (
            <Link
              href={`/crm/${already}`}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Already a contact
              {statusLabel(candidate.existing_expert_status)
                ? ` · ${statusLabel(candidate.existing_expert_status)}`
                : ""}
            </Link>
          )}
        </div>
        {candidate.why.length > 0 && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {candidate.why.join(" · ")}
          </p>
        )}
        {candidate.evidence.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {candidate.evidence.slice(0, 2).map((evidence, index) => (
              <a
                key={`${evidence.source_id}-${index}`}
                href={evidence.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-[11px] text-muted-foreground hover:text-foreground hover:underline"
              >
                {evidence.detail || evidence.title || evidence.url}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TopicExperts() {
  const { topicId } = useTopicContext();
  const api = useResearchApi();

  const [extraction, setExtraction] = useState<ExpertExtraction | null>(null);
  const [roster, setRoster] = useState<TopicExpertLink[]>([]);
  const [scanning, setScanning] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeWeak, setIncludeWeak] = useState(false);
  const [rosterLoading, setRosterLoading] = useState(true);

  // Resolves in a callback rather than synchronously in the effect body — the
  // roster is external state we subscribe to, not state we derive.
  const loadRoster = useCallback(
    () =>
      fetchTopicExperts(topicId)
        .then((rows) => {
          setRoster(rows);
        })
        .catch((e: unknown) => {
          toast.error(extractErrorMessage(e));
        })
        .finally(() => {
          setRosterLoading(false);
        }),
    [topicId],
  );

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const scan = async () => {
    setScanning(true);
    try {
      const result = await api.extractExperts(topicId);
      setExtraction(result);
      // Strong evidence is pre-selected; everything weaker is a deliberate
      // click. A scan that pre-checks a weak name is a scan that writes one.
      setSelected(
        new Set(
          result.candidates
            .filter((c) => c.tier === "strong" && !c.existing_party_id)
            .map((c) => c.key),
        ),
      );
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setScanning(false);
    }
  };

  const promote = async () => {
    const keys = Array.from(selected);
    if (keys.length === 0) return;
    setPromoting(true);
    try {
      const result = await api.promoteExperts(topicId, {
        keys,
        accept_weak: includeWeak,
      });
      const created = result.promoted.filter((p) => p.created).length;
      const matched = result.promoted.length - created;
      toast.success(
        `${created} new contact${created === 1 ? "" : "s"}` +
          (matched > 0 ? `, ${matched} matched an existing record` : ""),
      );
      // The server's refusals are the honest part of the receipt — show them.
      for (const skipped of result.skipped) {
        toast.info(`${skipped.display_name ?? skipped.key}: ${skipped.reason}`);
      }
      setSelected(new Set());
      await Promise.all([loadRoster(), scan()]);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setPromoting(false);
    }
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const candidates = (extraction?.candidates ?? []).filter(
    (c) => includeWeak || c.tier !== "weak",
  );

  return (
    <div className="h-full overflow-y-auto px-3 pb-8 pt-3">
      <div className="mx-auto max-w-4xl space-y-4">
        {/* ── Roster ─────────────────────────────────────────────────────── */}
        <section className="rounded-md border border-border bg-card">
          <header className="flex h-9 items-center gap-1.5 border-b border-border px-2.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Experts from this research
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {roster.length}
            </span>
          </header>
          <div className="p-2">
            {rosterLoading ? (
              <Skeleton className="h-10 w-full rounded" />
            ) : roster.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                Nobody promoted yet. Scan below to see who this research names.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {roster.map(({ party }) => (
                  <Link
                    key={party.id}
                    href={`/crm/${party.id}`}
                    className="flex items-center gap-2 px-1 py-1.5 hover:bg-accent"
                  >
                    <GraduationCap className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                      {party.display_name}
                    </span>
                    {statusLabel(party.expert_status) && (
                      <span className="text-[11px] text-muted-foreground">
                        {statusLabel(party.expert_status)}
                      </span>
                    )}
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── Candidates ─────────────────────────────────────────────────── */}
        <section className="rounded-md border border-border bg-card">
          <header className="flex h-9 flex-wrap items-center gap-2 border-b border-border px-2.5">
            <GraduationCap className="h-3.5 w-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
              Candidates
            </h2>
            {extraction && (
              <span className="text-xs text-muted-foreground">
                {extraction.candidates.length} found across{" "}
                {extraction.sources_with_signals} analyzed page
                {extraction.sources_with_signals === 1 ? "" : "s"}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void scan()}
                disabled={scanning}
                className="h-7 px-2 text-xs"
              >
                {scanning ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1 h-3 w-3" />
                )}
                {extraction ? "Rescan" : "Scan for experts"}
              </Button>
              <Button
                size="sm"
                onClick={() => void promote()}
                disabled={promoting || selected.size === 0}
                className="h-7 px-2 text-xs"
              >
                {promoting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Add {selected.size > 0 ? selected.size : ""} to CRM
              </Button>
            </div>
          </header>

          <div>
            {!extraction && !scanning && (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                Scanning reads the analyses this topic already paid for — the
                quotes, findings and credited authors on every page it read. It
                costs nothing and writes nothing.
              </p>
            )}
            {scanning && (
              <div className="space-y-2 p-2">
                <Skeleton className="h-10 w-full rounded" />
                <Skeleton className="h-10 w-full rounded" />
              </div>
            )}
            {extraction && !scanning && (
              <>
                <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-2.5 py-1.5">
                  <Checkbox
                    id="include-weak"
                    checked={includeWeak}
                    onCheckedChange={(next) => setIncludeWeak(next === true)}
                  />
                  <label
                    htmlFor="include-weak"
                    className="text-xs text-muted-foreground"
                  >
                    Show weak candidates — only mentioned in passing, nothing
                    attributed to them. Adding one is a deliberate act.
                  </label>
                </div>
                {candidates.length === 0 ? (
                  <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                    No candidates at this confidence. Analyze more pages, or
                    show weak candidates.
                  </p>
                ) : (
                  candidates.map((candidate) => (
                    <CandidateRow
                      key={candidate.key}
                      candidate={candidate}
                      selected={selected.has(candidate.key)}
                      disabled={promoting}
                      onToggle={toggle}
                    />
                  ))
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
