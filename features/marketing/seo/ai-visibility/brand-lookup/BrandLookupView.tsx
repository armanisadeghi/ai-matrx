"use client";

// features/marketing/seo/ai-visibility/brand-lookup/BrandLookupView.tsx
//
// …/ai-visibility/brand — BRAND LOOKUP: how AI answers mention a brand or
// domain, from DataForSEO's AI-mentions index (Google AI Overviews, ChatGPT).
// Champions: Ahrefs Brand Radar, Profound. Matched: mentions and AI search
// volume per platform, the prompts that name the brand, the most-cited pages
// and domains, and the brand against its competitors. Beaten: competitors come
// from the site's CONFIRMED records (editable), every number names its source,
// market and date, and a null stays "No data" — never 0.
//
// 🚨 NO POOLED HEADLINE (ai-visibility FEATURE.md). This is a provider's index
// sample, not the panels' measurement: it renders as counts per platform with
// source, market and date, never as "named in X% of answers", and the
// share-of-voice board shows mention COUNTS only (the tool's share_pct is not
// rendered). It never sits beside panel metrics.
//
// Every call goes through the screen-run door (`useToolSection` over
// `useToolAction`): each section opens with a free probe that returns a stored
// result when one is fresh enough, and otherwise names this call's exact price
// (the spend gate's own estimate) before anyone can buy. Stored data (the
// confirmed competitors) is read direct from Supabase.

import { useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { MessageSquareQuote, Search, Swords } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  RegionSkeleton,
} from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { formatAbsoluteDate, formatCount } from "@ai-matrx/kit/format";

import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { KpiGrid, KpiTile } from "@/components/official/kpi/KpiTile";
import { SectionCard } from "@/features/marketing/components/shared/MarketingUi";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import type { MarketingSite } from "@/features/marketing/types";
import type { SectionState } from "../../domain-research/section-state";
import { fetchSiteCompetitors } from "../../site-context/service";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { useToolSection } from "../../tool-door/useToolSection";
import {
  mentionsArgs,
  parseNameList,
  shareOfVoiceArgs,
  type LookupInput,
} from "./lookup-args";
import {
  MENTIONS_PLATFORM_LABEL,
  SEO_AI_VISIBILITY_TOOL,
  type BrandMentionsData,
  type CitedDomain,
  type CitedPage,
  type MentionsMarket,
  type MentioningPrompt,
  type ShareOfVoiceData,
  type ShareOfVoiceEntry,
} from "./types";

/** What this index read does not prove — on screen beside every number (≤140 chars). */
export const INDEX_NOT_PROVEN =
  "A sample of an AI-answer index, updated about monthly. Not your tracked panel, and not comparable to panel metrics.";

const MARKETS: Record<number, string> = { 2840: "United States" };

export function priceText(
  format: (usd: number | null | undefined) => string,
  estimateUsd: number | null,
): string {
  return estimateUsd != null ? format(estimateUsd) : "cost unknown";
}

function marketText(market: MentionsMarket | undefined): string {
  if (!market) return "Market not stated";
  const place = MARKETS[market.location_code] ?? `Location ${market.location_code}`;
  return `${place} · ${market.language_code.toUpperCase()}`;
}

export function shortDate(value: string | null): string {
  if (!value) return "unknown date";
  // A bare "YYYY-MM-DD" is a calendar day, not UTC midnight.
  const dayOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return formatAbsoluteDate(value, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(dayOnly ? { timeZone: "UTC" } : {}),
  });
}

const num = (v: number | null) =>
  v == null ? (
    <span className="text-muted-foreground">No data</span>
  ) : (
    <span className="tabular-nums">{formatCount(v)}</span>
  );

const platformName = (p: string) => MENTIONS_PLATFORM_LABEL[p] ?? p;

