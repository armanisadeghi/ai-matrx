"use client";

/**
 * "How value is computed" — the meaning behind every number, one slide away:
 * the site's value bands, its qualifier/facet rules, its geo areas, and the
 * topic worth the tree inherits from. Read-only here; loads lazily on open.
 */

import { useEffect, useState } from "react";
import { Globe2, Ruler, Scale, TreePine } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { cn } from "@/lib/utils";
import {
  getValueVocabulary,
  listGeoAreas,
  listSiteTopicValues,
  listValueRules,
} from "../../data";
import type {
  SiteGeoArea,
  SiteTopicValue,
  TopicNode,
  ValueBandDef,
  ValueRule,
} from "../../types";
import { bandInfo, type BandTone } from "./lib";

interface MeaningData {
  geoBands: ValueBandDef[];
  rules: ValueRule[];
  geoAreas: SiteGeoArea[];
  topicValues: SiteTopicValue[];
  topics: TopicNode[];
}

function Section({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-2 space-y-1.5">{children}</div>
    </section>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
      {text}
    </p>
  );
}

export function MeaningSheet({
  open,
  onOpenChange,
  siteId,
  valueBands,
  index,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  valueBands: ValueBandDef[];
  index: Map<string, { label: string; tone: BandTone; sort: number }>;
}) {
  const [data, setData] = useState<MeaningData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    if (!open || data) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const [geoBands, rules, geoAreas, topicData] = await Promise.all([
          getValueVocabulary(siteId, "geo_band", controller.signal),
          listValueRules(siteId),
          listGeoAreas(siteId),
          listSiteTopicValues(siteId),
        ]);
        if (controller.signal.aborted) return;
        setData({
          geoBands,
          rules,
          geoAreas,
          topicValues: topicData.values,
          topics: topicData.topics,
        });
      } catch (e) {
        if (!controller.signal.aborted) setError(e);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [open, data, siteId, loadKey]);

  const usingTemplate = valueBands.some((b) => b.is_template);
  const topicName = (id: string) =>
    data?.topics.find((t) => t.id === id)?.name ?? "Unknown topic";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="text-left">
          <SheetTitle>How value is computed</SheetTitle>
          <SheetDescription>
            Nothing here is the system&apos;s opinion. These are your bands, your
            rules, your areas — every keyword&apos;s tier is just this arithmetic,
            and your own ruling always wins.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-6">
          <Section
            icon={Scale}
            title="Value bands"
            hint="A computed score lands in one of these buckets."
          >
            {usingTemplate && (
              <Badge variant="outline" className="text-[11px] font-normal text-muted-foreground">
                Using platform defaults — this site hasn&apos;t customized its bands yet
              </Badge>
            )}
            {valueBands.length === 0 ? (
              <EmptyLine text="No value bands defined." />
            ) : (
              [...valueBands]
                .sort((a, b) => a.sort - b.sort)
                .map((b) => (
                  <div
                    key={b.value}
                    className="flex items-start gap-2 rounded-md border border-border bg-card px-3 py-2"
                  >
                    <span
                      className={cn(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        bandInfo(index, b.value).tone.dot,
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{b.label}</p>
                      {b.description && (
                        <p className="text-xs text-muted-foreground">{b.description}</p>
                      )}
                    </div>
                    {typeof b.config?.min_score === "number" && (
                      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        score ≥ {b.config.min_score as number}
                      </span>
                    )}
                  </div>
                ))
            )}
          </Section>

          {error != null ? (
            <InlineQueryError
              what="value rules, geo areas, and topic worth"
              error={error}
              onRetry={() => {
                setError(null);
                setData(null);
                setLoadKey((k) => k + 1);
              }}
            />
          ) : loading || !data ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : (
            <>
              <Section
                icon={Ruler}
                title="Value rules"
                hint="Word and fact patterns that multiply a keyword's worth up or down."
              >
                {data.rules.length === 0 ? (
                  <EmptyLine text="No value rules yet — every keyword falls straight through to topic worth." />
                ) : (
                  data.rules.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-md border border-border bg-card px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-foreground">
                          {r.name}
                        </p>
                        {r.value_multiplier !== null && (
                          <span
                            className={cn(
                              "shrink-0 text-xs font-semibold tabular-nums",
                              r.value_multiplier < 1
                                ? "text-destructive"
                                : "text-success",
                            )}
                          >
                            ×{r.value_multiplier}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {r.match_facet
                          ? `When the fact "${r.match_facet}" is "${r.match_facet_value}"`
                          : r.pattern
                            ? `When the keyword matches "${r.pattern}"`
                            : "Always"}
                      </p>
                      {r.description && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {r.description}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </Section>

              <Section
                icon={Globe2}
                title="Geo areas"
                hint="Where a searcher is looking from changes what they're worth to you."
              >
                {data.geoAreas.length === 0 ? (
                  <EmptyLine text="No geo areas defined — location isn't changing any keyword's value yet." />
                ) : (
                  data.geoAreas.map((g) => {
                    const band = data.geoBands.find((b) => b.value === g.geo_band);
                    return (
                      <div
                        key={g.id}
                        className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {g.label}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {g.area_kind}
                            {g.match_tokens.length > 0 &&
                              ` · matches ${g.match_tokens.slice(0, 4).join(", ")}${g.match_tokens.length > 4 ? "…" : ""}`}
                          </p>
                        </div>
                        <Badge variant="outline" className="shrink-0 text-[11px] font-normal">
                          {band?.label ?? g.geo_band}
                        </Badge>
                      </div>
                    );
                  })
                )}
              </Section>

              <Section
                icon={TreePine}
                title="Topic worth"
                hint="Weights you set high on the topic tree; everything beneath inherits them."
              >
                {data.topicValues.length === 0 ? (
                  <EmptyLine text="No topic worth set yet — that's why most keywords are Unvalued. Set weights on your topics to value them all at once." />
                ) : (
                  data.topicValues.map((tv) => (
                    <div
                      key={tv.id}
                      className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {topicName(tv.topic_id)}
                        </p>
                        {(tv.lead_quality || tv.service_match) && (
                          <p className="truncate text-xs text-muted-foreground">
                            {[tv.lead_quality, tv.service_match]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                        {tv.weight ?? "—"}
                      </span>
                    </div>
                  ))
                )}
              </Section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
