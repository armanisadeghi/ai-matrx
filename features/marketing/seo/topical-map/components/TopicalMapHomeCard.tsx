"use client";

/**
 * ONE MAP on the Content home: what it holds, who uses it, what needs a hand.
 *
 * Every number comes from `seo.map_diagnostics` (one read per map, one more
 * per site using it) and is a DOOR into the screen that answers it (no-dead-ends
 * — a count is a door). ABSENT IS NOT ZERO: a number is rendered only after
 * its read lands; while it loads the slot says so, and a refusal renders the
 * function's own sentence.
 *
 * `pages_on_no_topic` only means something per site (the function says so:
 * without a site it is 0 because there is nothing to count), so it is shown on
 * each site's row, never on the map.
 *
 * "Site uses map" — `seo.set_site_map`, editor on BOTH the site and the map;
 * the refusal is the function's own words. "Extend from the site" (R14) is the
 * map author on THIS map, source `data`, mode `propose` — the home switches
 * into its start mode with those locked (`?start=data&map=…&site=…&extend=1`).
 */

import Link from "next/link";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { BrainCircuit, Link2, Network } from "lucide-react";

import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MarketingSite } from "@/features/marketing/types";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { toast } from "@/lib/toast";

import { topicalMapErrorText } from "../errors";
import { useMapDiagnostics, useSetSiteMap } from "../hooks";
import { useMapLinks } from "../links";
import type { TopicalMap } from "../types";
import { TopicStatusMark } from "../ui/TopicStatusMark";

const PICK_SITE = "__pick__";

