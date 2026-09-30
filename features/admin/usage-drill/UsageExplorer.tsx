"use client";

// features/admin/usage-drill/UsageExplorer.tsx — THE USAGE PAGE AS ONE EXPLORER
// (lane DRILL-USAGE-PAGE; DRILL-DOWN-DESIGN §f, the first worked example of the semantic layer).
//
// Today's usage screens — usage by person, the Spend Explorer's cuts, cx-dashboard's model /
// provider / day — are each ONE question of the declared definition `ai_usage`, asked through the
// one read door in the platform lane. The whole screen is the question: it lives in the address
// (the drill URL grammar: `by`, `across`, `show`, `f.<dimension>` in trail order, `w`, `cmp`,
// `sort`, `share`), so every drill is one Back step and every answer is a link; a question can be
// kept as a Saved view (`platform.saved_view`, surface `drill/ai_usage`).
//
// Built side by side with the old pages (COPY mode): nothing links here but the old page's
// "Try the new usage page", and nothing of theirs changed.
//
// Money: stored in dollars, shown in CREDITS (points) — a system admin may switch to dollars
// (Arman, 2026-09-27); the choice rides the address (`unit=usd`) so a shared link reads the same.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { formatCount } from "@ai-matrx/kit/format";
import {
  MatrxDrillAnswerTable,
  MatrxDrillGroupByMenu,
  MatrxDrillMeasurePicker,
  MatrxDrillTrail,
  MatrxDrillWindowMenu,
  drillAutoGrain,
  drillWindowLabel,
  drillWindowRange,
  parseDimensionRef,
  useDrillUrlState,
  type MatrxDrillDimension,
  type MatrxDrillMeasure,
  type MatrxDrillQuestion,
} from "@ai-matrx/design-system/data-table";
import { commitUrlParams } from "@ai-matrx/kit/url-state";

import { Button } from "@/components/ui/button";
import { formatAdminPoints, formatAdminUsd } from "@/components/cost/formatAdminCost";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";

import { NAMED_DIMENSIONS, useUsageDrill } from "./useUsageDrill";
import { UsageSavedViews } from "./UsageSavedViews";

/** The first screen: everyone's spend in the last 30 days, by person, costliest first (the definition's own default). */
export const USAGE_FIRST_QUESTION: MatrxDrillQuestion = {
  by: ["person"],
  show: ["cost", "requests", "tokens_in", "tokens_out"],
  where: [],
  sort: { key: "cost", direction: "desc" },
  window: "30d",
};

type Unit = "points" | "usd";

function useUnit(): [Unit, (u: Unit) => void] {
  const params = useSearchParams();
  const unit: Unit = params.get("unit") === "usd" ? "usd" : "points";
  return [unit, (u) => commitUrlParams({ unit: u === "usd" ? "usd" : null }, "replace")];
}

const compact = (v: number | null) => (v === null ? "—" : formatCount(v, { style: "compact" } as never));

