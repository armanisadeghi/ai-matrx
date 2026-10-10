"use client";

// features/marketing/seo/domain-research/DomainResearchPage.tsx — THE DOMAIN
// PAGE: research any domain (OpenSEO Wave 3, screen 2; champions Ahrefs Site
// Explorer and Semrush Domain Overview).
//
//   /marketing/tools/domain?d=<host>&site=<siteId>&tab=keywords|competitors|gap
//
// Stats header (`seo_domain` overview) + three tabs: Keywords
// (`ranked_keywords`), Competitors (`serp_competitors` seeded with this
// domain's top keywords) and "They rank, we don't" (`keyword_gap` against one
// of the person's own sites). Every tool call goes through the screen-run door
// (`useToolAction`): each section first asks for a free stored result, and a
// paid run is offered at the price the live tool definition states, with the
// spend approval appearing in place when the organization's threshold needs it.
// It is one more place: the competitor workspace and backlinks link here; it
// replaces nothing.

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Globe,
  KeyRound,
  RefreshCw,
  Search,
  Swords,
  Target,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  RegionSkeleton,
  SearchField,
  Select,
} from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { formatAbsoluteDate, formatCount, formatUsd } from "@ai-matrx/kit/format";
import { useCostDisplay } from "@/components/cost/useCostDisplay";

import { ErrorNotice } from "@ai-matrx/design-system";
import { KpiGrid, KpiTile } from "@/components/official/kpi/KpiTile";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { listCompetitorSites } from "@/features/marketing/competitors/data";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { listCompetitorRowsForDomain, normalizeDomainInput } from "./data";
import { readDomainPrices, type ActionPrice } from "./prices";
import type { SectionState } from "./section-state";
import type {
  DomainOverviewData,
  KeywordGapRow,
  RankedKeywordRow,
  SerpCompetitorRow,
} from "./types";
import { useDomainSection } from "./useDomainSection";
import { NO_RAW_ROW_WINDOW } from "@/features/marketing/social/row-open";

export type DomainTab = "keywords" | "competitors" | "gap";
const TABS: { tab: DomainTab; name: string; description: string }[] = [
  { tab: "keywords", name: "Keywords", description: "Organic keywords this domain ranks for" },
  { tab: "competitors", name: "Competitors", description: "Domains winning the same searches" },
  { tab: "gap", name: "They rank, we don't", description: "Their keywords your site is missing" },
];

/** How many of the domain's top keywords seed the competitor search. */
export const COMPETITOR_SEED_KEYWORDS = 10;

export function parseTab(value: string | null): DomainTab {
  return value === "competitors" || value === "gap" ? value : "keywords";
}

export function priceLabel(
  price: ActionPrice | undefined,
  format: (usd: number | null | undefined) => string,
): string {
  return price?.costUsd != null ? format(price.costUsd) : "cost unknown";
}

export function shortDate(value: string | null): string {
  if (!value) return "unknown date";
  // A bare "YYYY-MM-DD" (the tool's as_of) is a calendar day, not UTC midnight.
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return formatAbsoluteDate(value, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(dayOnly ? { timeZone: "UTC" } : {}),
  });
}

/** Top keywords by volume, the competitor search's seed. */
export function seedKeywords(rows: RankedKeywordRow[], max = COMPETITOR_SEED_KEYWORDS): string[] {
  return [...rows]
    .filter((r) => r.keyword)
    .sort((a, b) => (b.search_volume ?? -1) - (a.search_volume ?? -1))
    .slice(0, max)
    .map((r) => r.keyword as string);
}

const MARKETS: Record<number, string> = { 2840: "United States" };