/** Loading, not stored (offer the run at its exact price), error; ready renders children. */
function LookupGate<T>({
  state,
  estimateUsd,
  what,
  action,
  onBuy,
  onRetry,
  children,
}: {
  state: SectionState<T>;
  estimateUsd: number | null;
  what: string;
  action: string;
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
          shape="rows"
          count={6}
          aria-label={state.buying ? `Buying ${what}` : `Checking stored ${what}`}
        />
      );
    case "not_stored":
      return (
        <EmptyState
          icon={<Search />}
          title={`No stored ${what} to reuse`}
          line={state.note ?? `${priceText(format, estimateUsd)} now, then reused free`}
          action={
            <Button variant="primary" onClick={onBuy}>
              Run · {priceText(format, estimateUsd)}
            </Button>
          }
        />
      );
    case "error":
      return (
        <ErrorNotice
          title={`Could not load ${what}`}
          message={state.message}
          operation={`${SEO_AI_VISIBILITY_TOOL} ${action}`}
          actions={<Button onClick={onRetry}>Try again</Button>}
        />
      );
    case "ready":
      return <>{children}</>;
  }
}

/** Where the numbers came from, for which market, and when. */
function SourceBadges<T>({
  state,
  market,
}: {
  state: SectionState<T>;
  market: MentionsMarket | undefined;
}) {
  const { format } = useCostDisplay();
  if (state.kind !== "ready") return null;
  const source = state.reused
    ? `Reused from ${shortDate(state.observedAt)}`
    : `Bought ${shortDate(state.observedAt)}${
        state.chargedUsd != null ? ` · ${format(state.chargedUsd)}` : ""
      }`;
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <Badge tone={state.reused ? "neutral" : "info"} title="DataForSEO AI-mentions index">
        {source}
      </Badge>
      <Badge tone="neutral">{marketText(market)}</Badge>
      <Badge tone="neutral" title={INDEX_NOT_PROVEN}>
        Index sample, not a measurement
      </Badge>
      {state.partial && state.notice ? (
        <Badge tone="warning" title={state.notice}>
          Some figures are missing
        </Badge>
      ) : null}
    </div>
  );
}

function PromptsTable({ rows }: { rows: MentioningPrompt[] }) {
  const columns: MatrxColumnDef<MentioningPrompt>[] = [
    { accessorKey: "question", header: "Prompt", filter: "text" },
    { accessorKey: "platform", header: "Platform", filter: "select", cell: (r) => platformName(r.platform) },
    { accessorKey: "ai_search_volume", header: "AI volume", filter: "number", align: "right", cell: (r) => num(r.ai_search_volume) },
    { accessorKey: "last_seen", header: "Last seen", filter: "text", cell: (r) => (r.last_seen ? shortDate(r.last_seen) : num(null)) },
    {
      accessorKey: "brands_mentioned",
      header: "Brands named",
      filter: "text",
      cell: (r) => (
        <span className="block max-w-72 truncate" title={r.brands_mentioned.join(", ")}>
          {r.brands_mentioned.join(", ") || "—"}
        </span>
      ),
    },
  ];
  return (
    <MatrxDataTable
      urlState={{ id: "ai-brand-prompts" }}
      data={rows}
      columns={columns}
      getRowId={(r) => `${r.platform}|${r.question}`}
      emptyState={{ icon: <MessageSquareQuote />, title: "No sampled prompts name this brand" }}
    />
  );
}

