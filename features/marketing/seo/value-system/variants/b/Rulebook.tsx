"use client";

/**
 * The rulebook — the meaning that drives every computed number: value bands,
 * value rules, geo areas, and topic worth. Read-only here (authoring lives in
 * its own flows); this sheet exists so no number on the ledger is ever
 * mysterious. Empty sections say plainly what would change if they were filled.
 */

import {
  BookOpenText,
  Landmark,
  ListChecks,
  MapPin,
  Network,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { CardLoading } from "@/components/matrx/LoadingComponents";
import type { ValueBandDef } from "../../types";
import { NON_OFFERING_ROOT_TYPES } from "../../types";
import { bandColorClasses } from "./lib";
import {
  useGeoAreas,
  useTopicWorth,
  useValueRules,
  useValueVocabulary,
} from "./useLedgerData";

function Section({
  icon: Icon,
  title,
  blurb,
  children,
}: {
  icon: typeof Landmark;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{blurb}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
      {children}
    </p>
  );
}

export function Rulebook({
  siteId,
  open,
  onOpenChange,
  bandVocab,
}: {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bandVocab: ValueBandDef[];
}) {
  const geoVocab = useValueVocabulary(siteId, "geo_band");
  const rules = useValueRules(siteId);
  const geoAreas = useGeoAreas(siteId);
  const topicWorth = useTopicWorth(siteId);

  const bandsFromTemplate = bandVocab.some((b) => b.is_template);
  const topicById = new Map(
    (topicWorth.data?.topics ?? []).map((t) => [t.id, t]),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <BookOpenText className="h-4 w-4" />
            The rulebook
          </SheetTitle>
          <SheetDescription>
            Every computed value on this page comes from what&apos;s written here —
            nothing else, and never a guess. Change the rulebook and every
            keyword recomputes the same way, every time.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {/* Value bands */}
          <Section
            icon={Landmark}
            title="Value bands"
            blurb="The shelves keywords are sorted onto — what a click can be worth."
          >
            {bandVocab.length === 0 ? (
              <EmptyNote>No value bands are defined yet.</EmptyNote>
            ) : (
              <ul className="space-y-1.5">
                {bandVocab.map((b) => {
                  const color = bandColorClasses(b.value, bandVocab);
                  return (
                    <li key={b.value} className="flex items-start gap-2.5">
                      <span
                        className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${color.swatch}`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {b.label}
                        </p>
                        {b.description && (
                          <p className="text-xs text-muted-foreground">
                            {b.description}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {bandsFromTemplate && (
              <p className="mt-2 text-[11px] font-medium text-warning">
                Using the platform&apos;s default bands — this site hasn&apos;t defined
                its own yet.
              </p>
            )}
          </Section>

          {/* Value rules */}
          <Section
            icon={ListChecks}
            title="Value rules"
            blurb="Words and signals that raise or lower a keyword's worth — each one multiplies the score."
          >
            {rules.isLoading ? (
              <CardLoading />
            ) : rules.isError ? (
              <InlineQueryError
                what="value rules"
                error={rules.error}
                onRetry={() => void rules.refetch()}
              />
            ) : (rules.data ?? []).length === 0 ? (
              <EmptyNote>
                No value rules yet. A rule like “searches containing <em>free</em>{" "}
                count for a fifth” would apply to every matching keyword,
                automatically and identically.
              </EmptyNote>
            ) : (
              <ul className="space-y-2">
                {(rules.data ?? []).map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-border bg-muted/30 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-foreground">
                        {r.name}
                      </p>
                      {r.value_multiplier !== null && (
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-xs font-semibold ${
                            r.value_multiplier > 1
                              ? "bg-success/10 text-success"
                              : r.value_multiplier < 1
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          ×{r.value_multiplier}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {r.match_facet
                        ? `When the search reads as ${r.match_facet.replace(/_/g, " ")}: ${r.match_facet_value?.replace(/_/g, " ") ?? ""}`
                        : r.pattern
                          ? `When the keyword matches “${r.pattern}”`
                          : (r.description ?? "")}
                      {r.target_class && ` · also files it under ${r.target_class}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Geo areas */}
          <Section
            icon={MapPin}
            title="Where customers come from"
            blurb="Your service areas, each mapped to a geo band — searches from outside the map are worth less, or nothing."
          >
            {geoAreas.isLoading ? (
              <CardLoading />
            ) : geoAreas.isError ? (
              <InlineQueryError
                what="geo areas"
                error={geoAreas.error}
                onRetry={() => void geoAreas.refetch()}
              />
            ) : (geoAreas.data ?? []).length === 0 ? (
              <EmptyNote>
                No service areas defined. Right now location plays no part in any
                keyword&apos;s value — define areas and searches like “near me in
                the wrong city” stop counting as wins.
              </EmptyNote>
            ) : (
              <ul className="space-y-1.5">
                {(geoAreas.data ?? []).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {a.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.area_kind}
                        {a.match_tokens.length > 0 &&
                          ` · matches ${a.match_tokens.slice(0, 4).join(", ")}${a.match_tokens.length > 4 ? "…" : ""}`}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      {geoVocab.data?.find((g) => g.value === a.geo_band)?.label ??
                        a.geo_band}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {/* Topic worth */}
          <Section
            icon={Network}
            title="What your topics are worth"
            blurb="Worth set on a topic flows down to every keyword under it — the base every computation starts from."
          >
            {topicWorth.isLoading ? (
              <CardLoading />
            ) : topicWorth.isError ? (
              <InlineQueryError
                what="topic worth"
                error={topicWorth.error}
                onRetry={() => void topicWorth.refetch()}
              />
            ) : (topicWorth.data?.values ?? []).length === 0 ? (
              <EmptyNote>
                No topic has a worth yet — that&apos;s why most keywords sit in
                Unvalued. Rate a handful of your core topics and thousands of
                keywords get a value at once.
              </EmptyNote>
            ) : (
              <ul className="space-y-1.5">
                {(topicWorth.data?.values ?? []).map((v) => {
                  const topic = topicById.get(v.topic_id);
                  const nonOffering =
                    topic &&
                    (NON_OFFERING_ROOT_TYPES as readonly string[]).includes(
                      topic.node_type,
                    );
                  return (
                    <li key={v.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {topic?.name ?? "Unknown topic"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {v.service_match &&
                            v.service_match.replace(/_/g, " ")}
                          {v.lead_quality &&
                            ` · leads: ${v.lead_quality.replace(/_/g, " ")}`}
                          {nonOffering &&
                            " · tracked value, never sold as growth"}
                          {v.notes && ` · ${v.notes}`}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
                        {v.weight ?? "—"}
                        <span className="text-xs font-normal text-muted-foreground">
                          /100
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
