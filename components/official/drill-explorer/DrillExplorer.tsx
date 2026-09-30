"use client";

// components/official/drill-explorer/DrillExplorer.tsx — ONE EXPLORER SCREEN FOR EVERY DECLARED
// DRILL DEFINITION (lane DRILL-EXPLORER; program DRILL-FINISH decision 9, generalized from the
// usage page's UsageExplorer, lane DRILL-USAGE-PAGE).
//
// The whole screen is ONE question of one definition, asked through the one read door
// (`platform.drill_describe` / `drill_ask` / `drill_rows`) in the host's lane. The question lives
// in the address (the drill URL grammar: `by`, `across`, `show`, `f.<dimension>` in trail order,
// `w`, `cmp`, `sort`, `share`), so every drill is one Back step and every answer is a link.
//
//   header row   the name, the headline total with the window, freshness (the door's `as_of`, or
//                the host's own count), Recount when the host offers it, the credits/$ switch, the
//                Saved views (built-in first, then the person's own), the host's extras
//   toolbar row  the trail, then the window, the Measures, Group by and — when the definition
//                declares them — the findings
//   body         the grouped answer; with no grouping, the records (`drill_rows`) when the
//                definition declares them, else the host's link to where they live
//
// Money: every Measure with unit "usd" is stored in dollars and shown in CREDITS — a system admin
// may switch to dollars (Arman, 2026-09-27) with the platform's one switch, offered here too.
// Usage, CX usage, KG cost and workflow runs are mounts of this screen.

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { POINTS_PER_USD, formatCount } from "@ai-matrx/kit/format";
import {
  MatrxDrillAnswerTable,
  MatrxDrillGroupByMenu,
  MatrxDrillMeasurePicker,
  MatrxDrillTrail,
  MatrxDrillWindowMenu,
  drillWindowLabel,
  addressHasDrill,
  parseDimensionRef,
  useDrillUrlState,
  type MatrxDrillDimension,
  type MatrxDrillMeasure,
  type MatrxDrillQuestion,
} from "@ai-matrx/design-system/data-table";

import AppLink from "@/components/navigation/AppLink";
import { Button } from "@/components/ui/button";
import { formatAdminPoints, formatAdminUsd } from "@/components/cost/formatAdminCost";
import { selectCanToggleCostUnit, selectCostUnit } from "@/components/cost/costUnit";
import { knobNumber } from "@/lib/knobs/featureKnobs";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setModulePreferences } from "@/lib/redux/preferences/userPreferencesSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

import { DrillExplainButton } from "./DrillExplainButton";
import { DrillFindings } from "./DrillFindings";
import { DrillRecords } from "./DrillRecords";
import { DrillSavedViews } from "./DrillSavedViews";
import { drillSavedViewSurface } from "./savedViews";
import { explorerWindowLabel, explorerWindowRange, useDrillExplorer } from "./useDrillExplorer";
import { DrillExplorerHeadline, costColumnLabel } from "./DrillExplorerHeadline";
import { carriedWords, splitExplorerQuestion, type DrillCarried, type ExplorerQuestion } from "./questionParts";
import { apportionAnswers, roundMoneyRow } from "./apportion";
import { drillExplorerAutoGrain, withAutoGrain } from "./grain";
import {
  builtInViewsOf,
  explorerQuestionOf,
  findingsOf,
  recordsOf,
  staleAfterKnobOf,
  type DrillExplorerProps,
} from "./types";

type Unit = "points" | "usd";

/**
 * THE ONE COST-UNIT SWITCH (Arman, 2026-09-27: credits for everyone, a system admin may switch to
 * dollars): the same synced preference the header menu's "Show costs in dollars" flips
 * (`userPreferences.system.showCostInUsd`, read through `selectCostUnit`), so the explorer and
 * every `<Cost>` elsewhere always agree. Offered only to someone who may flip it.
 */
function useUnit(): { unit: Unit; canToggle: boolean; setUnit: (u: Unit) => void } {
  const dispatch = useAppDispatch();
  const unit = useAppSelector(selectCostUnit);
  const canToggle = useAppSelector(selectCanToggleCostUnit);
  return {
    unit,
    canToggle,
    setUnit: (u) => dispatch(setModulePreferences({ module: "system", preferences: { showCostInUsd: u === "usd" } })),
  };
}

