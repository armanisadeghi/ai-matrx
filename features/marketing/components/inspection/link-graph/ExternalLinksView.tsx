// features/marketing/components/inspection/link-graph/ExternalLinksView.tsx
//
// Outbound-links surface: every external link the site sends out, grouped by
// destination domain with target-level drill-down (Screaming Frog's External
// tab / Ahrefs' Linked Domains). Reads the SAME capped edge fetch as the
// graph view (`useLinkGraphEdges`) and aggregates client-side via
// `buildExternalLinkReport` — no extra query.

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe,
  Link2Off,
  Loader2,
  ShieldCheck,
  Search,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";
import { toast } from "@/lib/toast";

import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import {
  inspectionKeys,
  useLinkGraphEdges,
} from "@/features/marketing/data/inspection-hooks";
import { checkSiteLinks } from "@/features/marketing/crawler/direct-client";
import { webCopy } from "@/features/marketing/lib/copy-payloads";

import {
  buildExternalLinkReport,
  displayUrl,
  type ExternalDomainRollup,
} from "./model";

function StatChip({
  value,
  label,
  tone = "default",
}: {
  value: number;
  label: string;
  tone?: "default" | "warning";
}) {
  return (
    <span className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
      <span
        className={cn(
          "font-semibold",
          tone === "warning" && value > 0
            ? "text-amber-600 dark:text-amber-400"
            : "text-foreground",
        )}
      >
        {value.toLocaleString()}
      </span>{" "}
      {label}
    </span>
  );
}

function HttpStatusBadge({ httpStatus }: { httpStatus: number | null }) {
  if (httpStatus === null) return null;
  const broken = httpStatus === 0 || httpStatus >= 400;
  const redirect = httpStatus >= 300 && httpStatus < 400;
  return (
    <Badge
      variant={broken ? "destructive" : "outline"}
      className={cn(
        "shrink-0 text-[10px] tabular-nums",
        !broken && redirect && "border-amber-500/50 text-amber-700 dark:text-amber-400",
        !broken && !redirect && "border-success/40 text-success",
      )}
    >
      {httpStatus === 0 ? "no response" : httpStatus}
    </Badge>
  );
}

