"use client";

/**
 * The meaning rail — the four ledgers that DRIVE every computed number:
 * value bands, value rules, geo areas, topic worth. Read-only here; the point
 * is that the expert can always see exactly what arithmetic their numbers
 * come from (law 3: computed value is the business's own arithmetic).
 */

import { useState } from "react";
import { Globe2, Layers, Network, SlidersHorizontal } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import type { UseQueryResult } from "@tanstack/react-query";
import type { SiteGeoArea, SiteTopicValue, TopicNode, ValueRule } from "../../types";
import { fmtMultiplier, type BandMeta } from "./lib";

type RailTab = "bands" | "rules" | "geo" | "topics";

const TABS: Array<{ id: RailTab; label: string; icon: typeof Layers }> = [
  { id: "bands", label: "Bands", icon: Layers },
  { id: "rules", label: "Rules", icon: SlidersHorizontal },
  { id: "geo", label: "Geo", icon: Globe2 },
  { id: "topics", label: "Topics", icon: Network },
];

function RailEmpty({ message }: { message: string }) {
  return (
    <p className="px-3 py-6 text-center text-xs leading-relaxed text-muted-foreground">{message}</p>
  );
}

function RailSkeleton() {
  return (
    <div className="space-y-1.5 p-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-8 animate-pulse rounded-md bg-muted/60" />
      ))}
    </div>
  );
}

function ruleMatcher(rule: ValueRule): string {
  if (rule.match_facet) return `${rule.match_facet} = ${rule.match_facet_value ?? "?"}`;
  if (rule.pattern) return `"${rule.pattern}" ${rule.match_kind ? `(${rule.match_kind})` : ""}`;
  return "—";
}