export function DomainResearchPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [, startTransition] = useTransition();
  const host = normalizeDomainInput(params.get("d"));
  const siteId = params.get("site") || null;
  const tab = parseTab(params.get("tab"));

  const hrefFor = (next: { d?: string | null; site?: string | null; tab?: DomainTab }) => {
    const q = new URLSearchParams();
    const d = next.d === undefined ? host : next.d;
    const site = next.site === undefined ? siteId : next.site;
    const t = next.tab ?? tab;
    if (d) q.set("d", d);
    if (site) q.set("site", site);
    if (t !== "keywords") q.set("tab", t);
    const query = q.toString();
    return `${pathname ?? marketingRoutes.domainResearch()}${query ? `?${query}` : ""}`;
  };
  const go = (href: string) => startTransition(() => router.replace(href, { scroll: false }));

  const prices = useQuery({
    queryKey: ["marketing", "domain-research", "prices"],
    queryFn: readDomainPrices,
    staleTime: 10 * 60_000,
  });
  const sites = useQuery({
    queryKey: ["marketing", "competitors", "sites"],
    queryFn: listCompetitorSites,
    staleTime: 5 * 60_000,
  });
  const competitorRows = useQuery({
    queryKey: ["marketing", "domain-research", "competitor-rows", host],
    queryFn: () => listCompetitorRowsForDomain(host as string),
    enabled: Boolean(host),
  });
  const tracked = (competitorRows.data ?? []).some((r) => r.tracking_status === "tracked");
  const site = (sites.data ?? []).find((s) => s.id === siteId) ?? null;

  const overview = useDomainSection("overview", host ? { target: host } : null);
  const keywords = useDomainSection(
    "ranked_keywords",
    host ? { target: host, ...(siteId ? { site_id: siteId } : {}) } : null,
  );
  const seeds =
    keywords.state.kind === "ready" ? seedKeywords(keywords.state.data.rows) : [];
  const competitors = useDomainSection(
    "serp_competitors",
    host && tab === "competitors" && seeds.length > 0 ? { keywords: seeds } : null,
  );
  const gap = useDomainSection(
    "keyword_gap",
    host && tab === "gap" && siteId ? { competitor: host, site_id: siteId } : null,
  );

  const price = (action: "overview" | "ranked_keywords" | "serp_competitors" | "keyword_gap") =>
    prices.data?.[action];

  return (
    <>
      <RecordPageHeader
        parents={[{ label: "SEO Tools", href: marketingRoutes.tools() }]}
        record={{ name: host ?? "Domain research" }}
        status={tracked ? { label: "Tracked competitor", tone: "info" } : undefined}
        modes={
          host
            ? TABS.map((t) => ({ name: t.name, href: hrefFor({ tab: t.tab }), description: t.description }))
            : undefined
        }
        activeModeHref={host ? hrefFor({ tab }) : undefined}
        onModeSelect={go}
        actions={
          host
            ? [{ label: "Open site", icon: ArrowUpRight, href: `https://${host}`, newTab: true }]
            : undefined
        }
      />
      <div className="h-full overflow-hidden">
        <div className="h-full overflow-y-auto" data-matrx-page-scroll>
          <div className="mx-auto flex max-w-7xl flex-col gap-3 p-3">
            <DomainSearch
              initial={host ?? ""}
              onSubmit={(d) => go(hrefFor({ d }))}
            />
            {prices.isError ? (
              <ErrorNotice
                size="inline"
                message="Prices could not be read from the tool definition."
                error={prices.error}
                operation="Read seo_domain prices"
              />
            ) : null}
            {!host ? (
              <EmptyState
                icon={<Globe />}
                title="Research any domain"
                line="Traffic, keywords and competitors, with sources and dates."
              />
            ) : (
              <>
                <section aria-label="Domain stats" className="flex flex-col gap-2">
                  <SourceLine
                    what="Stats"
                    state={overview.state}
                    price={price("overview")}
                    onRefresh={() => void overview.buy(true)}
                    busy={overview.running}
                  />
                  <SectionGate
                    state={overview.state}
                    action="overview"
                    price={price("overview")}
                    what="stats"
                    shape="cards"
                    onBuy={() => void overview.buy()}
                    onRetry={() => void overview.recheck()}
                  >
                    {overview.state.kind === "ready" ? (
                      <OverviewTiles data={overview.state.data} />
                    ) : null}
                  </SectionGate>
                </section>

                {tab === "keywords" ? (
                  <section aria-label="Keywords" className="flex flex-col gap-2">
                    <SourceLine
                      what="Keywords"
                      state={keywords.state}
                      price={price("ranked_keywords")}
                      onRefresh={() => void keywords.buy(true)}
                      busy={keywords.running}
                    >
                      {keywords.state.kind === "ready" &&
                      keywords.state.data.brand_terms_subtracted.length > 0 ? (
                        <Badge tone="neutral" title="Keywords containing these terms are hidden">
                          Brand terms removed: {keywords.state.data.brand_terms_subtracted.join(", ")}
                        </Badge>
                      ) : null}
                    </SourceLine>
                    <SectionGate
                      state={keywords.state}
                      action="ranked_keywords"
                      price={price("ranked_keywords")}
                      what="keywords"
                      shape="rows"
                      onBuy={() => void keywords.buy()}
                      onRetry={() => void keywords.recheck()}
                    >
                      {keywords.state.kind === "ready" ? (
                        <KeywordsTable rows={keywords.state.data.rows} />
                      ) : null}
                    </SectionGate>
                  </section>
                ) : null}

                {tab === "competitors" ? (
                  <section aria-label="Competitors" className="flex flex-col gap-2">
                    {seeds.length === 0 ? (
                      keywords.state.kind === "loading" ? (
                        <RegionSkeleton shape="rows" count={6} aria-label="Loading keywords" />
                      ) : (
                        // read-gate-exempt: seeds come from the page address, not from a read
                        <EmptyState
                          icon={<KeyRound />}
                          title="Keywords come first"
                          line="Competitors are found from this domain's top keywords."
                          action={
                            <Button variant="primary" onClick={() => go(hrefFor({ tab: "keywords" }))}>
                              Open keywords
                            </Button>
                          }
                        />
                      )
                    ) : (
                      <>
                        <SourceLine
                          what="Competitors"
                          state={competitors.state}
                          price={price("serp_competitors")}
                          onRefresh={() => void competitors.buy(true)}
                          busy={competitors.running}
                        >
                          <Badge tone="neutral" title={seeds.join(", ")}>
                            From top {seeds.length} keywords
                          </Badge>
                        </SourceLine>
                        <SectionGate
                          state={competitors.state}
                          action="serp_competitors"
                          price={price("serp_competitors")}
                          what="competitors"
                          shape="rows"
                          onBuy={() => void competitors.buy()}
                          onRetry={() => void competitors.recheck()}
                        >
                          {competitors.state.kind === "ready" ? (
                            <CompetitorsTable
                              rows={competitors.state.data.rows}
                              host={host}
                              siteId={siteId}
                            />
                          ) : null}
                        </SectionGate>
                      </>
                    )}
                  </section>
                ) : null}

                {tab === "gap" ? (
                  <section aria-label="They rank, we don't" className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        aria-label="Your site"
                        value={siteId ?? ""}
                        options={[
                          { value: "", label: sites.isLoading ? "Loading sites…" : "Choose your site" },
                          ...(sites.data ?? []).map((s) => ({
                            value: s.id,
                            label: s.name || s.domain || s.id,
                            meta: s.domain ?? undefined,
                          })),
                        ]}
                        onValueChange={(value) => go(hrefFor({ site: value || null }))}
                      />
                      {siteId ? (
                        <SourceLine
                          what="Gap"
                          state={gap.state}
                          price={price("keyword_gap")}
                          onRefresh={() => void gap.buy(true)}
                          busy={gap.running}
                        />
                      ) : null}
                    </div>
                    {!siteId ? (
                      sites.isError ? (
                        <ErrorNotice
                          title="Your sites could not be loaded"
                          error={sites.error}
                          operation="List your sites"
                          actions={<Button onClick={() => void sites.refetch()}>Try again</Button>}
                        />
                      ) : (sites.data?.length ?? 1) === 0 ? (
                        <EmptyState
                          icon={<Target />}
                          title="No sites yet"
                          line="Add one of your sites to compare against it."
                        />
                      ) : (
                        <EmptyState
                          icon={<Target />}
                          title="Choose one of your sites"
                          line={`Keywords ${host} ranks for that your site does not.`}
                        />
                      )
                    ) : (
                      <SectionGate
                        state={gap.state}
                        action="keyword_gap"
                        price={price("keyword_gap")}
                        what="the gap"
                        shape="rows"
                        onBuy={() => void gap.buy()}
                        onRetry={() => void gap.recheck()}
                      >
                        {gap.state.kind === "ready" ? (
                          <GapTable rows={gap.state.data.rows} ours={site?.domain ?? gap.state.data.target} />
                        ) : null}
                      </SectionGate>
                    )}
                  </section>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
      {overview.approvalDialog}
      {keywords.approvalDialog}
      {competitors.approvalDialog}
      {gap.approvalDialog}
    </>
  );
}

function DomainSearch({ initial, onSubmit }: { initial: string; onSubmit: (host: string) => void }) {
  const [value, setValue] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const host = normalizeDomainInput(value);
    setInvalid(!host);
    if (host) onSubmit(host);
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2" role="search">
      <SearchField
        aria-label="Domain"
        placeholder="example.com"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={invalid || undefined}
        width="xl"
      />
      <Button type="submit" variant="primary" icon={<Search />}>
        Research
      </Button>
      {invalid ? (
        <ErrorNotice size="inline" message="Enter a domain like example.com" operation="Research a domain" />
      ) : null}
    </form>
  );
}

/** Where a section's numbers came from and when: the tool's reuse verdict. */
export function SourceLine<T>({
  what,
  state,
  price,
  onRefresh,
  busy,
  children,
}: {
  what: string;
  state: SectionState<T>;
  price: ActionPrice | undefined;
  onRefresh: () => void;
  busy: boolean;
  children?: ReactNode;
}) {
  const { format } = useCostDisplay();
  if (state.kind !== "ready") return null;
  const source = state.reused
    ? `Reused from ${shortDate(state.observedAt)}`
    : `Bought ${shortDate(state.observedAt)}${
        state.chargedUsd != null ? ` · ${format(state.chargedUsd)}` : ""
      }`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={state.reused ? "neutral" : "info"} title={`${what}: estimate from DataForSEO Labs`}>
        {source}
      </Badge>
      {children}
      <Button
        variant="quiet"
        icon={<RefreshCw />}
        disabled={busy}
        onClick={onRefresh}
        title={`Buy a fresh read of ${what.toLowerCase()}`}
      >
        Refresh · {priceLabel(price, format)}
      </Button>
      {state.partial && state.notice ? (
        <Badge tone="warning" title={state.notice}>
          Some figures are missing
        </Badge>
      ) : null}
    </div>
  );
}

/** Loading, not stored (offer the paid run), and error; ready renders children. */
export function SectionGate<T>({
  state,
  action,
  price,
  what,
  shape,
  onBuy,
  onRetry,
  children,
}: {
  state: SectionState<T>;
  action: string;
  price: ActionPrice | undefined;
  what: string;
  shape: "cards" | "rows";
  onBuy: () => void;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { format } = useCostDisplay();
  switch (state.kind) {
    case "idle":
      return null;
    case "loading":
      return (
        <RegionSkeleton
          shape={shape}
          count={shape === "cards" ? 6 : 8}
          aria-label={state.buying ? `Buying ${what}` : `Checking stored ${what}`}
        />
      );
    case "not_stored":
      return (
        <EmptyState
          icon={<Search />}
          title={`No stored ${what} to reuse`}
          line={
            state.note ??
            (price?.reuseDays != null
              ? `${priceLabel(price, format)} per run, then free for ${price.reuseDays} days.`
              : `${priceLabel(price, format)} per run.`)
          }
          action={
            <Button variant="primary" onClick={onBuy}>
              Run · {priceLabel(price, format)}
            </Button>
          }
        />
      );
    case "error":
      return (
        <ErrorNotice
          title={`Could not load ${what}`}
          message={state.message}
          operation={`seo_domain ${action}`}
          actions={<Button onClick={onRetry}>Try again</Button>}
        />
      );
    case "ready":
      return <>{children}</>;
  }
}

function OverviewTiles({ data }: { data: DomainOverviewData }) {
  const asOf = shortDate(data.as_of);
  const backlinksHint =
    data.backlinks_source === "stored_backlink_summary"
      ? `Your stored summary · ${shortDate(data.backlinks_as_of)}`
      : data.backlinks_source === "dataforseo_backlinks_summary"
        ? `Backlinks estimate · ${shortDate(data.backlinks_as_of)}`
        : "Unknown";
  const market = MARKETS[data.market.location_code] ?? `Location ${data.market.location_code}`;
  return (
    <KpiGrid>
      <KpiTile
        label="Traffic"
        value={data.organic_traffic_est != null ? formatCount(data.organic_traffic_est, { style: "compact" }) : null}
        hint={`Monthly estimate · ${asOf}`}
        title="Estimated monthly organic visits, from DataForSEO Labs."
      />
      <KpiTile
        label="Keywords"
        value={data.organic_keywords != null ? formatCount(data.organic_keywords, { style: "compact" }) : null}
        hint={`Organic · ${asOf}`}
        title="Organic keywords this domain ranks for in this market."
      />
      <KpiTile
        label="Paid keywords"
        value={data.paid_keywords != null ? formatCount(data.paid_keywords, { style: "compact" }) : null}
        hint={`Ads · ${asOf}`}
      />
      <KpiTile
        label="Backlinks"
        value={data.backlinks != null ? formatCount(data.backlinks, { style: "compact" }) : null}
        hint={backlinksHint}
      />
      <KpiTile
        label="Referring domains"
        value={data.referring_domains != null ? formatCount(data.referring_domains, { style: "compact" }) : null}
        hint={backlinksHint}
      />
      <KpiTile
        label="Market"
        value={market}
        hint={`${data.market.language_code.toUpperCase()}${data.market.defaulted ? " · default" : ""}`}
      />
    </KpiGrid>
  );
}

const num = (v: number | null) =>
  v == null ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums">{formatCount(v)}</span>;

function KeywordsTable({ rows }: { rows: RankedKeywordRow[] }) {
  const columns: MatrxColumnDef<RankedKeywordRow>[] = [
    { accessorKey: "keyword", header: "Keyword", filter: "text" },
    { accessorKey: "position", header: "Position", filter: "number", align: "right", cell: (r) => num(r.position) },
    { accessorKey: "search_volume", header: "Volume", filter: "number", align: "right", cell: (r) => num(r.search_volume) },
    { accessorKey: "traffic_estimate", header: "Traffic", filter: "number", align: "right", cell: (r) => num(r.traffic_estimate == null ? null : Math.round(r.traffic_estimate)) },
    {
      accessorKey: "cpc",
      header: "CPC",
      filter: "number",
      align: "right",
      cell: (r) => (r.cpc == null ? num(null) : <span className="tabular-nums">{formatUsd(r.cpc, { digits: 2 })}</span>),
    },
    { accessorKey: "difficulty", header: "Difficulty", filter: "number", align: "right", cell: (r) => num(r.difficulty) },
    { accessorKey: "provider_intent", header: "Intent", filter: "select" },
    {
      accessorKey: "url",
      header: "Ranking page",
      filter: "text",
      cell: (r) =>
        r.url ? (
          <a href={r.url} target="_blank" rel="noreferrer" className="block max-w-72 truncate text-primary" title={r.url}>
            {r.url.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          num(null)
        ),
    },
  ];
  return (
    <MatrxDataTable {...NO_RAW_ROW_WINDOW}
      urlState={{ id: "domain-keywords" }}
      data={rows}
      columns={columns}
      getRowId={(r) => `${r.keyword ?? ""}|${r.url ?? ""}`}
      emptyState={{ title: "No organic keywords in this market" }}
    />
  );
}

function CompetitorsTable({
  rows,
  host,
  siteId,
}: {
  rows: SerpCompetitorRow[];
  host: string;
  siteId: string | null;
}) {
  const columns: MatrxColumnDef<SerpCompetitorRow>[] = [
    {
      accessorKey: "domain",
      header: "Domain",
      filter: "text",
      cell: (r) =>
        r.domain && r.domain !== host ? (
          <Link
            href={marketingRoutes.domainResearch(r.domain, siteId)}
            className="text-primary"
            title={`Research ${r.domain}`}
          >
            {r.domain}
          </Link>
        ) : (
          <span>{r.domain ?? "—"}</span>
        ),
    },
    { accessorKey: "avg_position", header: "Avg position", filter: "number", align: "right", cell: (r) => num(r.avg_position == null ? null : Math.round(r.avg_position * 10) / 10) },
    { accessorKey: "visibility", header: "Visibility", filter: "number", align: "right", cell: (r) => num(r.visibility == null ? null : Math.round(r.visibility * 100) / 100) },
    { accessorKey: "keywords_count", header: "Shared keywords", filter: "number", align: "right", cell: (r) => num(r.keywords_count) },
    { accessorKey: "etv", header: "Traffic", filter: "number", align: "right", cell: (r) => num(r.etv == null ? null : Math.round(r.etv)) },
  ];
  return (
    <MatrxDataTable {...NO_RAW_ROW_WINDOW}
      urlState={{ id: "domain-competitors" }}
      data={rows}
      columns={columns}
      getRowId={(r) => r.domain ?? ""}
      emptyState={{ icon: <Swords />, title: "No competing domains found" }}
    />
  );
}

function GapTable({ rows, ours }: { rows: KeywordGapRow[]; ours: string }) {
  const columns: MatrxColumnDef<KeywordGapRow>[] = [
    { accessorKey: "keyword", header: "Keyword", filter: "text" },
    { accessorKey: "their_position", header: "Their position", filter: "number", align: "right", cell: (r) => num(r.their_position) },
    { accessorKey: "search_volume", header: "Volume", filter: "number", align: "right", cell: (r) => num(r.search_volume) },
    { accessorKey: "difficulty", header: "Difficulty", filter: "number", align: "right", cell: (r) => num(r.difficulty) },
    {
      accessorKey: "their_url",
      header: "Their page",
      filter: "text",
      cell: (r) =>
        r.their_url ? (
          <a href={r.their_url} target="_blank" rel="noreferrer" className="block max-w-72 truncate text-primary" title={r.their_url}>
            {r.their_url.replace(/^https?:\/\//, "")}
          </a>
        ) : (
          num(null)
        ),
    },
  ];
  return (
    <MatrxDataTable {...NO_RAW_ROW_WINDOW}
      urlState={{ id: "domain-gap" }}
      data={rows}
      columns={columns}
      getRowId={(r) => r.keyword ?? ""}
      emptyState={{ title: `No gap: ${ours} ranks for all of these` }}
    />
  );
}
