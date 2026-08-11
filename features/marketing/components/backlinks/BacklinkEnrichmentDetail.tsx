"use client";

import { useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BrainCircuit,
  Camera,
  ExternalLink,
  Loader2,
  Newspaper,
  Save,
} from "lucide-react";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BacklinkEnrichmentRunPanel } from "@/features/marketing/components/backlinks/BacklinkEnrichmentRunPanel";
import {
  backlinkAnalysisActionState,
  backlinkCaptureForUi,
  backlinkScreenshotFileId,
  hasBacklinkAssessment,
  humanizeAssessmentValue,
  jsonRecord,
  parseBacklinkAssessment,
  providerExtras,
} from "@/features/marketing/components/backlinks/lib/enrichment";
import { parseObservationExtras } from "@/features/marketing/components/backlinks/lib/extras";
import {
  formatDate,
  SectionCard,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import type { BacklinkObservationRow } from "@/features/marketing/data/backlinks-types";
import type { BacklinkEnrichmentRunState } from "@/features/marketing/components/backlinks/lib/enrichment-run";
import { useBacklinkRecord } from "@/features/marketing/data/backlinks-hooks";
import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import { toast } from "@/lib/toast";
import { webCopy } from "@/features/marketing/lib/copy-payloads";
import { CaptureThumb } from "@/features/marketing/components/shared/CaptureThumb";

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

function section(
  title: string,
  children: ReactNode,
  description?: string,
  copy?: ComponentProps<typeof SectionCard>["copy"],
) {
  return (
    <SectionCard title={title} copy={copy}>
      <div className="p-3">
        {description ? (
          <p className="text-[11px] leading-4 text-muted-foreground">
            {description}
          </p>
        ) : null}
        <div className={description ? "mt-3" : undefined}>{children}</div>
      </div>
    </SectionCard>
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
  const capture = backlinkCaptureForUi(row.source_capture);
  const screenshotFileId = backlinkScreenshotFileId(capture);
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
      toast.success("Human backlink ruling saved.");
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
    ? `${sitePath}/backlinks?tab=domains&search=${encodeURIComponent(row.source_domain)}`
    : null;
  const recordSurface = `Backlink from ${row.source_domain ?? sourceOrigin(row.source_url)}`;
  const displayRow: BacklinkObservationRow = {
    ...row,
    source_capture: capture,
  };
  const identityData = {
    source_page: {
      url: row.source_url,
      title: extras.pageFromTitle,
      surrounding_text: sourceContext,
    },
    referring_site: {
      domain: row.source_domain,
      origin: sourceOrigin(row.source_url),
    },
    target_page: { url: row.target_url, page_id: row.page_id },
    link: {
      anchor_text: row.anchor_text,
      placement: extras.semanticLocation,
      image_url: extras.imageUrl,
      image_alt: extras.imageAlt,
    },
  };
  const identityCopy = webCopy({
    kind: "web-backlink-link-identity",
    label: "Link identity",
    description:
      "The source page, referring site, target page, anchor, placement, and surrounding link context for one backlink.",
    surface: recordSurface,
    data: identityData,
    lines: [
      ["Source page", row.source_url],
      ["Source title", extras.pageFromTitle],
      ["Referring site", row.source_domain ?? sourceOrigin(row.source_url)],
      ["Target page", row.target_url],
      ["Anchor text", row.anchor_text ?? "No text anchor reported"],
      ["Placement", humanizeAssessmentValue(extras.semanticLocation)],
      ["Text around the link", sourceContext],
      ["Linked image", extras.imageUrl],
      ["Image alt text", extras.imageAlt],
    ],
    attributes: { backlink_id: row.id, site_id: row.site_id },
  });
  const providerCopy = webCopy({
    kind: "web-backlink-provider-facts",
    label: "Provider facts and link mechanics",
    description:
      "The raw provider evidence plus the stored authority, link-mechanics, and lifecycle observations for one backlink.",
    surface: recordSurface,
    data: {
      state: row.state,
      link_type: row.link_type,
      is_dofollow: row.is_dofollow,
      source_rank: row.source_rank,
      domain_rank: row.domain_rank,
      spam_score: row.spam_score,
      first_seen_at: row.first_seen_at,
      last_seen_at: row.last_seen_at,
      lost_at: row.lost_at,
      provider_evidence: row.provider_evidence,
    },
    lines: [
      ["State", humanizeAssessmentValue(row.state)],
      ["Link type", humanizeAssessmentValue(row.link_type)],
      [
        "Search-engine follow",
        row.is_dofollow === null
          ? "Unknown"
          : row.is_dofollow
            ? "Dofollow"
            : "Nofollow",
      ],
      ["Source page rank", row.source_rank],
      ["Referring domain rank", row.domain_rank],
      ["Provider spam score", row.spam_score],
      ["Placement", humanizeAssessmentValue(extras.semanticLocation)],
      ["Broken link", yesNo(extras.isBroken)],
      ["First seen", formatDate(row.first_seen_at)],
      ["Last seen", formatDate(row.last_seen_at)],
    ],
    attributes: { backlink_id: row.id, site_id: row.site_id },
  });
  const redirectCopy = extras.urlToRedirectTarget
    ? webCopy({
        kind: "web-backlink-redirect-destination",
        label: "Redirect destination",
        description:
          "The redirect destination reported for this backlink target.",
        surface: recordSurface,
        data: { redirect_destination: extras.urlToRedirectTarget },
        lines: [["Redirect destination", extras.urlToRedirectTarget]],
        attributes: { backlink_id: row.id, site_id: row.site_id },
      })
    : undefined;
  const errorCopy = webCopy({
    kind: "web-backlink-analysis-error",
    label: "Last analysis error",
    description:
      "The latest stored source-page analysis error for one backlink.",
    surface: recordSurface,
    data: lastError,
    lines: [
      ["Message", lastErrorMessage],
      ["Stage", jsonText(lastError.stage)],
      ["HTTP status", jsonNumber(lastError.status_code)],
      ["Retryable", yesNo(jsonBoolean(lastError.retryable))],
    ],
    attributes: { backlink_id: row.id, site_id: row.site_id },
  });
  const assessmentCopy = webCopy({
    kind: "web-backlink-assessment",
    label: "Our assessment",
    description:
      "The complete first-party assessment derived from provider and captured source-page evidence.",
    surface: recordSurface,
    data: row.resolved_assessment,
    lines: [
      ["Overall score", assessment.overallScore],
      ["Source type", humanizeAssessmentValue(assessment.pageType)],
      ["Relevance", humanizeAssessmentValue(assessment.relevanceVerdict)],
      ["Context quality", humanizeAssessmentValue(assessment.contextVerdict)],
      ["Anchor quality", humanizeAssessmentValue(assessment.anchorVerdict)],
      ["Editorial nature", humanizeAssessmentValue(assessment.editorialKind)],
      ["Can you change it?", humanizeAssessmentValue(assessment.controlLevel)],
      ["Risk", humanizeAssessmentValue(assessment.riskVerdict)],
      ["Confidence", assessment.confidence],
      ["Source-page summary", assessment.pageSummary],
    ],
    attributes: { backlink_id: row.id, site_id: row.site_id },
  });
  const nextStepCopy = webCopy({
    kind: "web-backlink-recommended-next-step",
    label: "Recommended next step",
    description:
      "The recommended action, priority, and reasoning for one backlink.",
    surface: recordSurface,
    data: {
      action: assessment.action,
      priority: assessment.priority,
      reason: assessment.actionReason,
    },
    lines: [
      ["Action", humanizeAssessmentValue(assessment.action)],
      ["Priority", humanizeAssessmentValue(assessment.priority)],
      ["Reason", assessment.actionReason],
    ],
    attributes: { backlink_id: row.id, site_id: row.site_id },
  });
  const captureCopy = webCopy({
    kind: "web-backlink-source-page-evidence",
    label: "Captured source-page evidence",
    description:
      "The user-facing source-page evidence captured for this backlink; internal cache identifiers are excluded.",
    surface: recordSurface,
    data: capture,
    lines: [
      ["Capture succeeded", yesNo(jsonBoolean(capture.success))],
      ["HTTP status", jsonNumber(capture.status_code)],
      ["Content type", jsonText(capture.content_type)],
      ["Characters captured", jsonNumber(capture.char_count)],
      ["Found links to target", captureLinks],
      ["Served from cache", yesNo(jsonBoolean(capture.from_cache))],
      ["Captured title", jsonText(capture.title)],
      ["Final captured URL", jsonText(capture.final_url)],
      ["Link screenshot", screenshotFileId ? "Captured" : "Not captured"],
      [
        "Target link highlighted",
        yesNo(jsonBoolean(capture.screenshot_highlighted)),
      ],
      ["Scraped", formatDate(jsonText(capture.scraped_at))],
    ],
    attributes: { backlink_id: row.id, site_id: row.site_id },
  });
  const rulingCopy = webCopy({
    kind: "web-backlink-human-ruling",
    label: "Your ruling",
    description: "The current human verdict and note for one backlink.",
    surface: recordSurface,
    data: { verdict, note: note.trim() },
    lines: [
      ["Verdict", humanizeAssessmentValue(verdict)],
      ["Note", note.trim()],
    ],
    attributes: { backlink_id: row.id, site_id: row.site_id },
  });
  const lifecycleCopy = webCopy({
    kind: "web-backlink-analysis-lifecycle",
    label: "Analysis lifecycle",
    description:
      "The durable capture, analysis, review, and record timestamps for one backlink.",
    surface: recordSurface,
    data: {
      enrichment_status: row.enrichment_status,
      enrichment_attempt_count: row.enrichment_attempt_count,
      next_enrichment_at: row.next_enrichment_at,
      captured_at: row.captured_at,
      analyzed_at: row.analyzed_at,
      human_reviewed_at: row.human_reviewed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    lines: [
      ["Status", humanizeAssessmentValue(row.enrichment_status)],
      ["Attempts", row.enrichment_attempt_count],
      ["Next analysis", formatDate(row.next_enrichment_at)],
      ["Captured", formatDate(row.captured_at)],
      ["Analyzed", formatDate(row.analyzed_at)],
      ["Human reviewed", formatDate(row.human_reviewed_at)],
      ["Record created", formatDate(row.created_at)],
      ["Record updated", formatDate(row.updated_at)],
    ],
    attributes: { backlink_id: row.id, site_id: row.site_id },
  });
  const storedDataCopy = webCopy({
    kind: "web-backlink-stored-record",
    label: "Stored backlink data",
    description:
      "The complete user-facing stored backlink record; internal cache identifiers are excluded.",
    surface: recordSurface,
    data: displayRow,
    lines: [
      ["Source page", row.source_url],
      ["Target page", row.target_url],
      ["State", humanizeAssessmentValue(row.state)],
      ["Enrichment", humanizeAssessmentValue(row.enrichment_status)],
      ["Last seen", formatDate(row.last_seen_at)],
      ["Updated", formatDate(row.updated_at)],
    ],
    attributes: { backlink_id: row.id, site_id: row.site_id },
  });

  return (
    <div className="h-full overflow-y-auto bg-background p-3 sm:p-4">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Complete backlink record
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {extras.pageFromTitle ?? row.source_domain ?? "Referring page"}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <StatusBadge value={row.state} />
              <StatusBadge value={row.enrichment_status} />
              <span>
                {row.enrichment_attempt_count} analysis attempt
                {row.enrichment_attempt_count === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild type="button" size="sm" variant="outline">
              <a
                href={row.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open source page
              </a>
            </Button>
            <Button asChild type="button" size="sm" variant="outline">
              <a
                href={row.target_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open target page
              </a>
            </Button>
            <Button asChild type="button" size="sm" variant="outline">
              <Link
                href={`${sitePath}/reputation`}
                target="_blank"
                rel="noopener noreferrer"
              >
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
          "Link identity",
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
                    target="_blank"
                    rel="noopener noreferrer"
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
                  <EntityRef
                    token="web_page"
                    id={row.page_id}
                    name="View this page in AI Matrx"
                    href={`${sitePath}/pages/${row.page_id}`}
                    showIcon={false}
                    openInNewTab
                    wrap
                    labelClassName="text-xs font-medium text-primary"
                  />
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
                  Placement
                </p>
                <p className="mt-1 text-sm text-foreground">
                  {humanizeAssessmentValue(extras.semanticLocation)}
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
          "The three identities in this relationship are shown separately and in full.",
          identityCopy,
        )}

        {section(
          "Provider facts and link mechanics",
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
            {fact("Link state", humanizeAssessmentValue(row.state))}
            {fact("Link type", humanizeAssessmentValue(row.link_type))}
            {fact(
              "Search-engine follow",
              row.is_dofollow === null
                ? "Unknown"
                : row.is_dofollow
                  ? "Dofollow"
                  : "Nofollow",
            )}
            {fact(
              "Rel attributes",
              extras.attributes?.join(", ") ?? "None reported",
            )}
            {fact("Source page rank", row.source_rank)}
            {fact("Referring domain rank", row.domain_rank)}
            {fact("Provider spam score", row.spam_score)}
            {fact("Link rank", extras.rank)}
            {fact("Target HTTP status", extras.urlToStatusCode)}
            {fact("Indirect link", yesNo(extras.isIndirect))}
            {fact("Broken link", yesNo(extras.isBroken))}
            {fact("Identical links grouped", extras.groupCount)}
            {fact("Source-page language", extras.pageFromLanguage)}
            {fact("Source country", extras.domainFromCountry)}
            {fact("Source platform", extras.domainFromPlatformType?.join(", "))}
            {fact("Source TLD", extras.tldFrom)}
            {fact("External links on source", extras.pageFromExternalLinks)}
            {fact("Internal links on source", extras.pageFromInternalLinks)}
            {fact("Ranking keywords — top 3", extras.rankedKeywords?.top3)}
            {fact("Ranking keywords — top 10", extras.rankedKeywords?.top10)}
            {fact("Ranking keywords — top 100", extras.rankedKeywords?.top100)}
            {fact("First seen", formatDate(row.first_seen_at))}
            {fact("Last seen", formatDate(row.last_seen_at))}
            {fact("Lost at", formatDate(row.lost_at))}
            {fact("Provider previously saw it", formatDate(extras.prevSeen))}
          </div>,
          "These are the stored provider observations—not AI guesses.",
          providerCopy,
        )}

        {extras.urlToRedirectTarget
          ? section(
              "Redirect destination",
              externalUrl(extras.urlToRedirectTarget),
              "The provider reports that the target redirects here.",
              redirectCopy,
            )
          : null}

        {lastErrorMessage || Object.keys(lastError).length > 0 ? (
          <SectionCard
            title="Last analysis error"
            copy={errorCopy}
            className="border-destructive/40 bg-destructive/5"
          >
            <div className="flex items-start gap-2 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="mt-1 break-words text-sm text-foreground">
                  {lastErrorMessage ?? "The stored error has no message field."}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  {jsonText(lastError.stage) ? (
                    <span>Stage: {jsonText(lastError.stage)}</span>
                  ) : null}
                  {jsonNumber(lastError.status_code) !== null ? (
                    <span>HTTP {jsonNumber(lastError.status_code)}</span>
                  ) : null}
                  {jsonBoolean(lastError.retryable) !== null ? (
                    <span>
                      Retryable: {yesNo(jsonBoolean(lastError.retryable))}
                    </span>
                  ) : null}
                </div>
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
              </div>
            </div>
          </SectionCard>
        ) : null}

        {hasAssessment ? (
          <>
            {section(
              "Our assessment",
              <>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                  {fact(
                    "Overall score",
                    assessment.overallScore === null
                      ? null
                      : `${assessment.overallScore} / 100`,
                  )}
                  {fact(
                    "Source type",
                    humanizeAssessmentValue(assessment.pageType),
                  )}
                  {fact(
                    "Relevance",
                    `${humanizeAssessmentValue(assessment.relevanceVerdict)}${assessment.relevanceScore === null ? "" : ` · ${assessment.relevanceScore} / 100`}`,
                  )}
                  {fact(
                    "Context quality",
                    humanizeAssessmentValue(assessment.contextVerdict),
                  )}
                  {fact(
                    "Anchor quality",
                    humanizeAssessmentValue(assessment.anchorVerdict),
                  )}
                  {fact(
                    "Editorial nature",
                    humanizeAssessmentValue(assessment.editorialKind),
                  )}
                  {fact(
                    "Can you change it?",
                    humanizeAssessmentValue(assessment.controlLevel),
                  )}
                  {fact(
                    "Risk",
                    humanizeAssessmentValue(assessment.riskVerdict),
                  )}
                  {fact(
                    "Confidence",
                    assessment.confidence === null
                      ? null
                      : `${assessment.confidence} / 100`,
                  )}
                  {fact("Assessment version", row.assessment_version)}
                  {fact("Captured", formatDate(row.captured_at))}
                  {fact("Analyzed", formatDate(row.analyzed_at))}
                </div>
                {assessment.pageSummary ? (
                  <div className="mt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      What the source page is about
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
                      Why we think it can or cannot be changed
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
                      {assessment.controlReason}
                    </p>
                  </div>
                ) : null}
              </>,
              "First-party interpretation of the provider evidence and captured source page.",
              assessmentCopy,
            )}

            {section(
              "Recommended next step",
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">
                    {humanizeAssessmentValue(assessment.action)}
                  </p>
                  {assessment.priority ? (
                    <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-primary">
                      {humanizeAssessmentValue(assessment.priority)} priority
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                  {assessment.actionReason ??
                    "No action reasoning was stored with this assessment."}
                </p>
              </div>,
              "The practical decision—not just a score.",
              nextStepCopy,
            )}
          </>
        ) : (
          <section className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <h2 className="text-xs font-semibold text-foreground">
              This backlink has not been assessed yet
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Run Analyze to capture the source page, inspect where the link
              appears, and produce relevance, quality, controllability, risk,
              and next-step evidence for this exact link.
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
              "Captured source-page evidence",
              <div className="grid gap-3">
                {screenshotFileId ? (
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          Link evidence screenshot
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          The matching link is highlighted and centered when the
                          source page exposes it to the browser.
                        </p>
                      </div>
                      <Camera className="h-4 w-4 shrink-0 text-primary" />
                    </div>
                    <CaptureThumb
                      fileId={screenshotFileId}
                      alt={`Highlighted backlink on ${row.source_domain ?? "the source page"}`}
                      aspectClassName="aspect-video"
                      footer={
                        <div className="flex items-center justify-between gap-2 border-t border-border px-2.5 py-2 text-[11px]">
                          <span className="font-medium">Open full screenshot</span>
                          <span className="text-muted-foreground">
                            {jsonNumber(capture.screenshot_width) ?? "—"} ×{" "}
                            {jsonNumber(capture.screenshot_height) ?? "—"}
                          </span>
                        </div>
                      }
                    />
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                  {fact(
                    "Capture succeeded",
                    yesNo(jsonBoolean(capture.success)),
                  )}
                  {fact("HTTP status", jsonNumber(capture.status_code))}
                  {fact("Content type", jsonText(capture.content_type))}
                  {fact("Characters captured", jsonNumber(capture.char_count))}
                  {fact("Found links to target", captureLinks)}
                  {fact(
                    "Served from cache",
                    yesNo(jsonBoolean(capture.from_cache)),
                  )}
                  {fact("CMS", jsonText(capture.cms))}
                  {fact("Scraped", formatDate(jsonText(capture.scraped_at)))}
                  {fact(
                    "Published",
                    formatDate(jsonText(capture.published_at)),
                  )}
                  {fact("Modified", formatDate(jsonText(capture.modified_at)))}
                  {fact(
                    "Capture content truncated",
                    yesNo(jsonBoolean(capture.content_truncated)),
                  )}
                </div>
                {jsonText(capture.title) ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Captured title
                    </p>
                    <p className="mt-1 break-words text-sm text-foreground">
                      {jsonText(capture.title)}
                    </p>
                  </div>
                ) : null}
                {jsonText(capture.final_url) ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Final captured URL
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
                {jsonText(capture.screenshot_failure_reason) ? (
                  <p className="rounded border border-warning/30 bg-warning/5 p-2 text-xs text-warning-foreground">
                    Screenshot unavailable:{" "}
                    {jsonText(capture.screenshot_failure_reason)}
                  </p>
                ) : null}
                {captureExcerpt ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Full stored source-page excerpt
                    </p>
                    <pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-border/60 bg-muted/20 p-3 font-sans text-xs leading-5 text-foreground">
                      {captureExcerpt}
                    </pre>
                  </div>
                ) : null}
              </div>,
              "The captured page evidence used by the analysis, plus a human-review screenshot when browser capture succeeded.",
              captureCopy,
            )
          : null}

        {hasAssessment
          ? section(
              "Your ruling",
              <>
                <p className="text-[11px] text-muted-foreground">
                  Confirm the assessment, flag a needed change, or dismiss its
                  action. Your judgment stays separate from provider,
                  deterministic, and AI evidence.
                </p>
                <select
                  value={verdict}
                  onChange={(event) => setVerdict(event.target.value)}
                  className="mt-2 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                >
                  <option value="confirmed">Confirm assessment</option>
                  <option value="needs_change">Needs correction</option>
                  <option value="dismissed">Dismiss action</option>
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
                  Save ruling
                </Button>
              </>,
              "Human judgment is offered only after an assessment exists.",
              rulingCopy,
            )
          : null}

        {section(
          "Analysis lifecycle",
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
            {fact(
              "Enrichment status",
              humanizeAssessmentValue(row.enrichment_status),
            )}
            {fact("Attempts", row.enrichment_attempt_count)}
            {fact("Next analysis", formatDate(row.next_enrichment_at))}
            {fact("Captured", formatDate(row.captured_at))}
            {fact("Analyzed", formatDate(row.analyzed_at))}
            {fact("Human reviewed", formatDate(row.human_reviewed_at))}
            {fact("Record created", formatDate(row.created_at))}
            {fact("Record updated", formatDate(row.updated_at))}
          </div>,
          "Durable state for this exact source-page → target-page relationship.",
          lifecycleCopy,
        )}

        <SectionCard title="Technical details" collapsible defaultOpen={false}>
          <div className="p-3">
            <p className="mb-3 text-[11px] leading-4 text-muted-foreground">
              Complete user-facing record data for troubleshooting and advanced
              inspection. Internal cache identifiers are excluded.
            </p>
            <div className="h-[min(52rem,70vh)] min-h-[28rem] overflow-hidden rounded-md border border-border/60">
              <JsonInspector
                data={displayRow}
                label="Exact backlink record"
                defaultView="json"
                agentCopy={storedDataCopy.agent}
                className="h-full rounded-none"
              />
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
