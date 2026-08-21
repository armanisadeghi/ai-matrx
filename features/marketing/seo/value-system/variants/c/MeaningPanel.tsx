"use client";

/**
 * "How value is computed" — the meaning that drives every number on the
 * workbench: the site's business guidelines, value bands, geo bands + areas,
 * value rules, and topic worth.
 * Read-only on purpose (this workbench rules keywords; the meaning tables
 * are governed elsewhere), but nothing here is a mystery: every section says
 * what it does in plain language, shows "using platform defaults" when the
 * site has not adopted its own rows yet, and empty sections say honestly why
 * so many keywords sit in Unvalued.
 */

import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  BookOpenCheck,
  Boxes,
  Landmark,
  ListChecks,
  MapPin,
  MapPinned,
  Pencil,
  TreePine,
} from "lucide-react";
import { cn } from "@/styles/themes/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SidePanelSurface } from "@/features/overlays/surfaces/SidePanelSurface";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  getKwGuidelines,
  kwGuidelinesQueryKey,
} from "@/features/marketing/search-console/data-kw-guidelines";
import {
  getValueVocabulary,
  listGeoAreas,
  listSiteTopicValues,
  listValueRules,
} from "../../data";
import { BandVocabularyEditor } from "../../vocabulary/BandVocabularyEditor";
import type { SiteTopicValue, TopicNode, VocabKind } from "../../types";
import { humanizeSlug, type BandMeta } from "./lib";

function SectionHeader({
  icon: Icon,
  title,
  count,
  hint,
}: {
  icon: typeof TreePine;
  title: string;
  count?: number | null;
  hint: string;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {title}
        {typeof count === "number" ? (
          <span className="font-normal text-muted-foreground">({count})</span>
        ) : null}
      </p>
      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{hint}</p>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-8 rounded-md" />
      <Skeleton className="h-8 rounded-md" />
    </div>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-border bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground">
      {children}
    </p>
  );
}

function TemplateBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Badge
      variant="outline"
      className="border-info/40 bg-info/10 text-[10px] font-normal text-info"
      title="This site has not adopted its own rows yet, so the platform starter template applies. Adopting and renaming these is the site owner's call — nothing is hardcoded."
    >
      using platform defaults
    </Badge>
  );
}

const GUARD_LABELS: Record<string, string> = {
  negative_value: "negative value",
  not_offered: "not offered",
  actively_avoided: "actively avoided",
};

function guardChips(value: SiteTopicValue) {
  const guards = [value.lead_quality, value.service_match]
    .filter((g): g is string => Boolean(g))
    .filter((g) => g in GUARD_LABELS);
  return guards.map((guard) => (
    <span
      key={guard}
      className="rounded border border-destructive/40 bg-destructive/10 px-1 py-px text-[10px] text-destructive"
      title="A guard: keywords under this topic resolve Negative regardless of arithmetic."
    >
      {GUARD_LABELS[guard]}
    </span>
  ));
}

/** The one affordance that turns this panel from a readout into a control. */
function EditVocabularyButton({
  onClick,
  isTemplate,
  noun,
}: {
  onClick: () => void;
  isTemplate: boolean;
  noun: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={onClick}
      className="h-6 shrink-0 gap-1 px-1.5 text-[10px]"
      title={
        isTemplate
          ? `Adopt the platform ${noun} and make them yours — rename them, move the thresholds, add your own.`
          : `Rename these ${noun}, move the thresholds, add or remove them.`
      }
    >
      <Pencil className="h-3 w-3" />
      {isTemplate ? "Adopt & edit" : "Edit"}
    </Button>
  );
}