function DomainRow({
  domain,
  expanded,
  onToggle,
  sitePath,
  rootUrl,
}: {
  domain: ExternalDomainRollup;
  expanded: boolean;
  onToggle: () => void;
  sitePath: string;
  rootUrl: string;
}) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <li className="border-b border-border/70 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/40"
      >
        <Chevron className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
          {domain.domain}
        </span>
        {domain.nofollowLinks > 0 ? (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {domain.nofollowLinks === domain.links
              ? "nofollow"
              : `${domain.nofollowLinks} nofollow`}
          </Badge>
        ) : null}
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {domain.targets.length.toLocaleString()}{" "}
          {domain.targets.length === 1 ? "target" : "targets"}
        </span>
        <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
          {domain.links.toLocaleString()}{" "}
          {domain.links === 1 ? "link" : "links"}
        </span>
        <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
          {domain.sourcePages.toLocaleString()}{" "}
          {domain.sourcePages === 1 ? "page" : "pages"}
        </span>
      </button>
      {expanded ? (
        <ul className="border-t border-border/50 bg-muted/20">
          {domain.targets.map((target) => (
            <li
              key={target.url}
              className="border-b border-border/40 px-3 py-2 pl-9 last:border-b-0"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground"
                  title={target.url}
                >
                  {target.url}
                </span>
                <a
                  href={target.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${target.url}`}
                  className="shrink-0 text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
                <HttpStatusBadge httpStatus={target.httpStatus} />
                {target.nofollow ? (
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    nofollow
                  </Badge>
                ) : null}
                <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  ×{target.links.toLocaleString()}
                </span>
                <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {target.sourcePages.toLocaleString()}{" "}
                  {target.sourcePages === 1 ? "page" : "pages"}
                </span>
              </div>
              {target.anchors.length > 0 ? (
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {target.anchors
                    .map(([anchor, count]) =>
                      count > 1 ? `“${anchor}” ×${count}` : `“${anchor}”`,
                    )
                    .join(" · ")}
                </p>
              ) : null}
              {target.sourceSamples.length > 0 ? (
                <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px]">
                  <span className="text-muted-foreground">From</span>
                  {target.sourceSamples.map((sample) => (
                    <Link
                      key={sample.pageId}
                      href={`${sitePath}/pages/${sample.pageId}`}
                      className="truncate font-mono text-primary"
                      title={sample.url}
                    >
                      {displayUrl(sample.url, rootUrl)}
                    </Link>
                  ))}
                  {target.sourcePages > target.sourceSamples.length ? (
                    <span className="text-muted-foreground">
                      +{target.sourcePages - target.sourceSamples.length} more
                    </span>
                  ) : null}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function ExternalLinksView({ crawlId }: { crawlId?: string }) {
  const { site, sitePath } = useMarketingSite();
  const queryClient = useQueryClient();
  const query = useLinkGraphEdges(site.id, crawlId ?? null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState(false);

  const runLinkCheck = async () => {
    setChecking(true);
    try {
      await checkSiteLinks(site.id);
      await queryClient.invalidateQueries({
        queryKey: inspectionKeys.linkGraph(site.id, crawlId ?? null),
      });
      toast.success("Link status check complete.");
    } catch (error) {
      toast.error("Link status check failed", {
        description: extractErrorMessage(error),
      });
    } finally {
      setChecking(false);
    }
  };

  const report = useMemo(
    () => (query.data ? buildExternalLinkReport(query.data.rows) : null),
    [query.data],
  );
  const brokenTargets = useMemo(
    () =>
      report
        ? report.domains.reduce(
            (sum, domain) =>
              sum +
              domain.targets.filter(
                (target) =>
                  target.httpStatus !== null && target.httpStatus >= 400,
              ).length,
            0,
          )
        : 0,
    [report],
  );

  const filtered = useMemo(() => {
    if (!report) return [];
    const q = search.trim().toLowerCase();
    if (!q) return report.domains;
    return report.domains
      .map((domain) => {
        if (domain.domain.includes(q)) return domain;
        const targets = domain.targets.filter(
          (t) =>
            t.url.toLowerCase().includes(q) ||
            t.anchors.some(([anchor]) => anchor.toLowerCase().includes(q)),
        );
        return targets.length > 0 ? { ...domain, targets } : null;
      })
      .filter((d): d is ExternalDomainRollup => d !== null);
  }, [report, search]);

  if (query.isLoading)
    return <LoadingSurface label="Building outbound link report…" />;
  if (query.isError || !query.data || !report) {
    return (
      <QueryError error={query.error} onRetry={() => void query.refetch()} />
    );
  }

  const copy = webCopy({
    kind: "web-external-links",
    label: "Outbound links",
    description:
      "Every external link the site sends out, grouped by destination domain with per-target link counts, linking pages, anchors, and nofollow status.",
    surface: crawlId
      ? `Crawl outbound links — session ${crawlId}`
      : `Outbound links — ${site.root_url}`,
    data: {
      site_id: site.id,
      session_id: crawlId ?? null,
      totals: {
        domains: report.domains.length,
        targets: report.totalTargets,
        links: report.totalLinks,
        nofollow_links: report.nofollowLinks,
        linking_pages: report.linkingPages,
        status_unchecked: report.statusUnchecked,
      },
      domains: report.domains,
    },
    lines: [
      ["Destination domains", report.domains.length],
      ["Distinct targets", report.totalTargets],
      ["Outbound links", report.totalLinks],
      ["Nofollow links", report.nofollowLinks],
      ["Pages linking out", report.linkingPages],
    ],
    attributes: { site_id: site.id, session_id: crawlId },
  });

  if (report.domains.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <Link2Off className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          No outbound links recorded
        </p>
        <p className="max-w-sm text-xs text-muted-foreground">
          External links appear after snapshots are captured for pages that
          link beyond {displayUrl(site.root_url, site.root_url) || "this site"}.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex shrink-0 items-center gap-3 overflow-x-auto border-b border-border px-3 py-2">
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter domain, URL, or anchor…"
            className="h-8 w-56 rounded-md border border-border bg-background pl-7 pr-2 text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50"
            style={{ fontSize: 16 }}
          />
        </div>
        <StatChip value={report.domains.length} label="domains" />
        <StatChip value={report.totalTargets} label="targets" />
        <StatChip value={report.totalLinks} label="outbound links" />
        <StatChip
          value={report.nofollowLinks}
          label="nofollow"
          tone="warning"
        />
        <StatChip value={report.linkingPages} label="pages link out" />
        {!report.statusUnchecked ? (
          <StatChip value={brokenTargets} label="broken" tone="warning" />
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {query.data.truncated ? (
            <span className="text-[11px] tabular-nums text-muted-foreground">
              newest {query.data.rows.length.toLocaleString()} of{" "}
              {query.data.total.toLocaleString()} rows
            </span>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            disabled={checking}
            onClick={() => void runLinkCheck()}
          >
            {checking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            Check link status
          </Button>
          <CopyButtons size="icon" {...copy} />
        </div>
      </div>
      {report.statusUnchecked ? (
        <p className="shrink-0 border-b border-border bg-amber-500/5 px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          None of these outbound targets have been HTTP-checked yet — click
          "Check link status" above to verify them and flag broken links.
        </p>
      ) : null}
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {filtered.map((domain) => (
          <DomainRow
            key={domain.domain}
            domain={domain}
            expanded={expanded.has(domain.domain) || Boolean(search.trim())}
            onToggle={() =>
              setExpanded((previous) => {
                const next = new Set(previous);
                next.has(domain.domain)
                  ? next.delete(domain.domain)
                  : next.add(domain.domain);
                return next;
              })
            }
            sitePath={sitePath}
            rootUrl={site.root_url}
          />
        ))}
        {filtered.length === 0 ? (
          <li className="px-3 py-6 text-center text-xs text-muted-foreground">
            No outbound links match “{search.trim()}”.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
