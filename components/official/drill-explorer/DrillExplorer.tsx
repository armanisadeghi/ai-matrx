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
// may switch to dollars (Arman, 2026-09-27) with the platform's one switch, offered here too. Every
// other unit the contract carries (tokens, count, ms, share, times…) is formatted by its unit
// (`measureFormat.ts`), and every value is rounded on its own — a value reads the same wherever it
// appears (owner ruling, 2026-09-30). Codes and ids read as the definition's and the door's words
// (`dimensionWords.ts`), never a mount's copy of them.
// Usage, CX usage, KG cost and workflow runs are mounts of this screen.
//
// Since lane DRILL-ADOPT (design-system 0.49.40+): the stacked chart (`MatrxDrillChart`, split = the
// first non-time grouping, bars at the auto grain, click a segment to drill, a period to narrow) sits
// above the answer; the answer draws the Pareto line, row actions (Copy / Copy for AI, ticks), export,
// coverage and its note itself; the window menu's presets (All time, Today, Yesterday, … Custom range)
// are the package's; every line (chart Top N, Pareto share, pivot columns, auto-grain) is a knob
// (`useDrillKnobs`). An open Saved view is named in the address (`view=`), so its link reopens it
// whole and Explain this hands its conditions over.

import { useEffect, useState } from "react";
import { MatrxDrillChart } from "@ai-matrx/design-system/data-table/drill-chart";
import { RefreshCw } from "lucide-react";
import { formatCount } from "@ai-matrx/kit/format";
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
import { selectCanToggleCostUnit, selectCostUnit } from "@/components/cost/costUnit";
import { knobNumber } from "@/lib/knobs/featureKnobs";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setModulePreferences } from "@/lib/redux/preferences/userPreferencesSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

import { DrillExplainButton } from "./DrillExplainButton";
import { DrillFindings } from "./DrillFindings";
import { DrillRecords } from "./DrillRecords";
import { DrillSavedViews, type DrillOpenView } from "./DrillSavedViews";
import { drillSavedViewSurface, readDrillView } from "./savedViews";
import { explorerWindowRange, useDrillExplorer } from "./useDrillExplorer";
import { useDrillKnobs } from "./useDrillKnobs";
import { useDrillChart } from "./useDrillChart";
import { drillReconcileSentence, useDrillReconcile } from "./useDrillReconcile";
import { DrillExplorerHeadline, costColumnLabel } from "./DrillExplorerHeadline";
import { carriedWords, splitExplorerQuestion, viewQuestionFromAddress, type DrillCarried, type ExplorerQuestion } from "./questionParts";
import { drillUnitAdds, drillUnitFormatter } from "./measureFormat";
import { drillDimensionLabelFor } from "./dimensionWords";
import { autoTimeRef, drillExplorerAutoGrain, withAutoGrain } from "./grain";
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

/**
 * A feature knob named `<feature>.<key>` (the contract's `stale_after_knob`), read in minutes. The key
 * is the part after the LAST dot: `drill.usage.stale_after_minutes` is feature `drill.usage`, key
 * `stale_after_minutes` (the row's own split; the first dot read "drill" / "usage.stale_after_minutes"
 * and said the setting was missing — lane DRILL-PRESETS-RETIRE walk, 2026-09-30).
 */
