"use client";

/**
 * SERP prospecting — the SECOND method on the one Prospects surface: instead
 * of "who links to my competitors", this asks "who does Google already rank
 * for the searches my topics live in?", then hands the same triage list to
 * the same review + CRM path the link gap uses.
 *
 * The three ideas of the Prospects surface carry over unchanged:
 *
 *   1. NOTHING IS SPENT BEFORE THE USER SEES WHAT WOULD BE SEARCHED. The
 *      preview lists every expanded query, grouped by search type, with the
 *      estimated cost — and editing the keywords voids the preview, because
 *      a preview is a promise about ONE exact request.
 *   2. THE SCORE IS NEVER A BARE NUMBER — the shared Matrx Authority cell
 *      and breakdown render here exactly as they do on the link gap.
 *   3. THE EVIDENCE IS ON THE ROW — which searches this site ranks in, at
 *      what position, with the real result URLs as real links.
 *
 * Renderer only: the run, the reads, the rulings, the CRM fold and the
 * volume check all live in `useSerpProspects`.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Ban,
  BrainCircuit,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  Loader2,
  Megaphone,
  Search,
  Users,
} from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { AddToOutreachListDialog } from "@/features/crm/components/outreach-lists/AddToOutreachListDialog";
import {
  InlineQueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  listSerpMentions,
  type SerpOpportunityRow,
} from "@/features/marketing/data/serp-prospects";
import { marketingKeys } from "@/features/marketing/data/hooks";
import {
  AUTHORITY_EXPLAINER,
  LINK_GAP_REVIEW_STATUSES,
  linkGapReviewLabel,
  spamToneForScore,
  UNMEASURED_LABEL,
} from "@/features/marketing/components/backlinks/lib/link-gap";
import {
  MENTION_COUNT_EXPLAINER,
  mentionCountLabel,
  SERP_PROSPECTING_MAX_KEYWORDS,
  SERP_QUERY_VARIANTS,
  serpVariantLabel,
} from "@/features/marketing/components/backlinks/lib/serp-prospecting";
import {
  AuthorityBreakdown,
  AuthorityScoreCell,
} from "@/features/marketing/components/backlinks/MatrxAuthorityScore";
import { headerWithTooltip } from "@/features/marketing/components/backlinks/lib/columns";
import type { SerpProspects } from "@/features/marketing/components/backlinks/useSerpProspects";
import { normalizeKeywordPhrase } from "@/features/marketing/seo/keyword/data";
import { SurfaceRoleAgentButton } from "@/features/surfaces/components/chrome/SurfaceRoleAgentButton";
import { useSurfaceAgentRoles } from "@/features/surfaces/hooks/useSurfaceConfig";
import {
  humanLines,
  webLocation,
} from "@/features/marketing/lib/copy-payloads";
import { cn } from "@/lib/utils";

const BACKLINKS_SURFACE_NAME = "matrx-user/marketing-backlinks";
const KEYWORD_EXPANDER_ROLE = "keyword_expander";

/** The evidence: the searches this site already ranks in, with the URLs. */
function MentionEvidence({ row }: { row: SerpOpportunityRow }) {
  const mentions = useQuery({
    queryKey: [
      ...marketingKeys.site(row.site_id),
      "backlinks",
      "serp-mentions",
      row.id,
    ] as const,
    queryFn: ({ signal }) => listSerpMentions(row.id, signal),
  });
  if (mentions.isError) {
    return (
      <InlineQueryError
        what="the search results this site ranks in"
        error={mentions.error}
        onRetry={() => void mentions.refetch()}
      />
    );
  }
  const rows = mentions.data ?? [];
  return (
    <section className="rounded-md border border-border">
      <header className="border-b border-border px-2.5 py-1.5 text-xs font-semibold text-foreground">
        Where this site already ranks
      </header>
      {mentions.isLoading ? (
        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
          Reading the results…
        </p>
      ) : rows.length === 0 ? (
        <p className="px-2.5 py-1.5 text-xs text-muted-foreground">
          The result rows for this site were not stored. Run the search again
          to collect them.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((mention) => (
            <li key={mention.id} className="space-y-0.5 px-2.5 py-1.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="min-w-0 text-xs font-medium text-foreground">
                  {mention.query}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {serpVariantLabel(mention.variant)}
                  {mention.rank === null ? "" : ` · #${mention.rank}`}
                </span>
              </div>
              <a
                href={mention.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-[11px] text-muted-foreground hover:text-primary hover:underline"
                title={mention.url}
              >
                {mention.title ?? mention.url}
              </a>
              {mention.snippet ? (
                <p className="text-[11px] leading-4 text-muted-foreground">
                  {mention.snippet}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OpportunityDetail({
  row,
  partyId,
}: {
  row: SerpOpportunityRow;
  partyId: string | undefined;
}) {
  return (
    <div className="h-full space-y-2 overflow-y-auto p-2.5">
      <p className="text-xs leading-5 text-foreground">
        {row.priority_reason?.trim() ||
          `${row.display_domain} already ranks in ${row.mention_count} of your search${row.mention_count === 1 ? "" : "es"} — the search engines already trust it on your subject.`}
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
      <AuthorityBreakdown
        score={row.priority_score}
        reason={row.priority_reason}
        metadata={row.metadata}
      />
      <MentionEvidence row={row} />
    </div>
  );
}

/** What the run WOULD search, grouped by search type, with the cost. */
function PreviewCard({ prospects }: { prospects: SerpProspects }) {
  const { preview } = prospects;
  if (!preview) return null;
  const byVariant = new Map<string, string[]>();
  for (const query of preview.queries) {
    const list = byVariant.get(query.variant) ?? [];
    list.push(query.query);
    byVariant.set(query.variant, list);
  }
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-card px-2.5 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">
          {preview.queries.length} search
          {preview.queries.length === 1 ? "" : "es"} would run
        </span>
        <span className="inline-flex items-center gap-1 text-xs tabular-nums text-foreground">
          <DollarSign className="h-3 w-3 text-muted-foreground" />
          about ${preview.estimated_cost_usd} — nothing is spent until you
          press Run
        </span>
      </div>
      {[...byVariant.entries()].map(([variant, queries]) => (
        <div key={variant}>
          <p className="text-[11px] font-medium text-muted-foreground">
            {serpVariantLabel(variant)}
          </p>
          <ul className="flex flex-wrap gap-1 pt-0.5">
            {queries.map((query) => (
              <li
                key={query}
                className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground"
              >
                {query}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {preview.dropped?.length ? (
        <p className="text-[11px] text-muted-foreground">
          Left out: {preview.dropped.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

/** The keyword entry + variants + preview — the free half of the run. */
function SerpSetupPanel({ prospects }: { prospects: SerpProspects }) {
  const [draft, setDraft] = useState("");
  const { roles } = useSurfaceAgentRoles(BACKLINKS_SURFACE_NAME);
  const expanderBound = Boolean(
    roles[KEYWORD_EXPANDER_ROLE]?.effectiveAgentId,
  );
  const { run } = prospects;

  const applyDraft = (value: string) => {
    setDraft(value);
    const keywords = [
      ...new Set(
        value
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    ];
    prospects.setKeywords(keywords);
  };

  const overLimit = prospects.keywords.length > SERP_PROSPECTING_MAX_KEYWORDS;

  return (
    <div className="flex flex-wrap items-start gap-3 p-2.5">
      <div className="min-w-64 flex-1 space-y-1.5">
        <label
          htmlFor="serp-prospecting-keywords"
          className="text-xs font-medium text-foreground"
        >
          What should we search for?
        </label>
        <Textarea
          id="serp-prospecting-keywords"
          value={draft}
          onChange={(event) => applyDraft(event.target.value)}
          placeholder={"One topic per line, in plain words — for example:\nhome espresso machines\nlatte art tutorials"}
          rows={4}
          className="text-xs"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "text-[11px] tabular-nums",
              overLimit ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {prospects.keywords.length} of {SERP_PROSPECTING_MAX_KEYWORDS}{" "}
            keywords
          </span>
          {expanderBound ? (
            <SurfaceRoleAgentButton
              surfaceName={BACKLINKS_SURFACE_NAME}
              roleName={KEYWORD_EXPANDER_ROLE}
              label="Expand with AI"
              size="xs"
            />
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled
              className="h-6 gap-1 px-2 text-[11px]"
              title="An AI keyword assistant hasn't been assigned yet — enter keywords manually."
            >
              <BrainCircuit className="h-3 w-3" />
              Expand with AI
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            disabled={!prospects.keywords.length || prospects.volumesLoading}
            title="Look up how many people search each keyword every month"
            onClick={() => void prospects.checkVolumes()}
          >
            {prospects.volumesLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Search className="h-3 w-3" />
            )}
            Check search volume
          </Button>
        </div>
        {prospects.volumesError ? (
          <p className="text-[11px] text-destructive">
            {prospects.volumesError}
          </p>
        ) : null}
        {prospects.keywords.length &&
        Object.keys(prospects.volumes).length ? (
          <ul className="flex flex-wrap gap-1">
            {prospects.keywords.map((keyword) => {
              const entry =
                prospects.volumes[normalizeKeywordPhrase(keyword)];
              return (
                <li
                  key={keyword}
                  className="inline-flex items-center gap-1 rounded border border-border bg-card px-1.5 py-0.5 text-[11px] text-foreground"
                >
                  {keyword}
                  <span className="tabular-nums text-muted-foreground">
                    {entry?.checked
                      ? entry.volume === null
                        ? "volume unknown"
                        : `${entry.volume.toLocaleString()}/mo`
                      : "not checked"}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        <fieldset className="space-y-1 pt-1">
          <legend className="text-xs font-medium text-foreground">
            What kinds of search?
          </legend>
          {SERP_QUERY_VARIANTS.map((variant) => (
            <label
              key={variant.value}
              className="flex cursor-pointer items-start gap-2"
            >
              <Checkbox
                checked={prospects.variants.includes(variant.value)}
                onCheckedChange={() => prospects.toggleVariant(variant.value)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="text-xs font-medium text-foreground">
                  {variant.label}
                </span>
                <span className="block text-[11px] leading-4 text-muted-foreground">
                  {variant.explanation}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        {prospects.previewError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
            {prospects.previewError}
          </p>
        ) : null}
        <PreviewCard prospects={prospects} />
        {run.inputError ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
            {run.inputError}
          </p>
        ) : null}
        {run.status === "running" ? (
          <p className="flex items-center gap-1.5 text-xs text-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {run.stage ?? "Working"}
          </p>
        ) : null}
        {run.status === "error" && run.error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
            {run.error}
          </p>
        ) : null}
        {run.status === "done" && run.receipt ? (
          <p className="text-xs text-muted-foreground">
            Searched {run.receipt.queries.length} quer
            {run.receipt.queries.length === 1 ? "y" : "ies"} ·{" "}
            {run.receipt.enriched_domains} site
            {run.receipt.enriched_domains === 1 ? "" : "s"} measured
            {run.receipt.unmeasured_domains
              ? ` · ${run.receipt.unmeasured_domains} we could not measure`
              : ""}
            .
          </p>
        ) : null}
      </div>
      <div className="flex flex-col items-stretch gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={
            !prospects.keywords.length ||
            overLimit ||
            prospects.previewLoading ||
            prospects.runDisabled
          }
          title="See every search that would run, and what it would cost, before spending anything"
          onClick={() => void prospects.loadPreview()}
        >
          {prospects.previewLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Preview searches
        </Button>
        <Button
          size="sm"
          className="gap-1.5"
          disabled={
            !prospects.preview ||
            prospects.runDisabled ||
            run.status === "running"
          }
          title={
            prospects.preview
              ? "Run the previewed searches and build your prospect list"
              : "Preview the searches first — the preview is free and shows the cost"
          }
          onClick={() => void prospects.startRun()}
        >
          {run.status === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Find prospects
        </Button>
      </div>
    </div>
  );
}

export function SerpProspectsTab({
  prospects,
  siteDomain,
}: {
  prospects: SerpProspects;
  siteDomain: string;
}) {
  const [enrolling, setEnrolling] = useState(false);
  const approvedCount = prospects.statusCounts.approved ?? 0;
  const pendingCount = prospects.statusCounts.pending ?? 0;
  const selectedPartyIds = prospects.selectedIds.flatMap((id) => {
    const partyId = prospects.partyByOpportunityId[id];
    return partyId ? [partyId] : [];
  });

  const columns: MatrxColumnDef<SerpOpportunityRow>[] = useMemo(
    () => [
      {
        id: "display_domain",
        accessorKey: "display_domain",
        header: "Site",
        filter: "text",
        cell: (row) => {
          const partyId = prospects.partyByOpportunityId[row.id];
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
        id: "mention_count",
        accessorKey: "mention_count",
        header: headerWithTooltip("Ranks in your searches", MENTION_COUNT_EXPLAINER),
        filter: "number",
        align: "right",
        cell: (row) => (
          <span
            className="text-xs font-medium tabular-nums text-foreground"
            title={mentionCountLabel(row.mention_count)}
          >
            {row.mention_count}
          </span>
        ),
      },
      {
        id: "priority_score",
        accessorKey: "priority_score",
        header: headerWithTooltip("Authority", AUTHORITY_EXPLAINER),
        filter: "number",
        align: "right",
        cell: (row) => (
          <AuthorityScoreCell
            score={row.priority_score}
            reason={row.priority_reason}
          />
        ),
      },
      {
        id: "best_rank",
        accessorKey: "best_rank",
        header: "Best position",
        filter: "number",
        align: "right",
        cell: (row) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {row.best_rank === null ? UNMEASURED_LABEL : `#${row.best_rank}`}
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
    ],
    [prospects.partyByOpportunityId],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <SectionCard
        title="Find sites already ranking for your searches"
        anchor="serp_prospecting_setup"
      >
        <SerpSetupPanel prospects={prospects} />
      </SectionCard>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className="text-xs text-muted-foreground"
          data-surface-value="serp_prospecting_review_backlog"
        >
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
      </div>

      {prospects.foldReport ? (
        <p className="text-[11px] text-muted-foreground">
          Last run: {prospects.foldReport.created} created,{" "}
          {prospects.foldReport.matched} matched,{" "}
          {prospects.foldReport.already_linked} already had a record
          {prospects.foldReport.skipped?.length
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
        <div
          className="flex min-h-0 flex-1 flex-col"
          data-surface-value="serp_prospecting_prospects"
        >
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
                    onClick={() =>
                      void prospects.review(selectedIds, "approved")
                    }
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    disabled={prospects.reviewing}
                    onClick={() =>
                      void prospects.review(selectedIds, "snoozed")
                    }
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Later
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1"
                    disabled={prospects.reviewing}
                    onClick={() =>
                      void prospects.review(selectedIds, "rejected")
                    }
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
              description: (row) => mentionCountLabel(row.mention_count),
              render: (row) => (
                <OpportunityDetail
                  row={row}
                  partyId={prospects.partyByOpportunityId[row.id]}
                />
              ),
            }}
            window={{
              title: (row) => row.display_domain,
              renderView: (row) => (
                <OpportunityDetail
                  row={row}
                  partyId={prospects.partyByOpportunityId[row.id]}
                />
              ),
              enabled: true,
            }}
            copy={{
              label: "Prospect",
              listLabel: "Search-result prospects",
              location: webLocation(
                `Backlinks — ${siteDomain} — Prospects (search results)`,
              ),
              rowKind: "seo-serp-prospect",
              listKind: "seo-serp-prospects",
              humanRow: (row) =>
                humanLines([
                  ["Site", row.display_domain],
                  ["Searches it ranks in", row.mention_count],
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
              icon: <Search className="h-8 w-8 text-muted-foreground" />,
              title: "No prospects yet",
              description: `Enter the topics your work lives in, preview the searches, then run them — the prospects are the sites already ranking around ${siteDomain}.`,
            }}
            className="min-h-0 flex-1"
          />
        </div>
      )}

      <AddToOutreachListDialog
        open={enrolling}
        onOpenChange={setEnrolling}
        // Same honest shape as the link-gap tab: this surface holds SERP
        // prospects, not party rows, so the dialog's own DNC check is the
        // truthful one and the dialer stays the enforcement layer.
        selectedRows={[]}
        selectedIds={selectedPartyIds}
        onDone={() => prospects.setSelectedIds([])}
      />
    </div>
  );
}
