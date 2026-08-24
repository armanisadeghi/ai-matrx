"use client";

/**
 * THE MEANING HALF OF THE KEYWORD DOSSIER — what THIS site says this keyword
 * is, and every control that changes it.
 *
 * Before 2026-08-24 the Keyword Intelligence window (the dossier twelve
 * surfaces open) showed the 13 retired mirror facets and nothing from the
 * stamp system. This panel replaces them: Class with its source, Offering with
 * its lineage, Score + Level with the full receipt, and every dimension answer
 * with its provenance — plus the honest count of dimensions with no answer.
 *
 * NOTHING here is a second write path, and nothing here is a second copy of an
 * assignment UI: the buttons open the SAME surfaces the right-click menu opens
 * (`useKeywordAssignSurfaces` → AssignPanel / OfferingAssignPanel /
 * RulingDialog → `gsc_set_keyword_stamps` / `gsc_set_keyword_topic` /
 * `gsc_set_keyword_value`), with the same reason field (P24).
 */

import type { ReactNode } from "react";
import {
  BadgeCheck,
  CircleDollarSign,
  Gavel,
  Info,
  Loader2,
  Network,
  Tag,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { WhyScoreBody } from "@/features/marketing/seo/value-system/workbench/WhyScore";
import { humanizeSlug } from "@/features/marketing/seo/value-system/lib";

import { useKeywordMeaning } from "./keyword-meaning";
import type { KeywordAssignSurfaces, KeywordMenuRow } from "./keyword-actions";

function Field({
  label,
  children,
  action,
}: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-2 border-b border-border/60 py-1.5 last:border-b-0">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <div className="mt-0.5 min-w-0 text-xs text-foreground">{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

function NotSet({ what }: { what: string }) {
  return (
    <span className="text-muted-foreground">
      Not set — nobody has said {what} yet.
    </span>
  );
}

export interface KeywordMeaningPanelProps {
  siteId: string;
  brandId: string | null;
  keywordId: string | null;
  phrase: string;
  /** The shared assignment surfaces — the host renders `surfaces.node`. */
  surfaces: KeywordAssignSurfaces;
}

export function KeywordMeaningPanel({
  siteId,
  brandId,
  keywordId,
  phrase,
  surfaces,
}: KeywordMeaningPanelProps) {
  const meaning = useKeywordMeaning(siteId, keywordId);

  if (!keywordId) {
    return (
      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
        “{phrase}” is not in the keyword library yet, so this site has nothing
        to say about it. Run the research pipeline first — meaning is recorded
        against a library keyword.
      </div>
    );
  }

  const { value, service, stamps, unanswered } = meaning.data;
  const row: KeywordMenuRow = {
    phrase,
    keywordId,
    currentLevel: value?.value_band ?? null,
    levelIsRuling: value?.value_source === "override",
  };

  return (
    <section className="grid gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <CircleDollarSign className="h-3.5 w-3.5 text-primary" />
          What this site says this keyword is
        </h3>
        {meaning.isFetching ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {meaning.isError ? (
        <InlineQueryError
          what="this keyword's meaning"
          error={meaning.error}
          onRetry={() => void meaning.refetch()}
        />
      ) : null}

      <div className="grid gap-0">
        <Field
          label="Class"
          action={
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-1.5 text-[11px]"
              onClick={() => surfaces.openDimension(row, "traffic_class")}
            >
              <Tag className="h-3 w-3" />
              {value?.traffic_class ? "Change" : "Set"}
            </Button>
          }
        >
          {value?.traffic_class ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[11px] font-medium">
                {humanizeSlug(value.traffic_class)}
              </span>
              {value.class_source ? (
                <span className="text-[10px] text-muted-foreground">
                  decided by {humanizeSlug(value.class_source)}
                </span>
              ) : null}
            </span>
          ) : (
            <NotSet what="what kind of traffic this is" />
          )}
        </Field>

        <Field
          label="Offering"
          action={
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-1.5 text-[11px]"
              onClick={() => surfaces.openService(row)}
            >
              <Network className="h-3 w-3" />
              {service ? "Change" : "Place"}
            </Button>
          }
        >
          {service ? (
            <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
              {service.lineage ? (
                <span className="text-[10px] text-muted-foreground">
                  {service.lineage} ›
                </span>
              ) : null}
              <span className="font-medium">{service.topicName}</span>
              {service.hasOwnWorth ? (
                <span
                  className="inline-flex items-center gap-0.5 text-[10px] text-success"
                  title="This service carries its own worth ruling on this site."
                >
                  <BadgeCheck className="h-3 w-3" /> worth set here
                </span>
              ) : service.worthFromName ? (
                <span className="text-[10px] text-muted-foreground">
                  worth inherited from {service.worthFromName}
                </span>
              ) : null}
              {service.assignedBy ? (
                <span className="text-[10px] text-muted-foreground">
                  · placed by {humanizeSlug(service.assignedBy)}
                </span>
              ) : null}
            </span>
          ) : (
            <NotSet what="what you sell that this keyword is about" />
          )}
        </Field>

        <Field
          label="Score and level"
          action={
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 px-1.5 text-[11px]"
              disabled={surfaces.busy}
              onClick={() => surfaces.openLevel(row)}
            >
              <Gavel className="h-3 w-3" />
              {value?.value_source === "override" ? "Change" : "Pin a level"}
            </Button>
          }
        >
          <span className="inline-flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">
              {value?.value_band ? humanizeSlug(value.value_band) : "Unvalued"}
            </span>
            <span className="tabular-nums text-muted-foreground">
              {value?.value_score === null || value?.value_score === undefined
                ? "no score"
                : `score ${Math.round(Number(value.value_score)).toLocaleString()}`}
            </span>
            <span
              className={cn(
                "rounded border px-1.5 py-px text-[10px]",
                value?.value_source === "override"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-muted/40 text-muted-foreground",
              )}
            >
              {value?.value_source === "override"
                ? "Your ruling"
                : value?.value_source === "computed"
                  ? "Computed"
                  : "Unvalued"}
            </span>
          </span>
        </Field>
      </div>

      {/* THE RECEIPT — a level never renders without its why (value-system.md).
          The full form belongs HERE because this is the detail surface; the
          (i)-in-a-cell form is for tables (P26). */}
      <div className="rounded-md border border-border bg-muted/20 p-2">
        <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Info className="h-3 w-3" /> Why this level
        </p>
        <WhyScoreBody
          subject={{
            keywordId,
            keyword: phrase,
            valueBand: value?.value_band ?? null,
            valueScore: value?.value_score ?? null,
            valueSource: value?.value_source ?? null,
            reasons: value?.reasons ?? [],
          }}
          context={{ siteId, brandId, keyword: phrase }}
        />
      </div>

      {/* EVERY DIMENSION ANSWER, with provenance — the stamp system's own view
          of this keyword, which is what replaced the 13 mirror facets. */}
      <div>
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Dimension answers
        </p>
        {stamps.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No dimension carries an answer for this keyword yet.
          </p>
        ) : (
          <ul className="grid gap-1">
            {stamps.map((stamp) => (
              <li
                key={stamp.dimension}
                className="flex flex-wrap items-baseline gap-x-1.5 text-xs"
              >
                <span className="text-muted-foreground">
                  {stamp.dimensionLabel}:
                </span>
                <span className="font-medium text-foreground">
                  {stamp.valueLabel}
                </span>
                <span
                  className={cn(
                    "rounded border px-1 py-px text-[10px]",
                    stamp.pinned
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-muted/40 text-muted-foreground",
                  )}
                  title={
                    stamp.pinned
                      ? "A person decided this. It beats every machine signal."
                      : "Recorded by a rule or an agent — yours would beat it."
                  }
                >
                  {stamp.pinned ? "yours" : humanizeSlug(stamp.source)}
                </span>
                {stamp.notes ? (
                  <span className="text-[10px] text-muted-foreground">
                    — {stamp.notes}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-6 gap-1 px-1.5 text-[11px]"
            onClick={() => surfaces.openDimension(row)}
          >
            <Tag className="h-3 w-3" />
            Answer a dimension…
          </Button>
          {unanswered.length > 0 ? (
            <span
              className="text-[10px] text-muted-foreground"
              title={unanswered.map((d) => d.label).join(", ")}
            >
              {unanswered.length} unanswered
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