export function MeaningPanel({
  siteId,
  siteDomain,
  brandId,
  window,
  bandMetas,
  bandsAreTemplate,
  onClose,
}: {
  siteId: string;
  siteDomain: string;
  /** Needed only to build the door to where guidelines are edited. */
  brandId: string | null | undefined;
  /** The GSC window the band editor measures its live impact over. */
  window: { start: string; end: string };
  bandMetas: BandMeta[];
  bandsAreTemplate: boolean;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<VocabKind | null>(null);
  // The prose doctrine every AI run for this site reads (D35). Read-only here:
  // the document is AUTHORED in the classification workbench, and two editors
  // for one document is how they drift.
  const guidelines = useQuery({
    queryKey: kwGuidelinesQueryKey(siteId),
    queryFn: ({ signal }) => getKwGuidelines(siteId, signal),
    staleTime: 5 * 60_000,
  });
  const geoBands = useQuery({
    queryKey: ["marketing", "value-c", "vocab", siteId, "geo_band"],
    queryFn: ({ signal }) => getValueVocabulary(siteId, "geo_band", signal),
    staleTime: 5 * 60_000,
  });
  const rules = useQuery({
    queryKey: ["marketing", "value-c", "rules", siteId],
    queryFn: () => listValueRules(siteId),
    staleTime: 5 * 60_000,
  });
  const geoAreas = useQuery({
    queryKey: ["marketing", "value-c", "geo-areas", siteId],
    queryFn: () => listGeoAreas(siteId),
    staleTime: 5 * 60_000,
  });
  const topicValues = useQuery({
    queryKey: ["marketing", "value-c", "topic-values", siteId],
    queryFn: () => listSiteTopicValues(siteId),
    staleTime: 5 * 60_000,
  });

  const topicById = new Map<string, TopicNode>(
    (topicValues.data?.topics ?? []).map((topic) => [topic.id, topic]),
  );

  return (
    <SidePanelSurface
      title="How value is computed"
      description="Deterministic arithmetic over meaning you ratified — never the system's opinion. Your explicit ruling always beats it."
      onClose={onClose}
      storageKey="value-workbench-c-meaning-panel"
      defaultWidth={480}
    >
      <div className="space-y-5 overflow-y-auto p-3 scrollbar-thin">
        {/* THE DOOR to industry starter packs. This panel is where the expert
            discovers the site has no meaning of its own; the pack catalogue is
            where a day-one answer comes from, so the link belongs here. */}
        <Link
          href={`${marketingRoutes.site(brandId, siteId, "/value/packs")}`}
          className="flex items-start gap-2 rounded-md border border-border bg-card px-2.5 py-2 transition-colors hover:bg-accent"
        >
          <Boxes className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block text-[11px] font-semibold text-foreground">
              Start from an industry starter pack
            </span>
            <span className="mt-0.5 block text-[10px] leading-4 text-muted-foreground">
              Topic worth, qualifier rules and band vocabularies proposed from the
              real demand of other companies in your industry. Adopt one, then prune
              it — nothing it writes is permanent.
            </span>
          </span>
        </Link>

        {/* KW business guidelines — the doctrine the AI reasons under */}
        <section className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <SectionHeader
              icon={BookOpenCheck}
              title="Business guidelines"
              hint="Prose this site's expert wrote about what it sells and who it serves. Every AI classification and valuation run for this site reads it first — it is why the model knows which terms are wrong for you."
            />
            <Link
              href={`${marketingRoutes.site(brandId, siteId, "/keywords")}?view=classification`}
              className="flex shrink-0 items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Edit the guidelines in the classification workbench — the one place this document is authored"
            >
              <Pencil className="h-3 w-3" /> Edit
            </Link>
          </div>
          {guidelines.isLoading ? <SectionSkeleton /> : null}
          {guidelines.isError ? (
            <InlineQueryError
              what="business guidelines"
              error={guidelines.error}
              onRetry={() => void guidelines.refetch()}
            />
          ) : null}
          {guidelines.data && !guidelines.data.guidelines ? (
            <EmptyLine>
              Nothing written yet — the AI values this site&apos;s keywords with
              no idea what the business actually sells. A few plain sentences
              here change every future classification run.
            </EmptyLine>
          ) : null}
          {guidelines.data?.guidelines ? (
            <div className="rounded-md border border-border bg-card px-2.5 py-2">
              <p className="max-h-56 overflow-y-auto whitespace-pre-wrap text-[11px] leading-4 text-muted-foreground scrollbar-thin">
                {guidelines.data.guidelines}
              </p>
              <p className="mt-1.5 border-t border-border pt-1 text-[10px] text-muted-foreground/80">
                v{guidelines.data.guidelines_version}
                {guidelines.data.updated_by_name
                  ? ` · last edited by ${guidelines.data.updated_by_name}`
                  : ""}
                {guidelines.data.updated_at
                  ? ` on ${new Date(guidelines.data.updated_at).toLocaleDateString()}`
                  : ""}
              </p>
            </div>
          ) : null}
        </section>

        {/* Value bands */}
        <section className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <SectionHeader
              icon={Landmark}
              title="Value bands"
              count={bandMetas.length}
              hint="Every keyword's computed score lands in one of these bands. Negative and Unvalued are reserved: the honest buckets."
            />
            <span className="flex shrink-0 items-center gap-1.5">
              <TemplateBadge show={bandsAreTemplate} />
              <EditVocabularyButton
                noun="value bands"
                isTemplate={bandsAreTemplate}
                onClick={() => setEditing("value_band")}
              />
            </span>
          </div>
          <ul className="space-y-1">
            {bandMetas.map((meta) => (
              <li
                key={meta.value}
                className="flex items-start gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
              >
                <span
                  className={cn(
                    "mt-px shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium",
                    meta.chip,
                  )}
                >
                  {meta.label}
                </span>
                <span className="min-w-0 text-[11px] leading-4 text-muted-foreground">
                  {meta.description ?? "No description yet."}
                  {meta.minScore !== null ? (
                    <span className="ml-1 tabular-nums text-foreground/70">
                      · score ≥ {meta.minScore}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Value rules */}
        <section className="space-y-2">
          <SectionHeader
            icon={ListChecks}
            title="Value rules"
            count={rules.data?.length ?? null}
            hint="Multipliers you ratified — a matched word or detected facet scales the score up or down. Every fired rule shows up in a keyword's why chain."
          />
          {rules.isLoading ? <SectionSkeleton /> : null}
          {rules.isError ? (
            <InlineQueryError
              what="value rules"
              error={rules.error}
              onRetry={() => void rules.refetch()}
            />
          ) : null}
          {rules.data && rules.data.length === 0 ? (
            <EmptyLine>
              No value rules yet. Rules like “free” ×0.2 or “certification
              seeking” ×3 are how qualifier words change what a keyword is
              worth to this business.
            </EmptyLine>
          ) : null}
          <ul className="space-y-1">
            {(rules.data ?? []).map((rule) => (
              <li
                key={rule.id}
                className="rounded-md border border-border bg-card px-2.5 py-1.5"
              >
                <p className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {rule.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums font-semibold",
                      (rule.value_multiplier ?? 1) < 1
                        ? "text-warning"
                        : "text-success",
                    )}
                  >
                    ×{rule.value_multiplier}
                  </span>
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {rule.match_facet
                    ? `Fires when ${humanizeSlug(rule.match_facet).toLowerCase()} is “${humanizeSlug(rule.match_facet_value ?? "").toLowerCase()}”`
                    : rule.pattern
                      ? `Matches “${rule.pattern}” (${humanizeSlug(rule.match_kind ?? "word").toLowerCase()})`
                      : "No match condition recorded"}
                  {rule.description ? ` — ${rule.description}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>

        {/* Geo bands + areas */}
        <section className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <SectionHeader
              icon={MapPinned}
              title="Geo bands & areas"
              count={geoAreas.data?.length ?? null}
              hint="Where a searcher is looking from decides the geo gate: your ideal radius, acceptable region, expansion targets — and excluded places, which force Negative."
            />
            <span className="flex shrink-0 items-center gap-1.5">
              <TemplateBadge show={Boolean(geoBands.data?.[0]?.is_template)} />
              <EditVocabularyButton
                noun="geo bands"
                isTemplate={Boolean(geoBands.data?.[0]?.is_template)}
                onClick={() => setEditing("geo_band")}
              />
            </span>
          </div>
          {geoBands.isError ? (
            <InlineQueryError
              what="geo bands"
              error={geoBands.error}
              onRetry={() => void geoBands.refetch()}
            />
          ) : null}
          {geoBands.data && geoBands.data.length > 0 ? (
            <p className="flex flex-wrap gap-1">
              {geoBands.data.map((band) => {
                const multiplier = band.config?.multiplier;
                return (
                  <span
                    key={band.value}
                    className="rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] text-foreground"
                    title={band.description ?? undefined}
                  >
                    {band.label}
                    {typeof multiplier === "number" ? ` ×${multiplier}` : ""}
                  </span>
                );
              })}
            </p>
          ) : null}
          {geoAreas.isLoading ? <SectionSkeleton /> : null}
          {geoAreas.isError ? (
            <InlineQueryError
              what="geo areas"
              error={geoAreas.error}
              onRetry={() => void geoAreas.refetch()}
            />
          ) : null}
          {geoAreas.data && geoAreas.data.length === 0 ? (
            <EmptyLine>
              No geo areas defined yet, so no geo gate applies. Add the places
              this business serves (and the ones it never will) to make
              location part of every keyword's worth.
            </EmptyLine>
          ) : null}
          <ul className="space-y-1">
            {(geoAreas.data ?? []).map((area) => (
              <li
                key={area.id}
                className="flex items-start gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
              >
                <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 text-[11px] leading-4">
                  <span className="font-medium text-foreground">
                    {area.label}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    ({humanizeSlug(area.area_kind).toLowerCase()}) →{" "}
                    {humanizeSlug(area.geo_band)}
                  </span>
                  {area.match_tokens.length > 0 ? (
                    <span className="block truncate text-[10px] text-muted-foreground/80">
                      matches: {area.match_tokens.join(", ")}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Topic worth */}
        <section className="space-y-2">
          <SectionHeader
            icon={TreePine}
            title="Topic worth"
            count={topicValues.data?.values.length ?? null}
            hint="The starting number: a keyword inherits the nearest ancestor topic you weighted (0–100). Set worth high on the tree and it cascades down."
          />
          {topicValues.isLoading ? <SectionSkeleton /> : null}
          {topicValues.isError ? (
            <InlineQueryError
              what="topic worth"
              error={topicValues.error}
              onRetry={() => void topicValues.refetch()}
            />
          ) : null}
          {topicValues.data && topicValues.data.values.length === 0 ? (
            <EmptyLine>
              No topic worth expressed yet — this is why keywords sit in
              Unvalued. Weighting even a handful of top-level topics values
              thousands of keywords at once.
            </EmptyLine>
          ) : null}
          <ul className="space-y-1">
            {(topicValues.data?.values ?? [])
              .slice()
              .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
              .map((value) => {
                const topic = topicById.get(value.topic_id);
                return (
                  <li
                    key={value.id}
                    className="rounded-md border border-border bg-card px-2.5 py-1.5"
                  >
                    <p className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-medium text-foreground">
                          {topic?.name ?? "Unknown topic"}
                        </span>
                        {topic ? (
                          <span className="shrink-0 rounded border border-border bg-muted/40 px-1 py-px text-[10px] text-muted-foreground">
                            {humanizeSlug(topic.node_type).toLowerCase()}
                          </span>
                        ) : null}
                        {guardChips(value)}
                      </span>
                      <span className="shrink-0 tabular-nums font-semibold text-foreground">
                        {value.weight ?? "—"}
                        <span className="font-normal text-muted-foreground">
                          /100
                        </span>
                      </span>
                    </p>
                    {value.notes ? (
                      <p className="text-[10px] text-muted-foreground">
                        {value.notes}
                      </p>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </section>
      </div>

      {editing ? (
        <BandVocabularyEditor
          siteId={siteId}
          siteDomain={siteDomain}
          kind={editing}
          window={window}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </SidePanelSurface>
  );
}
