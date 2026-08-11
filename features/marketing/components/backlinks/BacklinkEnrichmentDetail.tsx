"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BrainCircuit,
  ExternalLink,
  Loader2,
  Newspaper,
  Save,
} from "lucide-react";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BacklinkEnrichmentRunPanel } from "@/features/marketing/components/backlinks/BacklinkEnrichmentRunPanel";
import {
  backlinkAnalysisActionState,
  hasBacklinkAssessment,
  humanizeAssessmentValue,
  jsonRecord,
  parseBacklinkAssessment,
  providerExtras,
} from "@/features/marketing/components/backlinks/lib/enrichment";
import {
  backlinkActionLabel,
  backlinkControlLabel,
  backlinkPageTypeLabel,
  backlinkRelevanceLabel,
  backlinkReviewStatusLabel,
  backlinkStateLabel,
  linkAttributeLabel,
  linkPlacementLabel,
  linkTypeLabel,
  SPAM_SCORE_EXPLAINER,
} from "@/features/marketing/components/backlinks/lib/vocab";
import { parseObservationExtras } from "@/features/marketing/components/backlinks/lib/extras";
import {
  formatDate,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import type { BacklinkObservationRow } from "@/features/marketing/data/backlinks-types";
import type { BacklinkEnrichmentRunState } from "@/features/marketing/components/backlinks/lib/enrichment-run";
import { useBacklinkRecord } from "@/features/marketing/data/backlinks-hooks";
import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import { toast } from "@/lib/toast";

function fact(label: string, value: ReactNode) {
  return (
    <div className="min-w-0 rounded-md border border-border/60 bg-muted/20 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 break-words text-xs text-foreground">
        {value === null || value === undefined || value === "" ? "—" : value}
      </div>
    </div>
  );
}

function section(title: string, children: ReactNode, description?: string) {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <h2 className="text-xs font-semibold text-foreground">{title}</h2>
      {description ? (
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          {description}
        </p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function externalUrl(url: string, label?: string) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex min-w-0 items-start gap-1.5 break-all font-mono text-xs leading-5 text-primary hover:underline"
    >
      <span className="break-all">{label ?? url}</span>
      <ExternalLink className="mt-1 h-3 w-3 shrink-0" />
    </a>
  );
}

function sourceOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function jsonText(value: Json | undefined): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function jsonNumber(value: Json | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function jsonBoolean(value: Json | undefined): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function yesNo(value: boolean | null): string {
  return value === null ? "Unknown" : value ? "Yes" : "No";
}

export function BacklinkEnrichmentDetail({
  row: initialRow,
  sitePath,
  onSaved,
  onAnalyze,
  running = false,
  analysisDisabled = false,
  analysisRun = null,
  onDismissAnalysisRun,
}: {
  row: BacklinkObservationRow;
  sitePath: string;
  onSaved: () => void;
  onAnalyze?: () => void;
  running?: boolean;
  analysisDisabled?: boolean;
  analysisRun?: BacklinkEnrichmentRunState | null;
  onDismissAnalysisRun?: () => void;
}) {
  const backlink = useBacklinkRecord(initialRow);
  const row = backlink.data ?? initialRow;
  const assessment = parseBacklinkAssessment(row.resolved_assessment);
  const hasAssessment = hasBacklinkAssessment(row.resolved_assessment);
  const capture = jsonRecord(row.source_capture);
  const hasCapture = Object.keys(capture).length > 0;
  const existingHuman = jsonRecord(row.human_ruling);
  const lastError = jsonRecord(row.last_error);
  const extras = parseObservationExtras(providerExtras(row.provider_evidence));
  const analysisAction = backlinkAnalysisActionState(
    row.enrichment_status,
    running,
    analysisDisabled,
  );
  const [verdict, setVerdict] = useState(
    typeof existingHuman.verdict === "string"
      ? existingHuman.verdict
      : "confirmed",
  );
  const [note, setNote] = useState(
    typeof existingHuman.note === "string" ? existingHuman.note : "",
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const response = await supabase
        .schema("seo")
        .rpc("update_backlink_human_ruling", {
          p_backlink_id: row.id,
          p_ruling: { verdict, note: note.trim() } as Json,
        });
      if (response.error) throw response.error;
      toast.success("Saved — thanks.");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const sourceContext =
    extras.textPre || extras.textPost
      ? `${extras.textPre ?? ""} [${row.anchor_text ?? "link"}] ${extras.textPost ?? ""}`
      : null;
  const captureExcerpt = jsonText(capture.content_excerpt);
  const captureLinks = Array.isArray(capture.links_to_target)
    ? capture.links_to_target.length
    : null;
  const lastErrorMessage = jsonText(lastError.message);
  const referringDomainHref = row.source_domain
    ? // `q` is the search param `useMarketingTableState` reads — `search` was
      // silently ignored, landing the user on an unfiltered domain list.
      `${sitePath}/backlinks?tab=domains&q=${encodeURIComponent(row.source_domain)}`
    : null;

  return (
    <div className="h-full overflow-y-auto bg-background p-3 sm:p-4">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Everything we know about this link
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {extras.pageFromTitle ?? row.source_domain ?? "Referring page"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <StatusBadge
                value={row.state}
                label={backlinkStateLabel(row.state)}
              />
              <StatusBadge
                value={row.enrichment_status}
                label={backlinkReviewStatusLabel(row.enrichment_status)}
              />
              <span>
                Looked at {row.enrichment_attempt_count} time
                {row.enrichment_attempt_count === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild type="button" size="sm" variant="outline">
              <Link href={`${sitePath}/reputation`}>
                <Newspaper className="h-3.5 w-3.5" />
                Reputation
              </Link>
            </Button>
            {onAnalyze ? (
              <Button
                type="button"
                size="sm"
                disabled={analysisAction.disabled}
                title={analysisAction.title}
                onClick={onAnalyze}
              >
                {running || analysisAction.inProgress ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BrainCircuit className="h-3.5 w-3.5" />
                )}
                {analysisAction.label}
              </Button>
            ) : null}
          </div>
        </div>

        {analysisRun ? (
          <BacklinkEnrichmentRunPanel
            run={analysisRun}
            embedded
            onDismiss={onDismissAnalysisRun ?? (() => undefined)}
          />
        ) : null}

        {section(
          "The link itself",
          <div className="grid gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Page that links to you
              </p>
              <div className="mt-1">{externalUrl(row.source_url)}</div>
              {extras.pageFromTitle ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Page title: {extras.pageFromTitle}
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Site containing that page
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {externalUrl(
                  sourceOrigin(row.source_url),
                  row.source_domain ?? sourceOrigin(row.source_url),
                )}
                {referringDomainHref ? (
                  <Link
                    href={referringDomainHref}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    View this site in Referring domains
                  </Link>
                ) : null}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Page on your site receiving the link
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {externalUrl(row.target_url)}
                {row.page_id ? (
                  <Link
                    href={`${sitePath}/pages/${row.page_id}`}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    View this page in AI Matrx
                  </Link>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Anchor text
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
                  {row.anchor_text ?? "No text anchor was reported"}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Where on the page
                </p>
                <p className="mt-1 text-sm text-foreground">
                  {linkPlacementLabel(extras.semanticLocation)}
                </p>
              </div>
            </div>
            {sourceContext ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Text around the link
                </p>
                <blockquote className="mt-1 whitespace-pre-wrap break-words border-l-2 border-primary/40 pl-3 text-sm leading-6 text-foreground">
                  {sourceContext}
                </blockquote>
              </div>
            ) : null}
            {extras.imageUrl ? (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Linked image
                </p>
                <div className="mt-1">{externalUrl(extras.imageUrl)}</div>
                {extras.imageAlt ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Alt text: {extras.imageAlt}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>,
          "Who links to you, from which page, and to which page of yours.",
        )}

        {section(
          "What the data service found",
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
            {fact("Link status", backlinkStateLabel(row.state))}
            {fact("Kind of link", linkTypeLabel(row.link_type))}
            {fact(
              "Counts for SEO?",
              row.is_dofollow === null
                ? "Not sure"
                : row.is_dofollow
                  ? "Yes — passes credit"
                  : "No — marked so search engines ignore it",
            )}
            {fact(
              "Extra link labels",
              extras.attributes?.map(linkAttributeLabel).join(", ") ??
                "None reported",
            )}
            {fact("Authority of that page", row.source_rank)}
            {fact("Authority of that whole site", row.domain_rank)}
            {fact(
              "Spam signals",
              row.spam_score === null || row.spam_score === undefined ? null : (
                <span title={SPAM_SCORE_EXPLAINER}>{row.spam_score}</span>
              ),
            )}
            {fact("Strength of this link", extras.rank)}
            {fact("Your page responded with", extras.urlToStatusCode)}
            {fact("Reached through a redirect", yesNo(extras.isIndirect))}
            {fact("Points at a page that fails", yesNo(extras.isBroken))}
            {fact("Identical links grouped together", extras.groupCount)}
            {fact("Language of that page", extras.pageFromLanguage)}
            {fact("Country of that site", extras.domainFromCountry)}
            {fact(
              "What that site runs on",
              extras.domainFromPlatformType?.join(", "),
            )}
            {fact("Domain ending", extras.tldFrom)}
            {fact("Links leaving that page", extras.pageFromExternalLinks)}
            {fact("Links to its own pages", extras.pageFromInternalLinks)}
            {fact("Searches it ranks top 3 for", extras.rankedKeywords?.top3)}
            {fact("Searches it ranks top 10 for", extras.rankedKeywords?.top10)}
            {fact(
              "Searches it ranks top 100 for",
              extras.rankedKeywords?.top100,
            )}
            {fact("First seen", formatDate(row.first_seen_at))}
            {fact("Last seen", formatDate(row.last_seen_at))}
            {fact("Disappeared on", formatDate(row.lost_at))}
            {fact("Seen before that on", formatDate(extras.prevSeen))}
          </div>,
          "Facts collected from the web — not AI opinions.",
        )}

        {extras.urlToRedirectTarget
          ? section(
              "Where the link ends up",
              externalUrl(extras.urlToRedirectTarget),
              "Your page sends visitors on to this address.",
            )
          : null}

        {lastErrorMessage || Object.keys(lastError).length > 0 ? (
          <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0">
                <h2 className="text-xs font-semibold text-destructive">
                  What went wrong last time
                </h2>
                <p className="mt-1 break-words text-sm text-foreground">
                  {lastErrorMessage ?? "No further detail was recorded."}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  {jsonText(lastError.stage) ? (
                    <span>Step: {humanizeAssessmentValue(jsonText(lastError.stage))}</span>
                  ) : null}
                  {jsonNumber(lastError.status_code) !== null ? (
                    <span>HTTP {jsonNumber(lastError.status_code)}</span>
                  ) : null}
                  {jsonBoolean(lastError.retryable) !== null ? (
                    <span>
                      Worth trying again: {yesNo(jsonBoolean(lastError.retryable))}
                    </span>
                  ) : null}
                </div>
                {/* A detected problem ships with its one-click fix — the same
                    guarded action as the header button, beside the error. */}
                {onAnalyze ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    disabled={analysisAction.disabled}
                    title={analysisAction.title}
                    onClick={onAnalyze}
                  >
                    {running || analysisAction.inProgress ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <BrainCircuit className="h-3.5 w-3.5" />
                    )}
                    {analysisAction.label}
                  </Button>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {hasAssessment ? (
          <>
            {section(
              "What we make of it",
              <>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                  {fact(
                    "Overall score",
                    assessment.overallScore === null
                      ? null
                      : `${assessment.overallScore} / 100`,
                  )}
                  {fact(
                    "Kind of page",
                    backlinkPageTypeLabel(assessment.pageType),
                  )}
                  {fact(
                    "Topic match",
                    `${backlinkRelevanceLabel(assessment.relevanceVerdict)}${assessment.relevanceScore === null ? "" : ` · ${assessment.relevanceScore} / 100`}`,
                  )}
                  {fact(
                    "Quality of the surrounding text",
                    humanizeAssessmentValue(assessment.contextVerdict),
                  )}
                  {fact(
                    "Quality of the link wording",
                    humanizeAssessmentValue(assessment.anchorVerdict),
                  )}
                  {fact(
                    "Was it given or bought?",
                    humanizeAssessmentValue(assessment.editorialKind),
                  )}
                  {fact(
                    "Can you change it?",
                    backlinkControlLabel(assessment.controlLevel),
                  )}
                  {fact(
                    "Anything to worry about?",
                    humanizeAssessmentValue(assessment.riskVerdict),
                  )}
                  {fact(
                    "How sure we are",
                    assessment.confidence === null
                      ? null
                      : `${assessment.confidence} / 100`,
                  )}
                  {fact("Review version", row.assessment_version)}
                  {fact("Page read on", formatDate(row.captured_at))}
                  {fact("Reviewed on", formatDate(row.analyzed_at))}
                </div>
                {assessment.pageSummary ? (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      What that page is about
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                      {assessment.pageSummary}
                    </p>
                    {assessment.topics.length ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Topics: {assessment.topics.join(" · ")}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {assessment.controlReason ? (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Why we think you can or cannot change it
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
                      {assessment.controlReason}
                    </p>
                  </div>
                ) : null}
              </>,
              "Our own read of the page and the link — not the data service's.",
            )}

            {section(
              "What to do next",
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {backlinkActionLabel(assessment.action)}
                  </p>
                  {assessment.priority ? (
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                      {humanizeAssessmentValue(assessment.priority)} priority
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                  {assessment.actionReason ??
                    "No reasoning was recorded for this suggestion."}
                </p>
              </div>,
              "The practical decision — not just a score.",
            )}
          </>
        ) : (
          <section className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <h2 className="text-xs font-semibold text-foreground">
              We have not reviewed this link yet
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Choose Review and we will read the page this link sits on, see
              where the link appears and what the page is about, and tell you
              how good the link is, whether you can change it, and what to do
              about it.
            </p>
            {onAnalyze ? (
              <Button
                type="button"
                size="sm"
                className="mt-3"
                disabled={analysisAction.disabled}
                title={analysisAction.title}
                onClick={onAnalyze}
              >
                {running || analysisAction.inProgress ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <BrainCircuit className="h-3.5 w-3.5" />
                )}
                {analysisAction.label}
              </Button>
            ) : null}
          </section>
        )}

        {hasCapture
          ? section(
              "The page we read",
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                  {fact(
                    "Page loaded successfully",
                    yesNo(jsonBoolean(capture.success)),
                  )}
                  {fact(
                    "Page responded with",
                    jsonNumber(capture.status_code),
                  )}
                  {fact("Kind of content", jsonText(capture.content_type))}
                  {fact("Characters read", jsonNumber(capture.char_count))}
                  {fact("Links to your site found", captureLinks)}
                  {fact(
                    "Used a copy we already had",
                    yesNo(jsonBoolean(capture.from_cache)),
                  )}
                  {fact("What that site runs on", jsonText(capture.cms))}
                  {fact("We read it on", formatDate(jsonText(capture.scraped_at)))}
                  {fact(
                    "Page published",
                    formatDate(jsonText(capture.published_at)),
                  )}
                  {fact(
                    "Page last changed",
                    formatDate(jsonText(capture.modified_at)),
                  )}
                  {fact(
                    "We shortened the page",
                    yesNo(jsonBoolean(capture.content_truncated)),
                  )}
                </div>
                {jsonText(capture.title) ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Title of that page
                    </p>
                    <p className="mt-1 break-words text-sm text-foreground">
                      {jsonText(capture.title)}
                    </p>
                  </div>
                ) : null}
                {jsonText(capture.final_url) ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Address we ended up reading
                    </p>
                    <div className="mt-1">
                      {externalUrl(
                        jsonText(capture.final_url) ?? row.source_url,
                      )}
                    </div>
                  </div>
                ) : null}
                {jsonText(capture.failure_reason) ? (
                  <p className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                    {jsonText(capture.failure_reason)}
                  </p>
                ) : null}
                {captureExcerpt ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      What we read from that page
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/20 p-3 font-sans text-xs leading-5 text-foreground">
                      {captureExcerpt}
                    </pre>
                  </div>
                ) : null}
              </div>,
              "This is the page content our review was based on — all of it, exactly as we saved it.",
            )
          : null}

        {hasAssessment
          ? section(
              "Do you agree?",
              <>
                <p className="text-[11px] text-muted-foreground">
                  Tell us whether this looks right to you. Your answer is kept
                  separate from everything we worked out automatically, and it
                  is always the one that wins.
                </p>
                <select
                  value={verdict}
                  onChange={(event) => setVerdict(event.target.value)}
                  className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="confirmed">Yes, this looks right</option>
                  <option value="needs_change">No, this needs changing</option>
                  <option value="dismissed">
                    Ignore this suggestion for now
                  </option>
                </select>
                <Textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Optional context only your team knows…"
                  className="mt-2 min-h-20 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  className="mt-2"
                  disabled={saving}
                  onClick={() => void save()}
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Save your answer
                </Button>
              </>,
              "We only ask once we have something for you to react to.",
            )
          : null}

        {section(
          "History of this link",
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
            {fact(
              "Where we have got to",
              backlinkReviewStatusLabel(row.enrichment_status),
            )}
            {fact("Times we have looked", row.enrichment_attempt_count)}
            {fact("Next scheduled look", formatDate(row.next_enrichment_at))}
            {fact("Page read on", formatDate(row.captured_at))}
            {fact("Reviewed on", formatDate(row.analyzed_at))}
            {fact("You reviewed it on", formatDate(row.human_reviewed_at))}
            {fact("First recorded", formatDate(row.created_at))}
            {fact("Last updated", formatDate(row.updated_at))}
          </div>,
          "When we last looked at this exact link, and what happened.",
        )}

        {section(
          "Everything we have stored",
          <div className="h-[min(52rem,70vh)] min-h-[28rem] overflow-hidden rounded-md border border-border/60">
            <JsonInspector
              data={row}
              label="Everything stored about this link"
              defaultView="json"
              className="h-full rounded-none"
            />
          </div>,
          "Nothing is left out — what the data service reported, the page we read, what we worked out, your own answer, and every date and error, exactly as they are saved.",
        )}
      </div>
    </div>
  );
}