/** A feature knob named `<feature>.<key…>` (the contract's `stale_after_knob`), read in minutes. */
function useStaleAfterMinutes(knob: string | null): { minutes: number | null; problem: string | null } {
  const [held, setHeld] = useState<{ knob: string | null; minutes: number | null; problem: string | null }>({ knob: null, minutes: null, problem: null });
  useEffect(() => {
    if (!knob) return;
    const dot = knob.indexOf(".");
    const feature = dot > 0 ? knob.slice(0, dot) : knob;
    const key = dot > 0 ? knob.slice(dot + 1) : "";
    let cancelled = false;
    knobNumber(feature, key).then(
      (minutes) => !cancelled && setHeld({ knob, minutes, problem: null }),
      (e: unknown) => !cancelled && setHeld({ knob, minutes: null, problem: `How old an answer may be before this screen says so could not be read (knob ${knob}: ${e instanceof Error ? e.message : String(e)}).` }),
    );
    return () => {
      cancelled = true;
    };
  }, [knob]);
  return held.knob === knob ? { minutes: held.minutes, problem: held.problem } : { minutes: null, problem: null };
}

const EMPTY_QUESTION: MatrxDrillQuestion = { by: [], show: [], where: [] };
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function DrillExplorer({
  source,
  lane,
  organizationId,
  title,
  rootLabel,
  firstQuestion,
  names: resolvers,
  headline,
  freshness,
  recordsLink,
  rowNoun = "record",
  hideGrains = [],
  headerExtras,
  dataAttributes,
  words,
  countMeasure,
  windowAlign,
}: DrillExplorerProps) {
  const userId = useAppSelector(selectUserId);
  const { unit, canToggle, setUnit } = useUnit();

  // The first screen: the host's, else the definition's own default (read once describe answers).
  const [definitionDefault, setDefinitionDefault] = useState<MatrxDrillQuestion | null>(null);
  const { question: asked, setQuestion } = useDrillUrlState({ fallback: firstQuestion ?? definitionDefault ?? EMPTY_QUESTION });
  // WHAT THE OPEN VIEW ASKS BEYOND THE ADDRESS (VERIFY-DRILL-WAVE1 F3): a declared view's list and
  // range filters, group limit and thresholds ride beside the address question — asked with every
  // request and said on screen — until another view opens or the person drops them.
  const [carried, setCarried] = useState<DrillCarried | null>(null);
  const openQuestion = (next: ExplorerQuestion) => {
    const { question: q, door } = splitExplorerQuestion(next);
    setCarried(door);
    setQuestion(q);
  };

  // The hook asks exactly what the table draws: the address question with the auto grain applied.
  const drill = useDrillExplorer({ source, lane, organizationId, userId, question: asked, names: resolvers, version: freshness?.version, countMeasure, windowAlign, carried });
  const { def, answers: rawAnswers, whole: rawWhole, names, says, error, asOf, client } = drill;
  if (!firstQuestion && def && !definitionDefault) {
    const { question: q, door } = splitExplorerQuestion(explorerQuestionOf(def.default));
    setDefinitionDefault(q);
    // the default's own filters hold only while the screen IS the default (the address asks nothing)
    if (door && typeof window !== "undefined" && !addressHasDrill(new URLSearchParams(window.location.search))) setCarried(door);
  }

  const autoGrain = drillExplorerAutoGrain(asked.window ?? null);
  const question = withAutoGrain(def, asked);
  const timeKeys = new Set((def?.dimensions ?? []).filter((d) => d.kind === "time").map((d) => d.key));
  const grainWasChosen = [...asked.by, ...(asked.across ? [asked.across] : [])].some((ref) => timeKeys.has(ref));

  const money = (v: number | null) => (v === null ? "—" : unit === "usd" ? formatAdminUsd(v) : formatAdminPoints(v));
  const compact = (v: number | null) => formatCount(v, { style: "compact" });

  const dimensions: MatrxDrillDimension[] = (def?.dimensions ?? []).map((d) => {
    const dim: MatrxDrillDimension = { key: d.key, label: d.label, kind: d.kind };
    if (d.cardinality) dim.cardinality = d.cardinality;
    if (d.grains) dim.grains = d.grains.filter((g): g is NonNullable<MatrxDrillDimension["grains"]>[number] => g !== "hour" && !hideGrains.includes(g));
    // KEYS NEVER REACH A PERSON (VERIFIER-32 F5): an id reads as its name (or the resolver's words
    // while it is read), a code as the host's plain words — never the id or the code itself.
    const resolver = resolvers?.[d.key];
    const said = words?.[d.key];
    if (resolver) {
      const map = names[d.key] ?? {};
      dim.labelFor = (value) =>
        value === null || value === "" ? (resolver.emptyLabel ?? "None") : map[value] ?? (said ? said(value) : (resolver.missingLabel ?? "Reading the name…"));
    } else if (said) {
      dim.labelFor = (value) => (value === null || value === "" ? said("") : said(value));
    }
    return dim;
  });

  const measures: MatrxDrillMeasure[] = (def?.measures ?? []).map((m) => ({
    key: m.key,
    // The column's unit word is the one its cells print (VERIFY-DRILL-WAVE1 F9): the platform's cost
    // formatter says "points" today, so the column does too.
    label: m.unit === "usd" ? costColumnLabel(m.label, unit) : m.label,
    additive: m.additive ?? true,
    ...(m.unit === "usd" ? { format: money, lowerIsBetter: true } : m.unit === "tokens" ? { format: compact } : {}),
  }));
  const hasMoney = (def?.measures ?? []).some((m) => m.unit === "usd");
  const headlineKey = headline?.measure ?? (def?.measures ?? []).find((m) => m.unit === "usd")?.key ?? question.show[0] ?? null;
  const headlineMeasure = measures.find((m) => m.key === headlineKey);
  const fmt = (key: string | null, v: number | null | undefined) => {
    if (v === null || v === undefined) return "—";
    const m = measures.find((x) => x.key === key);
    return m?.format ? m.format(v) : formatCount(v);
  };

  // ROWS ADD UP TO THE TOTAL SHOWN (VERIFIER-32 F6): money is rounded once, at the total, and every
  // level splits its parent's rounded amount by largest remainder.
  const toUnits = (usd: number) => (unit === "usd" ? usd * 100 : usd * POINTS_PER_USD);
  const fromUnits = (u: number) => (unit === "usd" ? u / 100 : u / POINTS_PER_USD);
  const moneyKeys = (def?.measures ?? []).filter((m) => m.unit === "usd").map((m) => m.key);
  const answers = moneyKeys
    .filter((key) => question.show.includes(key))
    .reduce((held, key) => apportionAnswers(held, question, key, toUnits, fromUnits), rawAnswers);
  // ONE ROUNDING RULE (VERIFY-DRILL-WAVE1 F5): the whole the coverage line names is rounded exactly
  // as the header's total is (to the nearest whole credit or cent), never by the formatter's ceiling.
  const whole = rawWhole ? roundMoneyRow(rawWhole, moneyKeys, toUnits, fromUnits) : null;
  const total = answers["∅"]?.[0] ?? null;
  const range = explorerWindowRange(question.window ?? null, windowAlign);
  const paths = (def?.paths ?? []).map((p) => p.levels);
  const builtIn = builtInViewsOf(def);
  const findings = findingsOf(def);
  const records = recordsOf(def);
  const stale = useStaleAfterMinutes(staleAfterKnobOf(def));

  // FRESHNESS: the door's own `as_of` when the answers carry it; the host's count until then.
  const countedThrough = asOf ?? freshness?.countedThrough ?? null;
  const behind =
    asOf && stale.minutes !== null && Date.now() - new Date(asOf).getTime() > stale.minutes * 60_000
      ? `The schedule is behind: counted through ${time(asOf)}.`
      : null;

  const emptyLabel = "None";
  const windowWords = explorerWindowLabel(question.window ?? null, drillWindowLabel);
  const labelOfKey = (key: string) =>
    dimensions.find((d) => d.key === parseDimensionRef(key).key)?.label ?? measures.find((m) => m.key === key)?.label ?? key;
  const carriedSaid = carriedWords(carried, labelOfKey);
  const dimensionWords = dimensions.map((d) => d.label.toLowerCase());

  return (
    <div className="flex h-full min-h-0 flex-col" data-drill-explorer {...dataAttributes}>
      {/* ONE header row: what this is, the total, freshness, the unit, the saved views. */}
      <div data-drill-explorer-header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-4 py-2">
        <DrillExplorerHeadline
          title={title}
          total={total && headlineKey ? fmt(headlineKey, total.measures[headlineKey]) : "…"}
          facts={[
            { key: "window", content: windowWords },
            ...(windowAlign === "hour" && range
              ? [
                  {
                    key: "from",
                    title: "Counted in whole hours: the window starts on the hour",
                    attrs: { "data-drill-explorer-window-start": "" },
                    content: `from ${new Date(range.from).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`,
                  },
                ]
              : []),
            ...(headline?.also ?? []).flatMap((key) => {
              const v = total?.measures[key];
              if (v === null || v === undefined) return [];
              const label = (def?.measures ?? []).find((m) => m.key === key)?.label.toLowerCase() ?? key;
              return [{ key: `also:${key}`, content: `${formatCount(v)} ${label}` }];
            }),
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span data-drill-explorer-freshness>
            {freshness?.recounting ? "Recounting the latest hours…" : countedThrough ? `Counted through ${time(countedThrough)}` : null}
          </span>
          {range && freshness?.recount ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="gap-1"
              disabled={freshness.recounting}
              title={freshness.recountTitle ?? "Count this window again"}
              onClick={() => freshness.recount?.({ from: range.from, to: new Date().toISOString() })}
            >
              <RefreshCw className="h-3 w-3" /> Recount
            </Button>
          ) : null}
          {canToggle && hasMoney ? (
            <div role="radiogroup" aria-label="Show cost in" className="inline-flex rounded-md border border-border p-0.5">
              {(["points", "usd"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={unit === u}
                  data-drill-explorer-unit={u}
                  onClick={() => setUnit(u)}
                  className={`rounded px-2 py-0.5 ${unit === u ? "bg-muted font-medium text-foreground" : ""}`}
                >
                  {u === "usd" ? "$" : "Credits"}
                </button>
              ))}
            </div>
          ) : null}
          {def ? <DrillSavedViews surfaceKey={drillSavedViewSurface(def.key)} homeOrganizationId={lane === "platform" ? organizationId : null} builtIn={builtIn} question={carried ? { ...asked, door: carried } : asked} onOpen={openQuestion} /> : null}
          {def && question.by.length > 0 ? (
            <DrillExplainButton
              input={{
                title,
                location: title,
                definitionKey: def.key,
                rootLabel,
                dimensions,
                measures,
                measureUnits: Object.fromEntries((def.measures ?? []).map((m) => [m.key, m.unit])),
                question,
                answers,
                whole,
                headlineKey,
                moneyUnit: unit === "usd" ? "dollars" : "points",
                range,
                asOf: countedThrough,
                says,
                address: null,
                rowNoun,
                emptyLabel,
              }}
            />
          ) : null}
          {headerExtras}
        </div>
      </div>

      {/* ONE toolbar row: the trail, then the window, the Measures, the grouping and the findings. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-1.5">
        <MatrxDrillTrail dimensions={dimensions} question={question} onQuestionChange={setQuestion} rootLabel={rootLabel} emptyLabel={emptyLabel} className="min-w-0" />
        <div className="ml-auto flex items-center gap-0">
          <MatrxDrillWindowMenu question={question} onQuestionChange={setQuestion} dimensionLabel="When" />
          <MatrxDrillMeasurePicker measures={measures} question={question} onQuestionChange={setQuestion} />
          <MatrxDrillGroupByMenu dimensions={dimensions} question={question} onQuestionChange={setQuestion} />
          {findings.length > 0 ? (
            <DrillFindings
              client={client}
              source={source}
              lane={lane}
              findings={findings}
              question={question}
              dimensions={dimensions}
              measures={measures}
              paths={paths}
              emptyLabel={emptyLabel}
              onOpen={openQuestion}
            />
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {question.by.length === 0 ? (
          def && records ? (
            <DrillRecords client={client} source={source} lane={lane} def={def} records={records} question={question} names={names} formatUsd={money} rowNoun={rowNoun} carried={carried} />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">
              Pick a way to group (Group by, on the right){dimensionWords.length > 0 ? ` — by ${dimensionWords.slice(0, -1).join(", ")}${dimensionWords.length > 1 ? ", or " : ""}${dimensionWords.at(-1)}` : ""}.
              {recordsLink ? (
                <>
                  {" "}
                  {typeof recordsLink.lead === "function" ? recordsLink.lead(question) : recordsLink.lead}{" "}
                  <AppLink href={recordsLink.href(question)} className="underline underline-offset-2">
                    {recordsLink.label}
                  </AppLink>
                  .
                </>
              ) : null}
            </p>
          )
        ) : (
          <>
            {/* The answer's own sentences, one line above it. After @ai-matrx/design-system 0.49.38+
                is installed this line moves into the table's `note` (PROGRESS-DRILL-EXPLORER "After publish"). */}
            <p data-drill-explorer-note className="px-4 py-1 text-xs text-muted-foreground">
              {grainWasChosen ? <span>Shown by {autoGrain} — the grain {windowWords.toLowerCase()} reads best at. </span> : null}
              {question.where.length > 0 && headlineKey && whole?.measures[headlineKey] != null && total?.measures[headlineKey] != null ? (
                <span data-drill-explorer-coverage>
                  This slice is {fmt(headlineKey, total.measures[headlineKey])} of the {fmt(headlineKey, whole.measures[headlineKey])} the whole window holds
                  {whole.measures[headlineKey]! > 0 ? ` (${Math.round((total.measures[headlineKey]! / whole.measures[headlineKey]!) * 100)}%)` : ""}.{" "}
                </span>
              ) : null}
              {carriedSaid.kept || carriedSaid.leftOut ? (
                <span data-drill-explorer-carried>
                  {carriedSaid.kept ? `${carriedSaid.kept} ` : null}
                  {carriedSaid.leftOut ? `${carriedSaid.leftOut} ` : null}
                  <button type="button" data-drill-explorer-carried-drop className="underline underline-offset-2" onClick={() => setCarried(null)}>
                    Show the answer without them
                  </button>{" "}
                </span>
              ) : null}
              {behind ? <span className="text-destructive">{behind} </span> : null}
              {stale.problem ? <span className="text-destructive">{stale.problem} </span> : null}
              {says.map((s) => (
                <span key={s}>{s} </span>
              ))}
              {freshness?.error ? <span className="text-destructive">{freshness.error} </span> : null}
              {!records && recordsLink ? (
                <span>
                  {typeof recordsLink.lead === "function" ? recordsLink.lead(question) : recordsLink.lead}{" "}
                  <AppLink href={recordsLink.href(question)} className="underline underline-offset-2">
                    {recordsLink.label}
                  </AppLink>
                  .
                </span>
              ) : null}
            </p>
            {/* THE PHONE (VERIFIER-32 F4): the group's words give way to the numbers — its label is
                capped and its count line hidden under 640 px, so the money column is on screen. */}
            <div className="max-sm:[&_[data-matrx-drill-answer]_td>div]:max-w-[42vw] max-sm:[&_[data-matrx-drill-answer]_td>div]:overflow-hidden max-sm:[&_[data-matrx-drill-answer]_td>div>span.whitespace-nowrap]:hidden">
            <MatrxDrillAnswerTable
              dimensions={dimensions}
              measures={measures}
              question={question}
              onQuestionChange={setQuestion}
              answers={answers}
              paths={paths}
              error={error}
              rowNoun={rowNoun}
              emptyLabel={emptyLabel}
            />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The Dimension key of a reference (`at:day` → `at`), for hosts mapping crumbs to other screens. */
export function drillDimensionKey(ref: string): string {
  return parseDimensionRef(ref).key;
}