function PagesTable({ rows }: { rows: CitedPage[] }) {
  const columns: MatrxColumnDef<CitedPage>[] = [
    {
      accessorKey: "url",
      header: "Cited page",
      filter: "text",
      cell: (r) => (
        <a href={r.url} target="_blank" rel="noreferrer" className="block max-w-96 truncate text-primary" title={r.url}>
          {r.url.replace(/^https?:\/\//, "")}
        </a>
      ),
    },
    { accessorKey: "platform", header: "Platform", filter: "select", cell: (r) => platformName(r.platform) },
    { accessorKey: "mentions", header: "Mentions", filter: "number", align: "right", cell: (r) => num(r.mentions) },
    { accessorKey: "ai_search_volume", header: "AI volume", filter: "number", align: "right", cell: (r) => num(r.ai_search_volume) },
  ];
  return (
    <MatrxDataTable
      urlState={{ id: "ai-brand-pages" }}
      data={rows}
      columns={columns}
      getRowId={(r) => `${r.platform}|${r.url}`}
      emptyState={{ title: "No cited pages in the sample" }}
    />
  );
}

type DomainRow = CitedDomain & { platform: string };

function DomainsTable({ byPlatform, siteId }: { byPlatform: Record<string, CitedDomain[]>; siteId: string }) {
  const rows: DomainRow[] = Object.entries(byPlatform).flatMap(([platform, list]) =>
    list.map((d) => ({ ...d, platform })),
  );
  const columns: MatrxColumnDef<DomainRow>[] = [
    {
      accessorKey: "domain",
      header: "Cited domain",
      filter: "text",
      cell: (r) => (
        <Link href={marketingRoutes.domainResearch(r.domain, siteId)} className="text-primary" title={`Research ${r.domain}`}>
          {r.domain}
        </Link>
      ),
    },
    { accessorKey: "platform", header: "Platform", filter: "select", cell: (r) => platformName(r.platform) },
    { accessorKey: "mentions", header: "Mentions", filter: "number", align: "right", cell: (r) => num(r.mentions) },
  ];
  return (
    <MatrxDataTable
      urlState={{ id: "ai-brand-domains" }}
      data={rows}
      columns={columns}
      getRowId={(r) => `${r.platform}|${r.domain}`}
      emptyState={{ title: "No cited domains in the sample" }}
    />
  );
}

function MentionsBody({ data, siteId }: { data: BrandMentionsData; siteId: string }) {
  return (
    <div className="flex flex-col gap-3 px-3 pb-3">
      <KpiGrid>
        {data.platforms.flatMap((p) => [
          <KpiTile
            key={`${p.platform}:m`}
            label={`${platformName(p.platform)} mentions`}
            value={p.status === "failed" ? null : p.mentions == null ? "No data" : formatCount(p.mentions)}
            hint={p.status === "failed" ? "This platform's read failed" : "Answers in the index naming it"}
            title={p.errors?.join("; ")}
            tone={p.status === "failed" ? "bad" : "neutral"}
          />,
          <KpiTile
            key={`${p.platform}:v`}
            label={`${platformName(p.platform)} AI volume`}
            value={p.status === "failed" ? null : p.ai_search_volume == null ? "No data" : formatCount(p.ai_search_volume)}
            hint="Monthly prompts behind those answers"
            tone={p.status === "failed" ? "bad" : "neutral"}
          />,
        ])}
      </KpiGrid>
      <p className="text-xs font-medium">Prompts that name {data.target.value}</p>
      <PromptsTable rows={data.mentioning_prompts} />
      <p className="text-xs font-medium">Most-cited pages</p>
      <PagesTable rows={data.top_cited_pages} />
      <p className="text-xs font-medium">Most-cited domains</p>
      <DomainsTable byPlatform={data.top_cited_domains} siteId={siteId} />
    </div>
  );
}

function ShareOfVoiceBody({ data, siteId }: { data: ShareOfVoiceData; siteId: string }) {
  const columns: MatrxColumnDef<ShareOfVoiceEntry>[] = [
    {
      accessorKey: "name",
      header: "Brand",
      filter: "text",
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          {r.name.includes(".") && !r.is_target ? (
            <Link href={marketingRoutes.domainResearch(r.name, siteId)} className="text-primary">
              {r.name}
            </Link>
          ) : (
            <span>{r.name}</span>
          )}
          {r.is_target ? <Badge tone="primary">You</Badge> : null}
        </span>
      ),
    },
    // Counts only — the tool's share_pct is deliberately not rendered.
    { accessorKey: "mentions", header: "Mentions", filter: "number", align: "right", cell: (r) => num(r.mentions) },
  ];
  const failed = (data.platforms ?? []).filter((p) => p.status !== "ok");
  return (
    <div className="flex flex-col gap-2 px-3 pb-3">
      {failed.length > 0 ? (
        <Badge tone="warning" title={failed.map((p) => `${platformName(p.platform)}: ${p.error ?? p.status}`).join("; ")}>
          {failed.map((p) => platformName(p.platform)).join(", ")} had no data
        </Badge>
      ) : null}
      <MatrxDataTable
        urlState={{ id: "ai-brand-share-of-voice" }}
        data={data.entries ?? []}
        columns={columns}
        getRowId={(r) => r.name}
        emptyState={{ icon: <Swords />, title: "No brands to compare" }}
      />
    </div>
  );
}

export function BrandLookupView({ site, brandId }: { site: MarketingSite; brandId: string | null }) {
  const siteDomain = site.domain ?? null;
  const competitorsQuery = useQuery({
    queryKey: ["marketing", "seo", "site-competitors", site.id] as const,
    queryFn: () => fetchSiteCompetitors(site.id),
  });
  const confirmed: string[] | null = competitorsQuery.data
    ? competitorsQuery.data.kept
        .filter((c) => c.classification_status === "confirmed")
        .map((c) => c.display_domain || c.normalized_domain || c.display_name || "")
        .filter(Boolean)
    : competitorsQuery.isError
      ? []
      : null;

  // The fields are drafts; "Look up" commits them. `competitors: null` means
  // "the confirmed list" until the person edits the field.
  const [brandDraft, setBrandDraft] = useState(siteDomain ?? "");
  const [compareDraft, setCompareDraft] = useState<string | null>(null);
  const [committed, setCommitted] = useState<{ brand: string; competitors: string[] | null }>({
    brand: siteDomain ?? "",
    competitors: null,
  });

  const input: LookupInput = {
    siteId: site.id,
    siteDomain,
    brand: committed.brand,
    competitors: committed.competitors,
    confirmed,
  };
  const mentions = useToolSection<BrandMentionsData>(
    SEO_AI_VISIBILITY_TOOL,
    committed.brand.trim() || siteDomain ? mentionsArgs(input) : null,
  );
  const sovArgs = shareOfVoiceArgs(input);
  const sov = useToolSection<ShareOfVoiceData>(SEO_AI_VISIBILITY_TOOL, sovArgs);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setCommitted({
      brand: brandDraft,
      competitors: compareDraft === null ? null : parseNameList(compareDraft),
    });
  };

  const mentionsData = mentions.state.kind === "ready" ? mentions.state.data : null;
  const sovData = sov.state.kind === "ready" ? sov.state.data : null;
  const sovWaiting = sovArgs === null && confirmed === null && committed.competitors === null;

  return (
    <main className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto bg-textured p-3">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2" aria-label="Brand lookup">
        <Field
          aria-label="Brand or domain"
          placeholder="Brand or domain"
          value={brandDraft}
          onChange={(e) => setBrandDraft(e.target.value)}
          width="lg"
        />
        <Field
          aria-label="Compare with"
          placeholder={confirmed === null ? "Loading competitors…" : "Compare with: rival.com, Rival Co"}
          value={compareDraft ?? (confirmed ?? []).join(", ")}
          onChange={(e) => setCompareDraft(e.target.value)}
          width="xl"
        />
        <Button type="submit" variant="primary" icon={<Search />}>
          Look up
        </Button>
      </form>

      <SectionCard title="Mentions in AI answers" anchor="ai_brand_mentions">
        <SourceBadges state={mentions.state} market={mentionsData?.market} />
        <LookupGate
          state={mentions.state}
          estimateUsd={mentions.estimateUsd}
          what="AI mentions"
          action="brand_mentions"
          onBuy={() => void mentions.buy()}
          onRetry={() => void mentions.recheck()}
        >
          {mentionsData ? <MentionsBody data={mentionsData} siteId={site.id} /> : null}
        </LookupGate>
      </SectionCard>

      <SectionCard title="Share of voice" anchor="ai_brand_share_of_voice">
        {competitorsQuery.isError && committed.competitors === null ? (
          <ErrorNotice
            title="Could not read confirmed competitors"
            error={competitorsQuery.error}
            operation="Read seo.competitor for this site"
            actions={<Button onClick={() => void competitorsQuery.refetch()}>Try again</Button>}
          />
        ) : sovArgs === null && !sovWaiting ? (
          <EmptyState
            icon={<Swords />}
            title="No competitors to compare"
            line="Add names in Compare with, or confirm competitors"
            action={
              <Button asChild>
                <Link href={brandId ? marketingRoutes.brandCompetitors(brandId) : marketingRoutes.competitors()}>
                  Competitors
                </Link>
              </Button>
            }
          />
        ) : sovWaiting ? (
          <RegionSkeleton shape="rows" count={4} aria-label="Reading confirmed competitors" />
        ) : (
          <>
            <SourceBadges state={sov.state} market={sovData?.market} />
            <LookupGate
              state={sov.state}
              estimateUsd={sov.estimateUsd}
              what="share of voice"
              action="share_of_voice"
              onBuy={() => void sov.buy()}
              onRetry={() => void sov.recheck()}
            >
              {sovData ? <ShareOfVoiceBody data={sovData} siteId={site.id} /> : null}
            </LookupGate>
          </>
        )}
      </SectionCard>

      {mentions.approvalDialog}
      {sov.approvalDialog}
    </main>
  );
}