export function MeaningRail({
  bands,
  bandsTemplate,
  rules,
  geo,
  topics,
  bandFor,
}: {
  bands: BandMeta[];
  bandsTemplate: boolean;
  rules: UseQueryResult<ValueRule[]>;
  geo: UseQueryResult<SiteGeoArea[]>;
  topics: UseQueryResult<{ values: SiteTopicValue[]; topics: TopicNode[] }>;
  bandFor: (slug: string) => BandMeta;
}) {
  const [tab, setTab] = useState<RailTab>("bands");

  const counts: Record<RailTab, number | null> = {
    bands: bands.length,
    rules: rules.data?.length ?? null,
    geo: geo.data?.length ?? null,
    topics: topics.data?.values.length ?? null,
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center border-b border-border">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 border-b-2 px-2 py-1.5 text-xs transition-colors",
              tab === id
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="h-3 w-3" />
            {label}
            {counts[id] !== null ? (
              <span className="tabular-nums text-[10px] text-muted-foreground">{counts[id]}</span>
            ) : null}
          </button>
        ))}
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {tab === "bands" ? (
          <div className="p-2">
            {bandsTemplate ? (
              <p className="mb-2 rounded-md border border-dashed border-border bg-muted/40 px-2 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Using the platform starter bands — rename or re-map them any time and they become
                yours.
              </p>
            ) : null}
            {bands.map((band) => (
              <div key={band.slug} className="flex items-start gap-2 border-b border-border/60 px-1 py-1.5 last:border-b-0">
                <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", band.tone.dot)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-medium text-foreground">{band.label}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                      {band.negative
                        ? "forced by guards"
                        : band.minScore !== null
                          ? `score ≥ ${band.minScore}`
                          : band.slug === "unvalued"
                            ? "no meaning yet"
                            : ""}
                    </span>
                  </div>
                  {band.description ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">{band.description}</p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {tab === "rules" ? (
          rules.isLoading ? (
            <RailSkeleton />
          ) : rules.isError ? (
            <div className="p-2">
              <InlineQueryError what="value rules" error={rules.error} onRetry={() => void rules.refetch()} />
            </div>
          ) : !rules.data || rules.data.length === 0 ? (
            <RailEmpty message="No value rules yet. Rules multiply a keyword's score when a word or detected fact matches — e.g. 'free' seekers × 0.2." />
          ) : (
            <div className="p-2">
              {rules.data.map((rule) => (
                <div key={rule.id} className="border-b border-border/60 px-1 py-1.5 last:border-b-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-xs font-medium text-foreground">
                      {rule.name}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-[11px] font-semibold tabular-nums",
                        (rule.value_multiplier ?? 1) < 1
                          ? "text-destructive"
                          : "text-emerald-600 dark:text-emerald-400",
                      )}
                    >
                      {rule.value_multiplier !== null ? fmtMultiplier(rule.value_multiplier) : "—"}
                    </span>
                  </div>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {ruleMatcher(rule)}
                  </p>
                  {rule.description ? (
                    <p className="text-[11px] leading-snug text-muted-foreground">{rule.description}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )
        ) : null}

        {tab === "geo" ? (
          geo.isLoading ? (
            <RailSkeleton />
          ) : geo.isError ? (
            <div className="p-2">
              <InlineQueryError what="geo areas" error={geo.error} onRetry={() => void geo.refetch()} />
            </div>
          ) : !geo.data || geo.data.length === 0 ? (
            <RailEmpty message="No geo areas defined. Geo areas tell the system which searcher locations are ideal, acceptable, expansion targets, or not served." />
          ) : (
            <div className="p-2">
              {geo.data.map((area) => {
                const band = bandFor(area.geo_band);
                return (
                  <div key={area.id} className="border-b border-border/60 px-1 py-1.5 last:border-b-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs font-medium text-foreground">
                        {area.label}
                      </span>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center rounded-full border px-1.5 py-px text-[10px] font-medium leading-tight",
                          band.tone.chip,
                        )}
                      >
                        {band.label}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {area.area_kind}
                      {area.match_tokens.length > 0 ? ` · ${area.match_tokens.join(", ")}` : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          )
        ) : null}

        {tab === "topics" ? (
          topics.isLoading ? (
            <RailSkeleton />
          ) : topics.isError ? (
            <div className="p-2">
              <InlineQueryError
                what="topic worth"
                error={topics.error}
                onRetry={() => void topics.refetch()}
              />
            </div>
          ) : !topics.data || topics.data.values.length === 0 ? (
            <RailEmpty message="No topic worth set. Give a topic a worth (0–100) and every keyword under it inherits that starting score." />
          ) : (
            <TopicWorthList values={topics.data.values} topics={topics.data.topics} />
          )
        ) : null}
      </ScrollArea>
    </div>
  );
}

function TopicWorthList({ values, topics }: { values: SiteTopicValue[]; topics: TopicNode[] }) {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const sorted = [...values].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  return (
    <div className="p-2">
      {sorted.map((value) => {
        const topic = byId.get(value.topic_id);
        const guard =
          value.lead_quality === "negative_value" ||
          value.service_match === "not_offered" ||
          value.service_match === "actively_avoided";
        return (
          <div key={value.id} className="border-b border-border/60 px-1 py-1.5 last:border-b-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-xs font-medium text-foreground">
                {topic?.name ?? "Unknown topic"}
              </span>
              <span
                className={cn(
                  "shrink-0 text-[11px] font-semibold tabular-nums",
                  guard ? "text-destructive" : "text-foreground",
                )}
              >
                {guard ? "avoid" : (value.weight ?? "—")}
              </span>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">
              {topic?.node_type ? topic.node_type.replace(/_/g, " ") : ""}
              {value.lead_quality ? ` · leads: ${value.lead_quality.replace(/_/g, " ")}` : ""}
              {value.service_match ? ` · offer: ${value.service_match.replace(/_/g, " ")}` : ""}
            </p>
            {value.notes ? (
              <p className="text-[11px] italic leading-snug text-muted-foreground">{value.notes}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
