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

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Ban,
  BrainCircuit,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  ListPlus,
  Loader2,
  Megaphone,
  Search,
  Unlink,
  Users,
} from "lucide-react";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AddToOutreachListDialog } from "@/features/crm/components/outreach-lists/AddToOutreachListDialog";
import {
  InlineQueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  listSerpMentions,
  mentionBrokenLinks,
  mentionLinkCheck,
  type SerpMentionRow,
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
export const BROKEN_LINKS_EXPLAINER =
  "Links on this site's pages that point at something no longer there. Each one is a reason to write: you are telling them about a real problem and offering a replacement. Blank means we have not checked this site's pages yet — 0 means we checked and every link works.";

/**
 * 🚨 Blank and zero are DIFFERENT sentences and must never render alike.
 * `null` = we never looked. `0` = we looked and everything works. Showing a
 * dash for both would tell the user we checked when we did not.
 */
function BrokenLinkCell({ row }: { row: SerpOpportunityRow }) {
  if (row.broken_link_count === null) {
    return (
      <span
        className="text-xs text-muted-foreground/60"
        title="We have not checked this site's pages yet."
      >
        Not checked
      </span>
    );
  }
  if (row.broken_link_count === 0) {
    return (
      <span
        className="text-xs tabular-nums text-muted-foreground"
        title="We checked this site's pages — every link we could reach works."
      >
        0
      </span>
    );
  }
  return (
    <span
      className="text-xs font-semibold tabular-nums text-amber-600 dark:text-amber-500"
      title={`${row.broken_link_count} link${row.broken_link_count === 1 ? "" : "s"} on this site point somewhere that no longer exists — that is your opening.`}
    >
      {row.broken_link_count}
    </span>
  );
}

/** The dead links found on one candidate page — every one a door. */
function BrokenLinkList({ mention }: { mention: SerpMentionRow }) {
  const check = mentionLinkCheck(mention);
  const broken = mentionBrokenLinks(mention);
  if (!check) return null;
  if (check.outcome === "unreachable") {
    return (
      <p className="text-[11px] text-muted-foreground">
        This page would not let us read it
        {check.http_status ? ` (${check.http_status})` : ""}, so its links are
        unchecked.
      </p>
    );
  }
  const unverifiable = check.unverifiable_count ?? 0;
  if (broken.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground">
        Checked {check.outbound_checked ?? 0} outgoing link
        {(check.outbound_checked ?? 0) === 1 ? "" : "s"} — all working
        {unverifiable
          ? `, ${unverifiable} we were not allowed to check`
          : ""}
        .
      </p>
    );
  }
  return (
    <div className="space-y-0.5 rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1">
      <p className="text-[11px] font-medium text-amber-700 dark:text-amber-500">
        {broken.length} broken link{broken.length === 1 ? "" : "s"} on this page
        — your opening
      </p>
      <ul className="space-y-0.5">
        {broken.map((link) => (
          <li key={link.dead_url} className="flex min-w-0 items-baseline gap-1.5">
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {link.http_status}
            </span>
            <a
              href={link.dead_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="min-w-0 truncate text-[11px] text-muted-foreground hover:text-primary hover:underline"
              title={link.dead_url}
            >
              {link.anchor_text ? `“${link.anchor_text}” → ` : ""}
              {link.dead_url}
            </a>
          </li>
        ))}
      </ul>
      {unverifiable ? (
        <p className="text-[10px] text-muted-foreground">
          {unverifiable} more link{unverifiable === 1 ? "" : "s"} refused our
          check (bot walls, paywalls) — those are almost certainly fine and are
          not counted.
        </p>
      ) : null}
    </div>
  );
}

const IMPORT_VERDICT_LABEL: Record<string, string> = {
  new: "Will be added",
  existing: "Already a prospect",
  duplicate_in_list: "Listed twice",
  blocklisted: "Blocked",
  unusable: "Not a web address",
};

const IMPORT_VERDICT_TONE: Record<string, string> = {
  new: "text-emerald-600 dark:text-emerald-400",
  existing: "text-muted-foreground",
  duplicate_in_list: "text-muted-foreground",
  blocklisted: "text-destructive",
  unusable: "text-amber-600 dark:text-amber-500",
};

/**
 * A list the user already has, becoming ordinary prospects.
 *
 * THE DRY-RUN IS THE POINT. The user sees every entry's fate and the price
 * BEFORE anything is written — the same contract the contact importer's wizard
 * makes, for the same reason: nobody should learn what an import did after it
 * did it.
 */
function ImportListDialog({
  open,
  onOpenChange,
  prospects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospects: SerpProspects;
}) {
  const [text, setText] = useState("");
  const [label, setLabel] = useState("Imported list");
  const entries = text
    .split(/[\n,;\t]/)
    .map((line) => line.trim())
    .filter(Boolean);
  const state = prospects.importState;
  const previewed = state.status === "previewed" && state.preview;
  const busy = state.status === "previewing" || state.status === "running";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a list of sites</DialogTitle>
          <DialogDescription>
            Paste web addresses or domains — one per line, or separated by
            commas. They join this prospect list, deduplicated against what you
            already have and scored the same way. We check them before anything
            is saved.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="What is this list? e.g. Conference sponsors 2026"
            className="h-8 text-xs"
          />
          <Textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (state.status !== "idle") prospects.resetImport();
            }}
            rows={7}
            placeholder={"example.com\nhttps://another-site.org/blog\n…"}
            className="text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            {entries.length} entr{entries.length === 1 ? "y" : "ies"}
          </p>
        </div>

        {state.status === "error" ? (
          <p className="text-xs text-destructive">{state.error}</p>
        ) : null}

        {previewed && state.preview ? (
          <div className="space-y-1.5">
            <p className="text-xs text-foreground">
              {state.preview.new_domains} will be added ·{" "}
              {state.preview.existing_domains} already yours ·{" "}
              {state.preview.skipped} skipped
              {Number(state.preview.estimated_cost_usd) > 0
                ? ` · about $${Number(state.preview.estimated_cost_usd).toFixed(2)} to measure their authority`
                : ""}
            </p>
            <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border">
              {state.preview.entries.map((entry, index) => (
                <li
                  key={`${entry.raw}-${index}`}
                  className="flex items-baseline gap-2 px-2.5 py-1.5"
                >
                  <span
                    className={cn(
                      "w-32 shrink-0 text-[11px] font-medium",
                      IMPORT_VERDICT_TONE[entry.verdict] ??
                        "text-muted-foreground",
                    )}
                  >
                    {IMPORT_VERDICT_LABEL[entry.verdict] ?? entry.verdict}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                    {entry.why}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {state.status === "done" && state.report ? (
          <p className="text-xs text-foreground">
            {state.report.created} added · {state.report.matched} already yours ·{" "}
            {state.report.skipped} skipped
            {state.report.enriched
              ? ` · ${state.report.enriched} measured`
              : ""}
            .
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={entries.length === 0 || busy}
            onClick={() => void prospects.previewImport(entries, label)}
          >
            {state.status === "previewing" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Check this list
          </Button>
          <Button
            size="sm"
            disabled={!previewed || busy || state.preview?.new_domains === 0}
            title={
              previewed
                ? undefined
                : "Check the list first — you should see what will happen before it happens"
            }
            onClick={() => void prospects.runImport(entries, label)}
          >
            {state.status === "running" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Add {state.preview?.new_domains ?? 0} to my prospects
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
              <BrokenLinkList mention={mention} />
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
  const [importing, setImporting] = useState(false);
  const approvedCount = prospects.statusCounts.approved ?? 0;
  const pendingCount = prospects.statusCounts.pending ?? 0;
  const selectedPartyIds = prospects.selectedIds.flatMap((id) => {
    const partyId = prospects.partyByOpportunityId[id];
    return partyId ? [partyId] : [];
  });

  const columns: MatrxColumnDef<SerpOpportunityRow>[] = [
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
        id: "broken_link_count",
        accessorKey: "broken_link_count",
        header: headerWithTooltip("Broken links", BROKEN_LINKS_EXPLAINER),
        filter: "number",
        align: "right",
        cell: (row) => <BrokenLinkCell row={row} />,
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
  ];

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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={prospects.brokenLinkRun.status === "running"}
          title="Open the resource pages and best-of lists we found, and check every link on them. A link pointing at something that no longer exists is your opening — you are telling them about a real problem."
          onClick={() => void prospects.checkBrokenLinks()}
        >
          {prospects.brokenLinkRun.status === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Unlink className="h-3.5 w-3.5" />
          )}
          Find broken links
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          title="Paste a list of sites you already have. They join this list, deduplicated and scored the same way."
          onClick={() => setImporting(true)}
        >
          <ListPlus className="h-3.5 w-3.5" />
          Import a list
        </Button>
        {prospects.brokenLinkRun.status === "running" &&
        prospects.brokenLinkRun.stage ? (
          <span className="truncate text-[11px] text-muted-foreground">
            {prospects.brokenLinkRun.stage}
          </span>
        ) : null}
        {prospects.brokenLinkRun.status === "done" &&
        prospects.brokenLinkRun.report ? (
          <span className="text-[11px] text-muted-foreground">
            Checked {prospects.brokenLinkRun.report.outbound_checked} link
            {prospects.brokenLinkRun.report.outbound_checked === 1 ? "" : "s"} on{" "}
            {prospects.brokenLinkRun.report.pages_checked} page
            {prospects.brokenLinkRun.report.pages_checked === 1 ? "" : "s"} ·{" "}
            {prospects.brokenLinkRun.report.dead_links} broken
            {prospects.brokenLinkRun.report.unverifiable_links
              ? ` · ${prospects.brokenLinkRun.report.unverifiable_links} would not let us check (not counted as broken)`
              : ""}
          </span>
        ) : null}
        {prospects.brokenLinkRun.status === "error" ? (
          <span className="text-[11px] text-destructive">
            {prospects.brokenLinkRun.error}
          </span>
        ) : null}
      </div>

      <ImportListDialog
        open={importing}
        onOpenChange={(next) => {
          setImporting(next);
          if (!next) prospects.resetImport();
        }}
        prospects={prospects}
      />

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