export function TopicalMapHomeCard({
  map,
  brandSites,
  extendHref,
}: {
  map: TopicalMap;
  /** The brand's sites — names for `sites_using_map` and the bind picker. */
  brandSites: readonly MarketingSite[] | null;
  /** The home's start mode locked to R14's extender for `(mapId, siteId)`. */
  extendHref: (mapId: string, siteId: string) => string;
}) {
  const links = useMapLinks();
  // access-errors: ok — rendered verbatim below; seo.* writes its refusals for the reader.
  const diagnostics = useMapDiagnostics(map.id);
  const bind = useSetSiteMap();
  const [pendingSite, setPendingSite] = useState<string>(PICK_SITE);

  const d = diagnostics.data ?? null;
  const usingIds = new Set(d?.sites_using_map ?? []);
  const siteById = new Map((brandSites ?? []).map((s) => [s.id, s] as const));
  const unbound = (brandSites ?? []).filter((s) => !usingIds.has(s.id));

  const outline = links.mapView(map.id, "outline");
  const table = links.mapView(map.id, "table");
  const history = links.mapView(map.id, "history");
  const pages = (siteId?: string | null) => links.mapView(map.id, "pages", siteId ?? null);

  return (
    <article className="rounded-xl border border-border bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Network className="h-4 w-4 shrink-0" aria-hidden />
            <Link href={outline} className="truncate hover:underline">
              {map.name}
            </Link>
            <TopicStatusMark status={map.status} compact />
          </h2>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {map.description ?? "No description"} · changed{" "}
            {formatDistanceToNow(new Date(map.updated_at), { addSuffix: true })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ShareButton
            resourceType="seo_topical_map"
            resourceId={map.id}
            resourceName={map.name}
            variant="outline"
            size="sm"
          />
          <Button asChild size="sm">
            <Link href={outline}>Open</Link>
          </Button>
        </div>
      </header>

      {/* Counts — each a door. */}
      {diagnostics.isError ? (
        <p role="alert" className="border-t border-border px-4 py-3 text-sm text-destructive">
          {topicalMapErrorText(diagnostics.error)}
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-px border-t border-border bg-border sm:grid-cols-4">
          <Count label="Topics" value={d?.topics_total} href={outline} loading={diagnostics.isPending} />
          <Count
            label="Proposals waiting"
            value={d?.topics_proposed.length}
            href={history}
            loading={diagnostics.isPending}
            attention
          />
          <Count
            label="Empty topics"
            value={d?.topics_empty}
            href={table}
            loading={diagnostics.isPending}
            title="Topics with no pages, no planned pages and no keywords"
          />
          <Count
            label="Sites using it"
            value={d?.sites_using_map.length}
            href={pages()}
            loading={diagnostics.isPending}
          />
        </dl>
      )}

      {/* Diagnostics strip — only what is non-zero, each a door. */}
      {d ? (
        <DiagnosticsStrip
          crowded={d.topics_crowded.length}
          spread={d.pages_on_many_topics.length}
          retired={d.retired_with_attachments.length}
          tableHref={table}
          pagesHref={pages()}
          historyHref={history}
        />
      ) : null}

      {/* Sites */}
      <section className="border-t border-border p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sites
        </h3>
        {d && d.sites_using_map.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            No site uses this map yet, so no page can be placed on its topics. Bind one below.
          </p>
        ) : null}
        <ul className="mt-2 grid gap-2">
          {(d?.sites_using_map ?? []).map((siteId) => (
            <SiteRow
              key={siteId}
              mapId={map.id}
              siteId={siteId}
              site={siteById.get(siteId) ?? null}
              pagesHref={pages(siteId)}
              extendHref={extendHref(map.id, siteId)}
            />
          ))}
        </ul>
        {brandSites && unbound.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select value={pendingSite} onValueChange={setPendingSite} disabled={bind.isPending}>
              <SelectTrigger className="h-8 w-64 text-xs" aria-label="Site to bind to this map">
                <SelectValue placeholder="A site of this brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PICK_SITE}>Pick a site…</SelectItem>
                {unbound.map((site) => (
                  <SelectItem key={site.id} value={site.id}>
                    {site.name ?? site.domain}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pendingSite === PICK_SITE || bind.isPending}
              onClick={() =>
                bind.mutate(
                  { siteId: pendingSite, mapId: map.id },
                  {
                    onSuccess: () => {
                      toast.success("The site now uses this map.");
                      setPendingSite(PICK_SITE);
                    },
                    onError: (error) => toast.error(topicalMapErrorText(error)),
                  },
                )
              }
            >
              <Link2 className="h-4 w-4" aria-hidden />
              Site uses this map
            </Button>
            <span className="text-xs text-muted-foreground">
              Needs editor access on both the site and the map.
            </span>
          </div>
        ) : null}
        {bind.isError ? (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {topicalMapErrorText(bind.error)}
          </p>
        ) : null}
      </section>
    </article>
  );
}

function Count({
  label,
  value,
  href,
  loading,
  attention,
  title,
}: {
  label: string;
  value: number | undefined;
  href: string;
  loading: boolean;
  attention?: boolean;
  title?: string;
}) {
  return (
    <Link href={href} className="bg-card px-4 py-2.5 hover:bg-muted/50" title={title}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={
          attention && value !== undefined && value > 0
            ? "text-lg font-semibold tabular-nums text-warning"
            : "text-lg font-semibold tabular-nums"
        }
      >
        {value === undefined ? (
          <span className="text-sm font-normal text-muted-foreground">
            {loading ? "loading…" : "not loaded"}
          </span>
        ) : (
          value
        )}
      </dd>
    </Link>
  );
}

function DiagnosticsStrip({
  crowded,
  spread,
  retired,
  tableHref,
  pagesHref,
  historyHref,
}: {
  crowded: number;
  spread: number;
  retired: number;
  tableHref: string;
  pagesHref: string;
  historyHref: string;
}) {
  const items = [
    crowded > 0
      ? { key: "crowded", href: tableHref, text: `${crowded} crowded ${crowded === 1 ? "topic" : "topics"}` }
      : null,
    spread > 0
      ? { key: "spread", href: pagesHref, text: `${spread} ${spread === 1 ? "page" : "pages"} on 3+ topics` }
      : null,
    retired > 0
      ? {
          key: "retired",
          href: historyHref,
          text: `${retired} retired ${retired === 1 ? "topic" : "topics"} still carrying attachments`,
        }
      : null,
  ].filter((i): i is { key: string; href: string; text: string } => i !== null);
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2 border-t border-border px-4 py-2">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            className="rounded-full border border-amber-500/40 bg-amber-500/5 px-2 py-0.5 text-xs hover:bg-amber-500/10"
          >
            {item.text}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SiteRow({
  mapId,
  siteId,
  site,
  pagesHref,
  extendHref,
}: {
  mapId: string;
  siteId: string;
  site: MarketingSite | null;
  pagesHref: string;
  extendHref: string;
}) {
  // Per site: the one number that only means something per site.
  const diagnostics = useMapDiagnostics(mapId, siteId);
  const onNoTopic = diagnostics.data?.pages_on_no_topic;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
      <span className="min-w-0 text-sm">
        <EntityRef token="web_site" id={siteId} name={site?.name ?? site?.domain ?? null} />
      </span>
      <span className="flex flex-wrap items-center gap-2 text-xs">
        {diagnostics.isError ? (
          <span role="alert" className="text-destructive">
            {topicalMapErrorText(diagnostics.error)}
          </span>
        ) : (
          <Link href={pagesHref} className="rounded border border-border px-2 py-0.5 hover:bg-muted">
            {onNoTopic === undefined
              ? "pages on no topic: loading…"
              : `${onNoTopic} ${onNoTopic === 1 ? "page" : "pages"} on no topic`}
          </Link>
        )}
        <Button asChild size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs">
          <Link href={extendHref} title="Run the map author on this map from the site's crawl, keywords and plan; new topics land as proposals">
            <BrainCircuit className="h-3.5 w-3.5" aria-hidden />
            Extend from the site
          </Link>
        </Button>
      </span>
    </li>
  );
}
