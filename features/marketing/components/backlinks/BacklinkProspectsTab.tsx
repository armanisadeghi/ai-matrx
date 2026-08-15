"use client";

/**
 * Prospects — the site-wide competitor link gap, and the top of the outreach
 * funnel: every site that already links to a confirmed competitor and not to
 * us, triaged by a human, then handed to the CRM.
 *
 * Three ideas carry the whole surface:
 *
 *   1. NOTHING IS SPENT BEFORE THE USER SEES WHO WOULD BE COMPARED. The seed
 *      card is a free preview of the paid run — the competitors that qualify,
 *      and the confirmed ones deliberately left out with the reason. When
 *      nothing qualifies (today, on every site) the server's own sentence is
 *      the primary message with a door to the competitors workspace: this is a
 *      NEXT STEP, not a failure.
 *   2. THE SCORE IS NEVER A BARE NUMBER. The Matrx Authority Score is ours, so
 *      opening a row shows every component, what it contributed and why, plus
 *      what we could not measure. A NULL score reads "not measured" — never a
 *      0, never a bare dash, and it never sorts as the worst row.
 *   3. THE EVIDENCE IS ON THE ROW. Which competitors this site links to, and
 *      the real source → target URLs, as real links.
 *
 * Renderer only: the run, the reads, the rulings and the CRM fold all live in
 * `useLinkGapProspects`, so the workspace can put the same values into surface
 * scope without fetching anything twice.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Ban,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Megaphone,
  Radar,
  Target,
  Users,
} from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddToOutreachListDialog } from "@/features/crm/components/outreach-lists/AddToOutreachListDialog";
import {
  InlineQueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  listLinkGapMatches,
  type LinkGapDomainRow,
} from "@/features/marketing/data/page-links";
import { marketingKeys } from "@/features/marketing/data/hooks";
import {
  AUTHORITY_EXPLAINER,
  AUTHORITY_TONE_CLASS,
  authorityTone,
  LINK_GAP_REVIEW_STATUSES,
  linkGapReviewLabel,
  MATCH_COUNT_EXPLAINER,
  matchCountLabel,
  parseMatrxAuthority,
  prospectHeadline,
  seededCompetitorLabel,
  spamToneForScore,
  UNMEASURED_LABEL,
} from "@/features/marketing/components/backlinks/lib/link-gap";
import { headerWithTooltip } from "@/features/marketing/components/backlinks/lib/columns";
import type { LinkGapProspects } from "@/features/marketing/components/backlinks/useLinkGapProspects";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import { cn } from "@/lib/utils";

function scoreCell(row: LinkGapDomainRow) {
  const tone = authorityTone(row.priority_score);
  return (
    <span
      className={cn("text-xs font-medium tabular-nums", AUTHORITY_TONE_CLASS[tone])}
      title={row.priority_reason ?? AUTHORITY_EXPLAINER}
    >
      {row.priority_score === null ? UNMEASURED_LABEL : row.priority_score}
    </span>
  );
}

/** The score, opened up: every component, what it added, and what is missing. */
function AuthorityBreakdown({ row }: { row: LinkGapDomainRow }) {
  const authority = parseMatrxAuthority(row.metadata);
  const tone = authorityTone(row.priority_score);
  return (
    <section className="rounded-md border border-border">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-2.5 py-1.5">
        <span className="text-xs font-semibold text-foreground">
          Matrx Authority Score
        </span>
        <span className="flex items-baseline gap-2">
          <span
            className={cn(
              "text-base font-semibold tabular-nums",
              AUTHORITY_TONE_CLASS[tone],
            )}
          >
            {row.priority_score === null ? UNMEASURED_LABEL : row.priority_score}
          </span>
          {authority.band ? (
            <Badge variant="secondary" className="text-[11px]">
              {authority.band}
            </Badge>
          ) : null}
          {authority.confidence ? (
            <span className="text-[11px] text-muted-foreground">
              {authority.confidence} confidence
            </span>
          ) : null}
        </span>
      </header>
      {authority.why || row.priority_reason ? (
        <p className="border-b border-border px-2.5 py-1.5 text-xs leading-5 text-foreground">
          {authority.why ?? row.priority_reason}
        </p>
      ) : null}
      {authority.components.length ? (
        <ul className="divide-y divide-border">
          {authority.components.map((component) => (
            <li
              key={component.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 px-2.5 py-1.5"
            >
              <span className="min-w-0 text-xs font-medium text-foreground">
                {component.label}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {component.raw === null ? UNMEASURED_LABEL : component.raw}
                {component.contribution === null
                  ? null
                  : ` · ${component.contribution > 0 ? "+" : ""}${component.contribution}`}
              </span>
              {component.why ? (
                <span className="col-span-2 text-[11px] leading-4 text-muted-foreground">
                  {component.why}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
          We have not scored this site yet — that is why it reads{" "}
          {UNMEASURED_LABEL.toLowerCase()} rather than zero. Run the comparison
          again to measure it.
        </p>
      )}
      {authority.missing.length ? (
        <p className="border-t border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">
          Not measured: {authority.missing.join(", ")}
        </p>
      ) : null}
    </section>
  );
}

/** The evidence: which competitors this site already links to, with the URLs. */
function ProspectEvidence({
  row,
  sitePath,
}: {
  row: LinkGapDomainRow;
  sitePath: string;
}) {
  const matches = useQuery({
    queryKey: [
      ...marketingKeys.site(row.site_id),
      "backlinks",
      "link-gap-matches",
      row.id,
    ] as const,
    queryFn: ({ signal }) => listLinkGapMatches(row.id, signal),
  });
  if (matches.isError) {
    return (
      <InlineQueryError
        what="the competitor links from this site"
        error={matches.error}
        onRetry={() => void matches.refetch()}
      />
    );
  }
  const rows = matches.data ?? [];
  return (
    <section className="rounded-md border border-border">
      <header className="border-b border-border px-2.5 py-1.5 text-xs font-semibold text-foreground">
        Who this site links to
      </header>
      {matches.isLoading ? (
        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
          Reading the links…
        </p>
      ) : rows.length === 0 ? (
        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
          The link rows for this site were not stored. Run the comparison again
          to collect them.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((match) => (
            <li key={match.id} className="space-y-0.5 px-2.5 py-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <a
                  href={`https://${match.competitor_domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  {match.competitor_domain}
                  <ExternalLink className="h-3 w-3" />
                </a>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {match.backlinks ?? 1} link
                  {(match.backlinks ?? 1) === 1 ? "" : "s"}
                  {match.is_dofollow === false ? " · nofollow" : ""}
                </span>
              </div>
              {match.source_url ? (
                <a
                  href={match.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-[11px] text-muted-foreground hover:text-primary hover:underline"
                  title={match.source_url}
                >
                  From: {match.source_url}
                </a>
              ) : null}
              {match.target_url ? (
                <a
                  href={match.target_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-[11px] text-muted-foreground hover:text-primary hover:underline"
                  title={match.target_url}
                >
                  To: {match.target_url}
                </a>
              ) : null}
              {match.page_id ? (
                <Link
                  href={`${sitePath}/pages/${match.page_id}`}
                  className="text-[11px] text-primary hover:underline"
                >
                  Open the page of yours this competes with
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ProspectDetail({
  row,
  sitePath,
  partyId,
}: {
  row: LinkGapDomainRow;
  sitePath: string;
  partyId: string | undefined;
}) {
  return (
    <div className="h-full space-y-2 overflow-y-auto p-2.5">
      <p className="text-xs leading-5 text-foreground">
        {prospectHeadline({
          displayDomain: row.display_domain,
          matchCount: row.match_count,
          priorityReason: row.priority_reason,
        })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`https://${row.normalized_domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Open {row.display_domain}
          <ExternalLink className="h-3 w-3" />
        </a>
        {partyId ? (
          <EntityRef
            token="party"
            id={partyId}
            name={`${row.display_domain} in your CRM`}
            openInNewTab
          />
        ) : (
          <span className="text-[11px] text-muted-foreground">
            No CRM record yet — approve it, then create the contact records.
          </span>
        )}
      </div>
      <AuthorityBreakdown row={row} />
      <ProspectEvidence row={row} sitePath={sitePath} />
    </div>
  );
}

/** Who WOULD be compared — the free preview of a paid run. */
function SeedCard({ prospects }: { prospects: LinkGapProspects }) {
  const { seed, seedLoading, seedError } = prospects;
  if (seedError) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        {seedError}{" "}
        <button
          type="button"
          className="underline underline-offset-2"
          onClick={prospects.reloadSeed}
        >
          Try again
        </button>
      </div>
    );
  }
  if (!seed) {
    return (
      <p className="text-xs text-muted-foreground">
        {seedLoading
          ? "Checking which of your competitors qualify…"
          : "We have not checked which competitors qualify yet."}
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      {seed.can_run ? (
        <>
          <p className="text-xs text-foreground">
            We will compare{" "}
            <span className="font-medium">{seed.seeded.length}</span> confirmed
            competitor{seed.seeded.length === 1 ? "" : "s"}. Nothing is spent
            until you press the button.
          </p>
          <ul className="flex flex-wrap gap-1">
            {seed.seeded.map((competitor) => (
              <li key={competitor.competitor_id}>
                <a
                  href={`https://${competitor.domain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 text-[11px] text-foreground hover:border-primary/40 hover:text-primary"
                  title={seededCompetitorLabel(competitor)}
                >
                  {competitor.domain}
                  <span className="text-muted-foreground">
                    {seededCompetitorLabel(competitor)}
                  </span>
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="rounded-md border border-primary/25 bg-primary/[0.05] px-3 py-2">
          <p className="text-xs leading-5 text-foreground">
            {seed.reason ??
              "No competitor has been confirmed for this site yet, so there is nothing to compare against."}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {seed.confirmed_competitors} of {seed.total_competitors} competitors
            confirmed so far.
          </p>
          <Button asChild size="sm" className="mt-1.5 gap-1.5">
            <Link href={`${marketingRoutes.competitors()}?siteId=${prospects.siteId}`}>
              <Users className="h-3.5 w-3.5" />
              Confirm your competitors
            </Link>
          </Button>
        </div>
      )}
      {seed.excluded.length ? (
        <p className="text-[11px] text-muted-foreground">
          Left out: {seed.excluded.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

export function BacklinkProspectsTab({
  prospects,
  sitePath,
  siteDomain,
}: {
  prospects: LinkGapProspects;
  sitePath: string;
  siteDomain: string;
}) {
  const [enrolling, setEnrolling] = useState(false);
  const { seed, run } = prospects;
  const approvedCount = prospects.statusCounts.approved ?? 0;
  const pendingCount = prospects.statusCounts.pending ?? 0;
  const canRun = seed?.can_run === true && !prospects.runDisabled;
  const selectedPartyIds = prospects.selectedIds.flatMap((id) => {
    const partyId = prospects.partyByDomainId[id];
    return partyId ? [partyId] : [];
  });

  const columns: MatrxColumnDef<LinkGapDomainRow>[] = [
    {
      id: "display_domain",
      accessorKey: "display_domain",
      header: "Site",
      filter: "text",
      cell: (row) => {
        const partyId = prospects.partyByDomainId[row.id];
        return (
          <span className="flex min-w-0 items-center gap-1.5">
            <a
              href={`https://${row.normalized_domain}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="inline-flex min-w-0 items-center gap-1 truncate text-xs font-medium text-primary hover:underline"
              title={`Open ${row.display_domain}`}
            >
              <span className="truncate">{row.display_domain}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
            {partyId ? (
              <EntityRef
                token="party"
                id={partyId}
                name="In your CRM"
                openInNewTab
                showIcon={false}
                className="shrink-0 text-[11px]"
              />
            ) : null}
          </span>
        );
      },
    },
    {
      id: "match_count",
      accessorKey: "match_count",
      header: headerWithTooltip("Competitors linked", MATCH_COUNT_EXPLAINER),
      filter: "number",
      align: "right",
      cell: (row) => (
        <span
          className="text-xs font-medium tabular-nums text-foreground"
          title={matchCountLabel(row.match_count)}
        >
          {row.match_count}
        </span>
      ),
    },
    {
      id: "priority_score",
      accessorKey: "priority_score",
      header: headerWithTooltip("Authority", AUTHORITY_EXPLAINER),
      filter: "number",
      align: "right",
      cell: scoreCell,
    },
    {
      id: "domain_rank",
      accessorKey: "domain_rank",
      header: "Provider rank",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {row.domain_rank ?? UNMEASURED_LABEL}
        </span>
      ),
    },
    {
      id: "spam_score",
      accessorKey: "spam_score",
      header: "Spam",
      filter: "number",
      align: "right",
      cell: (row) => {
        const tone = spamToneForScore(row.spam_score);
        return (
          <span
            className={cn(
              "text-xs tabular-nums",
              tone === "toxic"
                ? "text-destructive"
                : tone === "watch"
                  ? "text-warning"
                  : "text-muted-foreground",
            )}
          >
            {row.spam_score ?? UNMEASURED_LABEL}
          </span>
        );
      },
    },
    {
      id: "total_backlinks",
      accessorKey: "total_backlinks",
      header: "Links they have",
      filter: "number",
      align: "right",
      cell: (row) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {row.total_backlinks?.toLocaleString() ?? UNMEASURED_LABEL}
        </span>
      ),
    },
    {
      id: "review_status",
      accessorKey: "review_status",
      header: "Your call",
      filter: "select",
      filterOptions: LINK_GAP_REVIEW_STATUSES.map((value) => ({
        value,
        label: linkGapReviewLabel(value),
      })),
      cell: (row) => (
        <Badge
          variant={row.review_status === "approved" ? "default" : "secondary"}
          className="text-[11px]"
        >
          {linkGapReviewLabel(row.review_status)}
        </Badge>
      ),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <SectionCard title="Find sites that link to your competitors" anchor="link_gap_seed">
        <div className="flex flex-wrap items-start justify-between gap-3 p-2.5">
          <div className="min-w-64 flex-1 space-y-1.5">
            <SeedCard prospects={prospects} />
            {run.blockedReason ? (
              <p className="rounded-md border border-primary/25 bg-primary/[0.05] px-2.5 py-1.5 text-xs text-foreground">
                {run.blockedReason}
              </p>
            ) : null}
            {run.status === "running" ? (
              <p
                className="flex items-center gap-1.5 text-xs text-foreground"
                data-surface-value="link_gap_run"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {run.stage ?? "Working"}
                {run.runId ? (
                  <Link
                    href={`${sitePath}/backlinks?view=prospects&runId=${run.runId}`}
                    className="text-[11px] text-primary hover:underline"
                    title="This run's id"
                  >
                    run {run.runId.slice(0, 8)}
                  </Link>
                ) : null}
              </p>
            ) : null}
            {run.status === "error" && run.error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
                {run.error}
              </p>
            ) : null}
            {run.status === "done" && run.receipt ? (
              <p className="text-xs text-muted-foreground">
                Compared {run.receipt.seeded.length} competitor
                {run.receipt.seeded.length === 1 ? "" : "s"} against{" "}
                {run.receipt.site_domain}.
              </p>
            ) : null}
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!canRun || run.status === "running"}
            title={
              canRun
                ? `Find the sites that link to your competitors but not to ${siteDomain}`
                : "Confirm at least one competitor first"
            }
            onClick={() => void prospects.startRun()}
          >
            {run.status === "running" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Radar className="h-3.5 w-3.5" />
            )}
            Find prospects
          </Button>
        </div>
      </SectionCard>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {pendingCount} waiting on you · {approvedCount} approved
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto gap-1.5"
          disabled={approvedCount === 0 || prospects.folding}
          title={
            approvedCount === 0
              ? "Approve a prospect first — approval is what makes it a contact record"
              : "Turn every approved prospect into a contact record in your CRM"
          }
          onClick={() => void prospects.foldApproved()}
        >
          {prospects.folding ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Users className="h-3.5 w-3.5" />
          )}
          Create CRM records ({approvedCount})
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={selectedPartyIds.length === 0}
          title={
            selectedPartyIds.length
              ? "Add the selected prospects' contact records to an outreach list"
              : "Select approved prospects that already have a CRM record"
          }
          onClick={() => setEnrolling(true)}
        >
          <Megaphone className="h-3.5 w-3.5" />
          Add to outreach ({selectedPartyIds.length})
        </Button>
        <Button asChild size="sm" variant="ghost" className="gap-1.5">
          <Link href={`${marketingRoutes.competitors()}?siteId=${prospects.siteId}`}>
            <Users className="h-3.5 w-3.5" />
            Competitors
          </Link>
        </Button>
      </div>

      {prospects.foldReport ? (
        <p className="text-[11px] text-muted-foreground">
          Last run: {prospects.foldReport.created} created,{" "}
          {prospects.foldReport.matched} matched,{" "}
          {prospects.foldReport.already_linked} already had a record
          {prospects.foldReport.skipped.length
            ? ` · ${prospects.foldReport.skipped.length} skipped (${prospects.foldReport.skipped[0].reason})`
            : ""}
          .
        </p>
      ) : null}

      {prospects.isError ? (
        <InlineQueryError
          what="your prospect list"
          error={prospects.error}
          onRetry={prospects.refetch}
        />
      ) : (
        <MatrxDataTable
          data={prospects.rows}
          columns={columns}
          getRowId={(row) => row.id}
          isLoading={prospects.isLoading}
          isFetching={prospects.isFetching}
          query={{
            mode: "controlled",
            totalItems: prospects.total,
            state: prospects.table.state,
            onStateChange: prospects.table.onStateChange,
          }}
          toolbar={{ searchPlaceholder: "Search prospect sites…" }}
          selection={{
            selectedIds: prospects.selectedIds,
            onSelectedIdsChange: prospects.setSelectedIds,
            noun: "prospect",
            actions: (_selected, selectedIds) => (
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  className="gap-1"
                  disabled={prospects.reviewing}
                  onClick={() => void prospects.review(selectedIds, "approved")}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={prospects.reviewing}
                  onClick={() => void prospects.review(selectedIds, "snoozed")}
                >
                  <Clock className="h-3.5 w-3.5" />
                  Later
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                  disabled={prospects.reviewing}
                  onClick={() => void prospects.review(selectedIds, "rejected")}
                >
                  <Ban className="h-3.5 w-3.5" />
                  Not for us
                </Button>
              </div>
            ),
          }}
          rowActions={(row) => (
            <div className="flex items-center gap-1">
              {row.review_status === "approved" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={prospects.reviewing}
                  onClick={() => void prospects.review([row.id], "pending")}
                >
                  Undo
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  disabled={prospects.reviewing}
                  onClick={() => void prospects.review([row.id], "approved")}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Approve
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                disabled={prospects.reviewing}
                onClick={() => void prospects.review([row.id], "rejected")}
              >
                Reject
              </Button>
            </div>
          )}
          detail={{
            title: (row) => row.display_domain,
            description: (row) => matchCountLabel(row.match_count),
            render: (row) => (
              <ProspectDetail
                row={row}
                sitePath={sitePath}
                partyId={prospects.partyByDomainId[row.id]}
              />
            ),
          }}
          window={{
            title: (row) => row.display_domain,
            renderView: (row) => (
              <ProspectDetail
                row={row}
                sitePath={sitePath}
                partyId={prospects.partyByDomainId[row.id]}
              />
            ),
            enabled: true,
          }}
          copy={{
            label: "Prospect",
            listLabel: "Link prospects",
            location: webLocation(`Backlinks — ${siteDomain} — Prospects`),
            rowKind: "seo-link-prospect",
            listKind: "seo-link-prospects",
            humanRow: (row) =>
              humanLines([
                ["Site", row.display_domain],
                ["Competitors it links to", row.match_count],
                [
                  "Matrx Authority Score",
                  row.priority_score ?? UNMEASURED_LABEL,
                ],
                ["Why", row.priority_reason ?? "Not scored yet"],
                ["Spam score", row.spam_score ?? UNMEASURED_LABEL],
                ["Your call", linkGapReviewLabel(row.review_status)],
              ]),
          }}
          pageSize={50}
          pageSizeOptions={[25, 50, 100]}
          emptyState={{
            icon: <Target className="h-8 w-8 text-muted-foreground" />,
            title: "No prospects yet",
            description: seed?.can_run
              ? `Run the comparison to find the sites that link to your competitors but not to ${siteDomain}.`
              : "Confirm at least one competitor, then run the comparison — the prospects come from who links to them.",
            action: seed?.can_run ? undefined : (
              <Button asChild size="sm" className="gap-1.5">
                <Link
                  href={`${marketingRoutes.competitors()}?siteId=${prospects.siteId}`}
                >
                  <Users className="h-3.5 w-3.5" />
                  Confirm your competitors
                </Link>
              </Button>
            ),
          }}
          className="min-h-0 flex-1"
        />
      )}

      <AddToOutreachListDialog
        open={enrolling}
        onOpenChange={setEnrolling}
        // DNC awareness reads the LOADED party rows; this surface holds link
        // prospects, not party rows, so the dialog's own check is the honest
        // one and the dialer stays the enforcement layer either way.
        selectedRows={[]}
        selectedIds={selectedPartyIds}
        onDone={() => prospects.setSelectedIds([])}
      />
    </div>
  );
}
