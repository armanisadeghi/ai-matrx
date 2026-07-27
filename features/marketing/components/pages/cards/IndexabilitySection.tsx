"use client";

import { AlertTriangle, CheckCircle, OctagonAlert } from "lucide-react";
import type {
  MarketingPage,
  PageSnapshot,
} from "@/features/marketing/types";
import { parseSnapshotHeadTags } from "@/features/marketing/lib/head-tags";
import { evaluatePageIndexability } from "@/features/marketing/lib/marketing-page-scope";
import { marketingPageManifest } from "@/features/surfaces/manifests/marketing-page.manifest";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import { type IndexabilityEvaluation } from "@/features/marketing/seo/audit/indexability";
import { evaluateUrlQuality } from "@/features/marketing/seo/audit/url-quality";
import { AuditIssueList } from "@/features/marketing/seo/audit/AuditIssueList";
import { parseSnapshotExtracted } from "@/features/marketing/lib/snapshot-content";
import { CondensedFieldGrid } from "@/features/marketing/components/shared/MarketingUi";
import { cn } from "@/lib/utils";

// THE NAMING LAW: canonical labels for every declared surface value + group —
// section titles and field labels below render these byte-identically.
const L = surfaceValueLabels(marketingPageManifest);

/** One deterministic verdict pill: Indexable / Needs review / Blocked. */
export function IndexabilityVerdictBanner({
  evaluation,
}: {
  evaluation: IndexabilityEvaluation;
}) {
  const tone =
    evaluation.verdict === "indexable"
      ? "border-success/40 bg-success/10 text-success"
      : evaluation.verdict === "check"
        ? "border-warning/40 bg-warning/10 text-warning"
        : "border-destructive/40 bg-destructive/10 text-destructive";
  const Icon =
    evaluation.verdict === "indexable"
      ? CheckCircle
      : evaluation.verdict === "check"
        ? AlertTriangle
        : OctagonAlert;
  const label =
    evaluation.verdict === "indexable"
      ? "Indexable"
      : evaluation.verdict === "check"
        ? "Needs review"
        : "Blocked from Google";
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2",
        tone,
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-xs font-semibold">{label}</span>
      <span className="ml-auto text-[10px] opacity-80">
        {evaluation.issues.length
          ? `${evaluation.issues.length} signal${evaluation.issues.length === 1 ? "" : "s"}`
          : "All signals clean"}
      </span>
    </div>
  );
}

export function IndexabilitySection({
  page,
  snapshot,
}: {
  page: MarketingPage;
  snapshot: PageSnapshot;
}) {
  const head = parseSnapshotHeadTags(snapshot.head_tags);
  const extracted = parseSnapshotExtracted(snapshot.extracted);
  // Deterministic verdict — the SAME evaluation the surface scope emits
  // (indexability), identical to the scraper's crawl-time
  // `audit_metrics.indexability` by construction.
  const evaluation = evaluatePageIndexability(page, snapshot);
  const noindex = evaluation.noindex;
  const canonicalMismatch = evaluation.canonicalMatches === false;
  // URL quality needs no crawl data — always computed live from the URL.
  const urlQuality = evaluateUrlQuality(page.url);
  return (
    <div className="grid gap-3 p-3">
      <IndexabilityVerdictBanner evaluation={evaluation} />
      <AuditIssueList issues={evaluation.issues} compact />
      <AuditIssueList issues={urlQuality.issues} compact />
      <CondensedFieldGrid
        fields={[
          {
            label: L.http_status,
            value: snapshot.http_status ?? "—",
            tone:
              snapshot.http_status !== null && snapshot.http_status >= 400
                ? "bad"
                : "default",
          },
          {
            label: "Meta robots",
            value: head.metaRobots ?? "Not set",
            tone: noindex ? "bad" : "default",
          },
          {
            label: "Canonical URL",
            value: head.canonicalUrl ?? "Not set",
            tone: canonicalMismatch ? "warning" : "default",
            span: 2,
          },
          {
            label: "Redirect chain",
            value:
              extracted.redirectChain.length > 1 ? (
                <span className="grid gap-0.5">
                  {extracted.redirectChain.map((hop, index) => (
                    <span
                      key={`${hop.url}:${index}`}
                      className="break-all font-mono text-[11px]"
                    >
                      {hop.status ?? "—"} · {hop.url}
                    </span>
                  ))}
                </span>
              ) : (
                "Direct — no redirects"
              ),
            tone: extracted.redirectChain.length > 1 ? "warning" : "default",
            span: 2,
          },
          {
            label: "Final URL",
            value: snapshot.final_url ?? page.url,
            span: 2,
          },
          { label: "Language", value: head.lang ?? "Not declared" },
        ]}
      />
    </div>
  );
}
