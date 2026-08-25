"use client";

/**
 * `seo_rank_serp_landscape` — THE canonical component for the whole
 * competitive results page behind one tracked reading.
 *
 * WHY THE PAGE IS A LIST AND NOT SECTIONS: a search result set is a set of
 * answers; a tracked SERP is a PAGE, and the entire competitive story is the
 * INTERLEAVING — a map pack sitting above organic #3, an AI overview eating
 * the top of the fold. Sectioning it (the `web_search_results` idiom) destroys
 * exactly the thing this view exists to show. So the page renders in
 * `absolute_rank` order, one `serp_placement` per position, and each placement
 * delegates its result to the search family's canonical component.
 *
 * 🚨 THE RANK-BASIS DISCLOSURE IS NOT OPTIONAL. `absolute_rank` is an
 * OBSERVATION when the engine reported the page's block order (Brave does) and
 * a CONVENTION when it did not (Google). Showing an ordered page without
 * saying which one it is implies the engine published that order. `RankBasisNote`
 * states it in words, above the list, always.
 *
 * 🚨 PRE-CUTOVER TYPING. The registry row for this slug still carries the
 * pre-supersede schema (v4: `snapshot_id` / `observed_at` / `results` only) —
 * the breaking supersede rides Stage D with the node repoint, because live
 * nodes verify `output_kind` against the registry on every run. So the
 * registry-generated type covers the three legacy fields and the rest of the
 * page context is read defensively off the same object. At cutover the
 * registry row becomes the model's full shape, `pnpm shape:types` regenerates,
 * and the `raw` reads below collapse into typed ones. Do NOT hand-write an
 * interface for the new shape in the meantime — that is the twin the
 * `check:kind-type-twins` gate exists to refuse.
 */

import React from "react";
import { ExternalLink, ListOrdered, MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isRecord,
  num,
  readSearchKindValue,
  records,
  strings,
  text,
} from "../search-kinds/search-kind-data";
import { SearchChip, SectionHeading } from "../search-kinds/search-kind-shared";
import { RankKindNested } from "./RankKindNested";
import { RankBasisNote, RankChip, shortDate } from "./rank-kind-shared";

interface SeoRankSerpLandscapeBlockProps {
  serverData?: unknown;
  className?: string;
}

/** The engine's own commentary on the query — free intent classification. */
function signalChips(signals: unknown): string[] {
  if (!isRecord(signals)) return [];
  const out: string[] = [];
  if (signals.is_geolocal === true) out.push("local intent");
  if (signals.is_navigational === true) out.push("navigational");
  if (signals.is_news_breaking === true) out.push("breaking news");
  if (signals.more_results_available === true) out.push("more results available");
  if (signals.bad_results === true) out.push("engine flagged its own results as poor");
  if (signals.spellcheck_off === true) out.push("spellcheck off");
  const decision = text(signals.local_decision);
  if (decision) out.push(`local decision: ${decision}`);
  return out;
}

export function SeoRankSerpLandscapeBlock({
  serverData,
  className,
}: SeoRankSerpLandscapeBlockProps) {
  const { value, isComplete } =
    readSearchKindValue<"seo_rank_serp_landscape">(serverData);
  // The pre-cutover half of the shape (see the header). One cast, one reason.
  const raw = value as unknown as Record<string, unknown>;

  const placements = records(value.results);
  const query = text(raw.query);
  const engine = text(raw.engine);
  const provider = text(raw.provider);
  const device = text(raw.device);
  const language = text(raw.language);
  const country = text(raw.country);
  const location = text(raw.location_name);
  const total = num(raw.total_results);
  const observedAt = shortDate(value.observed_at);
  const related = strings(raw.related_searches);
  const basis = text(raw.rank_basis);
  const blockOrder = strings(raw.block_order);
  const chips = signalChips(raw.signals);
  const alteredQuery = isRecord(raw.signals)
    ? text(raw.signals.altered_query)
    : null;

  return (
    <div className={cn("my-2 space-y-3", className)}>
      {/* Page header — what was asked, of whom, from where, when. */}
      <div className="flex flex-wrap items-start gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Search className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-base font-semibold text-foreground">
              {query ?? (isComplete ? "Results page" : "Loading page…")}
            </span>
            {engine && <RankChip>{engine}</RankChip>}
            {provider && provider !== engine && <RankChip>{provider}</RankChip>}
            {device && <RankChip>{device}</RankChip>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {location}
              </span>
            )}
            {(country ?? language) && (
              <span>{[country, language].filter(Boolean).join(" · ")}</span>
            )}
            {total !== null && total > 0 && (
              <span>{Intl.NumberFormat().format(total)} results claimed</span>
            )}
            {observedAt && <span>observed {observedAt}</span>}
          </div>
          {alteredQuery && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              The engine rewrote the query to{" "}
              <span className="font-medium text-foreground">{alteredQuery}</span>
              .
            </div>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((chip) => (
            <SearchChip key={chip}>{chip}</SearchChip>
          ))}
        </div>
      )}

      {/* Observation vs convention — stated, never implied. */}
      <RankBasisNote basis={basis} blockOrder={blockOrder} />

      <div>
        <SectionHeading
          icon={ListOrdered}
          label="The page, in order"
          count={placements.length}
        />
        {placements.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            {isComplete
              ? "The engine returned no positions for this page."
              : "Loading positions…"}
          </p>
        ) : (
          <div className="space-y-2">
            {placements.map((placement, i) =>
              typeof placement.__kind === "string" ? (
                <RankKindNested key={i} value={placement} />
              ) : (
                <LegacyPlacementRow key={i} row={placement} />
              ),
            )}
          </div>
        )}
      </div>

      {related.length > 0 && (
        <div>
          <SectionHeading icon={Search} label="Related searches" />
          <div className="flex flex-wrap gap-1">
            {related.map((item) => (
              <SearchChip key={item}>{item}</SearchChip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A pre-supersede page entry: the flat `{absolute_rank, url, domain, title,
 * snippet, result_type}` row the OLD registry schema declared, with no nested
 * kind at all. Rendered rather than skipped — silently dropping positions from
 * a view whose whole promise is "the page, in order" would be the worst
 * failure this component can have. It disappears at cutover.
 */
const LegacyPlacementRow: React.FC<{ row: Record<string, unknown> }> = ({
  row,
}) => {
  const url = text(row.url);
  const title = text(row.title) ?? text(row.domain) ?? url;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-card p-3">
      <div className="min-w-11 text-center text-sm font-semibold tabular-nums text-muted-foreground">
        {typeof row.absolute_rank === "number" ? `#${row.absolute_rank}` : "—"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{title ?? "—"}</div>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 truncate text-xs text-primary hover:underline"
          >
            <span className="truncate">{url}</span>
            <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
          </a>
        )}
        <div className="mt-1 text-[11px] italic text-muted-foreground">
          Pre-supersede page entry — recorded before this position became a
          typed <code>serp_placement</code>.
        </div>
      </div>
    </div>
  );
};

export default SeoRankSerpLandscapeBlock;