export function UsageExplorer() {
  const { organizationId, organizationState } = useOrganizationRequired();
  const userId = useAppSelector(selectUserId);
  const { question: asked, setQuestion } = useDrillUrlState({ fallback: USAGE_FIRST_QUESTION });
  const [unit, setUnit] = useUnit();

  // A time group asked with no grain (`by=at`) reads at the grain its window reads best at.
  const autoGrain = drillAutoGrain(asked.window ?? null);
  const question = useMemo<MatrxDrillQuestion>(() => {
    const withGrain = (ref: string) => (ref === "at" ? `at:${autoGrain}` : ref);
    return { ...asked, by: asked.by.map(withGrain), across: asked.across ? withGrain(asked.across) : asked.across };
  }, [asked, autoGrain]);
  const grainWasChosen = asked.by.includes("at") || asked.across === "at";

  const drill = useUsageDrill({ organizationId, userId, question });
  const { def, answers, whole, names, says, error, freshness, recount } = drill;

  const money = (v: number | null) => (v === null ? "—" : unit === "usd" ? formatAdminUsd(v) : formatAdminPoints(v));

  const dimensions = useMemo<MatrxDrillDimension[]>(() => {
    if (!def) return [];
    return def.dimensions.map((d) => {
      const dim: MatrxDrillDimension = { key: d.key, label: d.label, kind: d.kind };
      if (d.cardinality) dim.cardinality = d.cardinality;
      if (d.grains) dim.grains = d.grains.filter((g): g is NonNullable<MatrxDrillDimension["grains"]>[number] => g !== "hour");
      if ((NAMED_DIMENSIONS as readonly string[]).includes(d.key)) {
        const map = names[d.key as (typeof NAMED_DIMENSIONS)[number]];
        dim.labelFor = (value) => (value === null || value === "" ? (d.key === "person" ? "No person" : "None") : map[value] ?? `${value.slice(0, 8)}…`);
      }
      return dim;
    });
  }, [def, names]);

  const measures = useMemo<MatrxDrillMeasure[]>(() => {
    if (!def) return [];
    return def.measures.map((m) => ({
      key: m.key,
      label: m.unit === "usd" ? (unit === "usd" ? `${m.label} ($)` : `${m.label} (credits)`) : m.label,
      additive: m.additive ?? true,
      ...(m.unit === "usd" ? { format: money, lowerIsBetter: true } : m.unit === "tokens" ? { format: compact } : {}),
    }));
    // money depends on unit only
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `money` is derived from `unit`, which is listed
  }, [def, unit]);

  const total = answers["∅"]?.[0] ?? null;
  const range = drillWindowRange(question.window ?? null);
  const paths = useMemo(() => (def?.paths ?? []).map((p) => p.levels), [def]);

  if (organizationState !== "ready") {
    return <OrganizationContextNotice state={organizationState} what="AI usage" />;
  }

  const onQuestionChange = (next: MatrxDrillQuestion) => {
    // Keep `at` without a grain in the address when the person did not pick one.
    setQuestion(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-usage-explorer>
      {/* ONE header row: what this is, the total, freshness, the unit, the saved views. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="text-sm font-semibold">AI usage</h1>
          <span data-usage-total className="text-2xl font-semibold tabular-nums">
            {total ? money(total.measures.cost ?? null) : "…"}
          </span>
          <span className="text-xs text-muted-foreground">
            {drillWindowLabel(question.window ?? null)}
            {total ? ` · ${formatCount(total.measures.calls ?? 0)} calls · ${formatCount(total.measures.requests ?? 0)} requests` : ""}
          </span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span data-usage-freshness>
            {freshness.recounting
              ? "Recounting the latest hours…"
              : freshness.countedThrough
                ? `Counted through ${new Date(freshness.countedThrough).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                : null}
          </span>
          {range ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="gap-1"
              disabled={freshness.recounting}
              title="Count this window again from the ledger (at most 100 days at a time)"
              onClick={() => {
                const from = new Date(Math.max(new Date(range.from).getTime(), Date.now() - 100 * 86_400_000)).toISOString();
                void recount({ from, to: new Date().toISOString() });
              }}
            >
              <RefreshCw className="h-3 w-3" /> Recount
            </Button>
          ) : null}
          <div role="radiogroup" aria-label="Show cost in" className="inline-flex rounded-md border border-border p-0.5">
            {(["points", "usd"] as const).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={unit === u}
                data-usage-unit={u}
                onClick={() => setUnit(u)}
                className={`rounded px-2 py-0.5 ${unit === u ? "bg-muted font-medium text-foreground" : ""}`}
              >
                {u === "usd" ? "$" : "Credits"}
              </button>
            ))}
          </div>
          <UsageSavedViews organizationId={organizationId} question={asked} onOpen={setQuestion} />
          <Link href="/administration/users/usage" className="underline-offset-2 hover:underline">
            Old usage page
          </Link>
        </div>
      </div>

      {/* ONE toolbar row: the trail, then the window, the Measures and the grouping. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-1.5">
        <MatrxDrillTrail
          dimensions={dimensions}
          question={question}
          onQuestionChange={onQuestionChange}
          rootLabel="All usage"
          emptyLabel="None"
          className="min-w-0"
        />
        <div className="ml-auto flex items-center gap-0">
          <MatrxDrillWindowMenu question={question} onQuestionChange={onQuestionChange} dimensionLabel="When" />
          <MatrxDrillMeasurePicker measures={measures} question={question} onQuestionChange={onQuestionChange} />
          <MatrxDrillGroupByMenu dimensions={dimensions} question={question} onQuestionChange={onQuestionChange} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {question.by.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            Pick a way to group the usage (Group by, on the right) — by person, organization, provider, model, feature, agent, or when.
          </p>
        ) : (
          <MatrxDrillAnswerTable
            dimensions={dimensions}
            measures={measures}
            question={question}
            onQuestionChange={onQuestionChange}
            answers={answers}
            paths={paths}
            error={error}
            rowNoun="call"
            emptyLabel="None"
            exportTitle="AI usage"
            coverage={{ whole: whole?.measures.cost ?? null, measure: "cost" }}
            chart={question.show.includes("cost") ? { measure: "cost" } : undefined}
            note={
              <>
                {grainWasChosen ? <span>Shown by {autoGrain} — the grain {drillWindowLabel(question.window ?? null).toLowerCase()} reads best at. </span> : null}
                {says.map((s) => (
                  <span key={s}>{s} </span>
                ))}
                {freshness.error ? <span className="text-destructive">{freshness.error}</span> : null}
                <span>
                  The calls behind a number open in the{" "}
                  <Link href={spendHref(question)} className="underline underline-offset-2">
                    Spend Explorer
                  </Link>
                  .
                </span>
              </>
            }
          />
        )}
      </div>
    </div>
  );
}

/**
 * "See these records" for AI usage: the rollup holds no single calls, so the calls behind the
 * current trail open in the Spend Explorer, which lists them — its `f.<dimension>` filters are the
 * same grammar (person is its `user`).
 */
export function spendHref(question: MatrxDrillQuestion): string {
  const params = new URLSearchParams();
  const map: Record<string, string> = { person: "user", organization: "organization", agent: "agent", app: "app", feature: "feature", origin: "origin", trigger: "trigger", source: "source", model: "model" };
  for (const w of question.where) {
    const key = map[parseDimensionRef(w.dim).key];
    if (key) params.set(`f.${key}`, w.value ?? "(none)");
  }
  params.set("win", question.window === "7d" ? "last7d" : question.window === "24h" ? "last24h" : "last30d");
  return `/administration/billing/spend?${params.toString()}`;
}