export function staleKnobAddress(knob: string): { feature: string; key: string } {
  const dot = knob.lastIndexOf(".");
  return dot > 0 ? { feature: knob.slice(0, dot), key: knob.slice(dot + 1) } : { feature: knob, key: "" };
}
function useStaleAfterMinutes(knob: string | null): { minutes: number | null; problem: string | null } {
  const [held, setHeld] = useState<{ knob: string | null; minutes: number | null; problem: string | null }>({ knob: null, minutes: null, problem: null });
  useEffect(() => {
    if (!knob) return;
    const { feature, key } = staleKnobAddress(knob);
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
/** The address parameter naming the open Saved view (`builtin:<key>` or a saved row's id). */
export const DRILL_VIEW_PARAM = "view";

/** Put (or take out) the open view's name in the address, without a history step of its own. */
function writeViewParam(ref: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (ref) url.searchParams.set(DRILL_VIEW_PARAM, ref);
  else url.searchParams.delete(DRILL_VIEW_PARAM);
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.href);
}
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
  headerExtras,
  dataAttributes,
  words,
  countMeasure,
  windowAlign,
  mineScope,
  openRecord,
  reconcile,
  location,
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
  // WHICH VIEW IS OPEN (VERIFY-DRILL-WAVE2 W2-1): named in the address, so the link reopens the view
  // whole (what it carries included) and Explain this tells a model exactly what was answered.
  const [openView, setOpenView] = useState<DrillOpenView | null>(null);
  const openQuestion = (next: ExplorerQuestion, view?: DrillOpenView) => {
    const { question: q, door } = splitExplorerQuestion(next);
    setCarried(door);
    setOpenView(view ?? null);
    writeViewParam(view?.ref ?? null);
    setQuestion(q);
  };
  const dropCarried = () => {
    setCarried(null);
    setOpenView(null);
    writeViewParam(null);
  };

  const knobs = useDrillKnobs();
  // The hook asks exactly what the table draws: the address question with the auto grain applied.
  const drill = useDrillExplorer({ source, lane, organizationId, userId, question: asked, names: resolvers, version: freshness?.version, countMeasure, windowAlign, carried, headlineAlso: headline?.also, grainLines: knobs.grainLines, ready: knobs.settled });
  const { def, answers: rawAnswers, whole: rawWhole, names, says, error, asOf, client } = drill;
  if (!firstQuestion && def && !definitionDefault) {
    const { question: q, door } = def.default ? splitExplorerQuestion(explorerQuestionOf(def.default)) : { question: EMPTY_QUESTION, door: null };
    setDefinitionDefault(q);
    // the default's own filters hold only while the screen IS the default (the address asks nothing)
    if (door && typeof window !== "undefined" && !addressHasDrill(new URLSearchParams(window.location.search))) setCarried(door);
  }

  // AN ADDRESS THAT NAMES A VIEW REOPENS IT WHOLE: the question is the address's; what the view
  // carries beyond it is read back from the view (a built-in from describe, a person's from its row).
  const [viewRead, setViewRead] = useState<string | null>(null);
  useEffect(() => {
    if (!def || typeof window === "undefined") return;
    const ref = new URLSearchParams(window.location.search).get(DRILL_VIEW_PARAM);
    if (!ref || ref === viewRead || openView?.ref === ref) return;
    setViewRead(ref);
    const params = new URLSearchParams(window.location.search);
    if (ref.startsWith("builtin:")) {
      const view = builtInViewsOf(def).find((v) => `builtin:${v.key}` === ref);
      if (!view) return;
      // the address asks nothing of its own: the view opens whole, narrowed by the address's filters
      const whole = viewQuestionFromAddress(explorerQuestionOf(view.question), params);
      if (whole) {
        openQuestion(whole, { ref, label: view.label });
        return;
      }
      setCarried(splitExplorerQuestion(explorerQuestionOf(view.question)).door);
      setOpenView({ ref, label: view.label });
      return;
    }
    void readDrillView(drillSavedViewSurface(def.key), ref).then((row) => {
      if (!row) return;
      const stored = (row.definition as { question?: ExplorerQuestion } | null)?.question;
      const whole = stored ? viewQuestionFromAddress(stored, params) : null;
      if (whole) {
        openQuestion(whole, { ref, label: row.name });
        return;
      }
      setCarried(stored?.door && Object.keys(stored.door).length > 0 ? stored.door : null);
      setOpenView({ ref, label: row.name });
    });
  }, [def, viewRead, openView?.ref]);

  const timeDims = (def?.dimensions ?? []).filter((d) => d.kind === "time");
  const autoGrain = drillExplorerAutoGrain(asked.window ?? null, knobs.grainLines, timeDims[0]?.grains);
  const question = withAutoGrain(def, asked, knobs.grainLines);
  const timeKeys = new Set(timeDims.map((d) => d.key));
  const grainWasChosen = [...asked.by, ...(asked.across ? [asked.across] : [])].some((ref) => timeKeys.has(ref));


  const dimensions: MatrxDrillDimension[] = (def?.dimensions ?? []).map((d) => {
    const dim: MatrxDrillDimension = { key: d.key, label: d.label, kind: d.kind };
    if (d.cardinality) dim.cardinality = d.cardinality;
    if (d.grains) dim.grains = d.grains as NonNullable<MatrxDrillDimension["grains"]>;
    // KEYS NEVER REACH A PERSON (VERIFIER-32 F5): an id reads as the door's label or the resolver's
    // name, a code as the definition's choice label — never the id or the code itself.
    const labelFor = drillDimensionLabelFor(d, { names: names[d.key], resolver: resolvers?.[d.key], hostWords: words?.[d.key] });
    if (labelFor) dim.labelFor = labelFor;
    return dim;
  });

  const measures: MatrxDrillMeasure[] = (def?.measures ?? []).map((m) => ({
    key: m.key,
    // The column's unit word is the one its cells print (VERIFY-DRILL-WAVE1 F9): the platform's cost
    // formatter says "points" today, so the column does too. Every other unit is said by its cells.
    label: m.unit === "usd" ? costColumnLabel(m.label, unit) : m.label,
    // a ratio, a percentile, a run rate or an average is recomputed per group, never added up
    additive: m.additive ?? (["count", "sum", "filled", "empty"].includes(m.op) && drillUnitAdds(m.unit)),
    format: drillUnitFormatter(m.unit, unit),
    ...(m.unit === "usd" ? { lowerIsBetter: true } : {}),
  }));
  const hasMoney = (def?.measures ?? []).some((m) => m.unit === "usd");
  const headlineKey = headline?.measure ?? (def?.measures ?? []).find((m) => m.unit === "usd")?.key ?? question.show[0] ?? null;
  const headlineMeasure = measures.find((m) => m.key === headlineKey);
  const fmt = (key: string | null, v: number | null | undefined) => {
    if (v === null || v === undefined) return "—";
    const m = measures.find((x) => x.key === key);
    return m?.format ? m.format(v) : formatCount(v);
  };

  // ONE VALUE, ONE READING (owner ruling 2026-09-30, replacing VERIFIER-32 F6's apportioning): every
  // value is formatted on its own by its unit, so the header's total, a group's cell, the coverage
  // line's whole and the same group's drilled total read the same wherever the number appears.
  const answers = rawAnswers;
  const whole = rawWhole;
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
  const windowWords = drillWindowLabel(question.window ?? null);
  const labelOfKey = (key: string) =>
    dimensions.find((d) => d.key === parseDimensionRef(key).key)?.label ?? measures.find((m) => m.key === key)?.label ?? key;
  const carriedSaid = carriedWords(carried, labelOfKey);
  // "Save this question as a view" keeps what the open view carries, so a copy is never wider.
  const savedQuestion: ExplorerQuestion = carried ? { ...asked, door: carried } : asked;
  const dimensionWords = dimensions.map((d) => d.label.toLowerCase());
  const conditions = [
    ...(openView ? [`Saved view "${openView.label}" is open.`] : []),
    ...(carriedSaid.kept ? [carriedSaid.kept] : []),
    ...(carriedSaid.leftOut ? [carriedSaid.leftOut] : []),
  ];

  // THE CHART above the answer: split = the first non-time grouping, bars at the auto grain.
  // the Measure stacked: the headline's (the screen's own number), else the first one shown
  const chartMeasure = headlineKey ?? question.show[0] ?? null;
  const chart = useDrillChart({
    client,
    source,
    lane,
    question,
    dimensions,
    measures,
    measure: chartMeasure,
    time: autoTimeRef(def, question, knobs.grainLines),
    seriesLimit: knobs.chartTopN ?? undefined,
    carried,
    windowAlign,
    countMeasure,
    version: freshness?.version,
    enabled: Boolean(def) && knobs.settled && question.by.length > 0,
  });

  // THE RECONCILIATION LINE (W2-3): the header's total against the other definition's, same window and filters.
  const reconciled = useDrillReconcile({
    client,
    lane,
    spec: reconcile,
    question,
    carried,
    windowAlign,
    labelOf: labelOfKey,
    version: freshness?.version,
    enabled: Boolean(def) && knobs.settled,
  });
  const reconcileLine =
    reconciled.state === "counted" && headlineKey && total?.measures[headlineKey] != null
      ? drillReconcileSentence(total.measures[headlineKey]!, reconciled.value, reconciled.label, (v) => fmt(headlineKey, v))
      : reconciled.state === "said"
        ? reconciled.sentence
        : null;

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
              const m = (def?.measures ?? []).find((x) => x.key === key);
              const label = m?.label ?? key;
              // a count reads "1,204 runs"; any other unit names itself first ("Projected monthly cost 3,578 points")
              const counted = !m?.unit || m.unit === "count" || m.unit === "tokens" || m.unit === "characters";
              return [{ key: `also:${key}`, content: counted ? `${fmt(key, v)} ${label.toLowerCase()}` : `${label} ${fmt(key, v)}` }];
            }),
            // THE MINE LANE IS EVERY ORGANIZATION'S (VERIFY-DRILL-LEDGER-RECORDS F4): the door narrows
            // the mine lane by the person alone (platform._drill_compile), so its numbers are hers
            // across all her organizations, whichever organization the screen asks in — said.
            ...(lane === "mine"
              ? [{ key: "scope", attrs: { "data-drill-explorer-scope": "mine" }, content: mineScope ?? `Your ${rowNoun}s across all your organizations` }]
              : []),
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
                  {/* the word every cost cell prints (VERIFY-DRILL-WAVE2 W2-5 f) */}
                  {u === "usd" ? "$" : "Points"}
                </button>
              ))}
            </div>
          ) : null}
          {def ? <DrillSavedViews surfaceKey={drillSavedViewSurface(def.key)} homeOrganizationId={lane === "platform" ? organizationId : null} builtIn={builtIn} question={savedQuestion} onOpen={(q, view) => openQuestion(q, view)} /> : null}
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
                // what the open view asks beyond the address, in words (W2-1)
                ...(conditions.length > 0 ? { conditions } : {}),
                // the address is read at the click (the view is named in it): see DrillExplainButton
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
              onOpen={(q) => openQuestion(q)}
            />
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {question.by.length === 0 ? (
          def && records ? (
            <DrillRecords client={client} source={source} lane={lane} def={def} records={records} question={question} dimensions={dimensions} measures={measures} rowNoun={rowNoun} carried={carried} resolvers={resolvers} openRecord={openRecord} />
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
            {def ? (
              <div data-drill-explorer-chart className="shrink-0 border-b border-border px-4 py-2">
                <MatrxDrillChart
                  dimensions={dimensions}
                  measures={measures}
                  question={question}
                  onQuestionChange={setQuestion}
                  answers={chart.answers}
                  seriesLimit={knobs.chartTopN ?? undefined}
                  measure={chartMeasure}
                  time={autoTimeRef(def, question, knobs.grainLines)}
                  paths={paths}
                  error={chart.error}
                  emptyLabel={emptyLabel}
                  height={200}
                />
              </div>
            ) : null}
            {/* THE PHONE (VERIFIER-32 F4): the group's words give way to the numbers — its label is
                capped and its count line hidden under 640 px, so the money column is on screen.
                The wrapper is a flex column so the package's own scroll box keeps the header row in view. */}
            <div className="flex min-h-[18rem] flex-1 flex-col max-sm:[&_[data-matrx-drill-answer]_td>div]:max-w-[42vw] max-sm:[&_[data-matrx-drill-answer]_td>div]:overflow-hidden max-sm:[&_[data-matrx-drill-answer]_td>div>span.whitespace-nowrap]:hidden">
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
                exportTitle={title}
                {...(question.where.length > 0 && headlineKey ? { coverage: { whole: whole?.measures[headlineKey] ?? null, measure: headlineKey } } : {})}
                {...(headlineKey && knobs.paretoSharePct !== null ? { pareto: { measure: headlineKey, sharePct: knobs.paretoSharePct } } : {})}
                rowActions={{ label: `${title} group`, location: location ?? title, kind: "drill-group", selectable: true }}
                {...(knobs.pivotColumns !== null ? { pivotColumnCap: knobs.pivotColumns } : {})}
                note={
                  <span data-drill-explorer-note>
                    {grainWasChosen ? <span>Shown by {autoGrain} — the grain {windowWords.toLowerCase()} reads best at. </span> : null}
                    {reconcileLine ? <span data-drill-explorer-reconcile>{reconcileLine} </span> : null}
                    {carriedSaid.kept || carriedSaid.leftOut ? (
                      <span data-drill-explorer-carried>
                        {openView ? `Saved view "${openView.label}". ` : null}
                        {carriedSaid.kept ? `${carriedSaid.kept} ` : null}
                        {carriedSaid.leftOut ? `${carriedSaid.leftOut} ` : null}
                        <button type="button" data-drill-explorer-carried-drop className="underline underline-offset-2" onClick={dropCarried}>
                          Show the answer without them
                        </button>{" "}
                      </span>
                    ) : null}
                    {behind ? <span className="text-destructive">{behind} </span> : null}
                    {stale.problem ? <span className="text-destructive">{stale.problem} </span> : null}
                    {knobs.says.map((s) => (
                      <span key={s} data-drill-explorer-knob-said>
                        {s}{" "}
                      </span>
                    ))}
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
                  </span>
                }
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
