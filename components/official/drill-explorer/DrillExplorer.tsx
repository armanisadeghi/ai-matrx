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
//
// Lane DRILL-LIVE-FIXES (VERIFY-DRILL-LIVE F1, F6, F8, F9; interface text is layout): every setting is
// read through `readDrillKnob` (the door's address rule, one helper); the header asks its own headline
// Measure whatever a view shows; a host that cuts its periods in one calendar (`timeZone`, UTC on the
// platform lane) prints every time in it and says so once with a chip; the toolbar's controls never
// shrink (they wrap to a second line on a phone); the note row is chips with tooltips
// (`DrillExplorerNotes`), never sentences.

import { useEffect, useRef, useState } from "react";
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
  drillFocus,
  drillRequestKey,
  useDrillUrlState,
  type MatrxDrillCross,
  type MatrxDrillDimension,
  type MatrxDrillMeasure,
  type MatrxDrillQuestion,
} from "@ai-matrx/design-system/data-table";

import AppLink from "@/components/navigation/AppLink";
import { InfoHint } from "@/components/official/InfoHint";
import { Button } from "@/components/ui/button";
import { selectCanToggleCostUnit, selectCostUnit } from "@/components/cost/costUnit";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setModulePreferences } from "@/lib/redux/preferences/userPreferencesSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";

import { DrillExplainButton } from "./DrillExplainButton";
import { DrillFindings } from "./DrillFindings";
import { useDrillNameBook, useDrillNames } from "./drillNames";
import { DrillNumberFilter } from "./DrillNumberFilter";
import { drillExplorerScope } from "./drillExplorerScope";
import { useDrillAttributes } from "./useDrillAttributes";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { DrillSiblingFindings } from "./DrillSiblingFindings";
import { drillAddressMisfit, drillSiblingDimensions, drillSiblingMeasures, drillSiblingQuestion, openDrillSibling, useDrillSiblings } from "./drillSiblings";
import { DrillRecords } from "./DrillRecords";
import { DrillSavedViews, type DrillOpenView } from "./DrillSavedViews";
import { drillSavedViewSurface, readDrillView } from "./savedViews";
import { explorerWindowRange, useDrillExplorer } from "./useDrillExplorer";
import { useDrillKnobs, useDrillStaleAfter } from "./useDrillKnobs";
import { DrillExplorerNotes, tipWords, type DrillNoteChip } from "./DrillExplorerNotes";
import { clockWords, measureFactWords, momentWords } from "./explorerWords";
import { useDrillChart } from "./useDrillChart";
import { drillReconcileChip, useDrillReconcile } from "./useDrillReconcile";
import { DrillExplorerHeadline } from "./DrillExplorerHeadline";
import { usePointsRate } from "@/components/cost/pointsRate.client";
import { carriedWords, splitExplorerQuestion, viewQuestionFromAddress, type DrillCarried, type ExplorerQuestion } from "./questionParts";
import { autoTimeRef, drillExplorerAutoGrain, withAutoGrain } from "./grain";
import {
  builtInViewsOf,
  explorerQuestionOf,
  findingsOf,
  recordsOf,
  staleAfterKnobOf,
  type DrillExplorerProps,
} from "./types";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";

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

const EMPTY_QUESTION: MatrxDrillQuestion = { by: [], show: [], where: [] };
/** The address parameter naming the open Saved view (`builtin:<key>` or a saved row's id). */
export const DRILL_VIEW_PARAM = "view";

/** Put (or take out) the open view's name in the address, without a history step of its own. */
function writeViewParam(ref: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (ref) url.searchParams.set(DRILL_VIEW_PARAM, ref);
  else url.searchParams.delete(DRILL_VIEW_PARAM);
  replaceAddressWithoutNavigating(url);
}

export function DrillExplorer({
  source,
  lane,
  acrossOrganizations,
  organizationId,
  title,
  rootLabel,
  firstQuestion,
  names: resolvers,
  headline,
  timeZone,
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
  siblings,
  groupLabel,
  pageWhere,
  surfaceName,
}: DrillExplorerProps) {
  const userId = useAppSelector(selectUserId);
  const { unit, canToggle, setUnit } = useUnit();
  const rate = usePointsRate();

  // The first screen: the host's, else the definition's own default (read once describe answers).
  const [definitionDefault, setDefinitionDefault] = useState<MatrxDrillQuestion | null>(null);
  // THE ADDRESS CARRIES THE LEVEL (lane DRILL-PRIMITIVE-2): `?by=conversation` with no `show` shows the
  // conversation level's Measures, once describe has said what the levels are.
  const [levelDims, setLevelDims] = useState<MatrxDrillDimension[] | undefined>(undefined);
  const { question: asked, setQuestion } = useDrillUrlState({ fallback: firstQuestion ?? definitionDefault ?? EMPTY_QUESTION, dimensions: levelDims });
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

  // what every ask carries: the open view's own filters, and the page's (its organization filter, N1)
  const asking: DrillCarried | null =
    pageWhere && Object.keys(pageWhere).length > 0 ? { ...(carried ?? {}), where: { ...(carried?.where ?? {}), ...pageWhere } } : carried;

  const seat = { lane, organizationId, userId } as const;
  const knobs = useDrillKnobs(seat);
  // The hook asks exactly what the table draws: the address question with the auto grain applied.
  // THE ONE NAME BOOK (lane DRILL-D1): every relation value on this screen — answer, chart, trail,
  // records, glance columns, findings, a sibling's findings — reads its words here (drillNames.ts).
  const nameBook = useDrillNameBook(resolvers);
  const drill = useDrillExplorer({ source, lane, organizationId, userId, question: asked, names: resolvers, book: nameBook, version: freshness?.version, countMeasure, windowAlign, carried: asking, headlineAlso: headline?.also, headlineMeasure: headline?.measure ?? null, grainLines: knobs.grainLines, ready: knobs.settled, acrossOrganizations });
  const { def, answers: rawAnswers, whole: rawWhole, says, error, asOf, client } = drill;
  const names = useDrillNames(nameBook);
  // THE CALENDAR THE DOOR CUTS PERIODS IN (F8): the definition's own (`calendar.time_zone`, from the
  // organization the door asks in — the platform lane's is UTC), else the host's word, else the reader's.
  const zone = (def as { calendar?: { time_zone?: string } } | null)?.calendar?.time_zone ?? timeZone;
  // the other grains' built-in views and findings, offered where the person already looks
  const siblingDefs = useDrillSiblings(client, siblings);
  // A LEVEL'S BREAKOUT INTO A SIBLING (lane DRILL-PRIMITIVE-2): ai_usage's person offers "By conversation",
  // which is ai_usage_executions'. The chip opens the sibling grouped by it, carrying the trail's filters
  // the sibling has, the window, and that level's Measures (else the ones it shares with this screen).
  const cross: MatrxDrillCross | null =
    siblingDefs.length === 0
      ? null
      : {
          label: (token, ref) =>
            siblingDefs.find((s) => s.token === token)?.def.dimensions.find((d) => d.key === parseDimensionRef(ref).key)?.label ?? null,
          open: (token, ref, q) => {
            const sibling = siblingDefs.find((s) => s.token === token);
            if (!sibling) return;
            openDrillSibling(sibling, { question: drillSiblingQuestion(sibling, q, [ref]) });
          },
        };
  // AN ADDRESS NAMING A SIBLING'S DIMENSION GOES THERE (lane DRILL-LIVE-FIX-2 #2); one nobody has is said.
  const misfit = def ? drillAddressMisfit(def, siblingDefs, asked, siblingDefs.length === (siblings?.length ?? 0)) : null;
  const misfitRoute = misfit && "route" in misfit ? misfit : null;
  const misfitKey = misfitRoute ? JSON.stringify([misfitRoute.route.token, misfitRoute.question]) : "";
  const routedFor = useRef("");
  useEffect(() => {
    if (!misfitRoute || routedFor.current === misfitKey) return;
    routedFor.current = misfitKey;
    openDrillSibling(misfitRoute.route, { question: misfitRoute.question });
    // keyed by misfitKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [misfitKey]);
  const shownError = misfit && "sentence" in misfit ? misfit.sentence : misfitRoute ? null : error;
  if (def && !levelDims) {
    setLevelDims(def.dimensions.map((d) => ({ key: d.key, label: d.label, kind: d.kind, ...(d.level ? { level: d.level } : {}) })));
  }
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


  // ONE mapping with the siblings (lane DRILL-WIRE): words, record kind (`entity`), choice colours,
  // and moments — so the answer, the chart and a sibling's findings read a Dimension the same way.
  const dimensions: MatrxDrillDimension[] = def ? drillSiblingDimensions(def, names, resolvers, words) : [];
  const measures: MatrxDrillMeasure[] = def ? drillSiblingMeasures(def, unit, rate) : [];
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
  const stale = useDrillStaleAfter(staleAfterKnobOf(def), seat);

  // FRESHNESS: the door's own `as_of` when the answers carry it; the host's count until then.
  const countedThrough = asOf ?? freshness?.countedThrough ?? null;
  const behind = Boolean(asOf && stale.minutes !== null && Date.now() - new Date(asOf).getTime() > stale.minutes * 60_000);

  const emptyLabel = "None";
  const windowWords = drillWindowLabel(question.window ?? null);
  const labelOfKey = (key: string) =>
    dimensions.find((d) => d.key === parseDimensionRef(key).key)?.label ?? measures.find((m) => m.key === key)?.label ?? key;
  const carriedSaid = carriedWords(carried, labelOfKey);
  // "Save this question as a view" keeps what the open view carries, so a copy is never wider.
  const savedQuestion: ExplorerQuestion = carried ? { ...asked, door: carried } : asked;
  const conditions = [
    ...(openView ? [`Saved view "${openView.label}" is open.`] : []),
    ...(carriedSaid.kept ? [carriedSaid.kept] : []),
    ...(carriedSaid.leftOut ? [carriedSaid.leftOut] : []),
  ];

  // WHAT THE OPEN BUILT-IN VIEW DECLARES BEYOND ITS QUESTION (lane DRILL-FLIP-FIXES): its glance columns
  // (R2, while its grouping is on screen) and its stacked Measures (L3, while it shows them all).
  const openBuiltIn = openView?.ref.startsWith("builtin:") ? builtIn.find((v) => `builtin:${v.key}` === openView.ref) : undefined;
  const viewStack = openBuiltIn?.chart?.stack?.every((k) => question.show.includes(k)) ? openBuiltIn.chart.stack : undefined;
  // THE LEVEL (lane DRILL-LEVELS): grouping by a Dimension shows its declared attributes as columns
  // (an open view's own win), and the drilled value's header says its attributes — both read through
  // the same door, grouped by the Dimension and the attribute.
  const levelOf = (ref: string | undefined) => (ref ? dimensions.find((d) => d.key === parseDimensionRef(ref).key)?.level : undefined);
  const outerLevelAttributes = levelOf(question.by[0])?.attributes;
  const viewAttributes =
    (openBuiltIn?.attributes && openBuiltIn.question.by?.[0] === question.by[0] ? openBuiltIn.attributes : undefined) ??
    (outerLevelAttributes ? [...outerLevelAttributes] : undefined);
  const glance = useDrillAttributes({ client, source, lane, question, dimensions, answers, attributes: viewAttributes, carried: asking, resolvers, book: nameBook, windowAlign });
  const focus = drillFocus(question);
  const focusLevelAttributes = focus && focus.value !== null ? levelOf(focus.dim)?.attributes : undefined;
  const focusGlance = useDrillAttributes({
    client,
    source,
    lane,
    question: focus ? { ...question, by: [focus.dim], across: null, where: question.where.slice(0, -1) } : EMPTY_QUESTION,
    dimensions,
    answers: focus && focus.value !== null ? { [drillRequestKey([focus.dim])]: [{ groups: { [focus.dim]: focus.value }, measures: {}, row_count: 0 }] } : {},
    attributes: focusLevelAttributes ? [...focusLevelAttributes] : undefined,
    carried: asking,
    resolvers,
    book: nameBook,
    windowAlign,
  });
  const focusAttributes = focus && focusGlance
    ? focusGlance.map((a) => ({ key: a.key, label: a.label, value: a.read({ [focus.dim]: focus.value }), ...(a.error ? { error: a.error } : {}) }))
    : undefined;

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
    stack: viewStack,
    time: autoTimeRef(def, question, knobs.grainLines),
    seriesLimit: knobs.chartTopN ?? undefined,
    carried: asking,
    windowAlign,
    countMeasure,
    version: freshness?.version,
    book: nameBook,
    enabled: Boolean(def) && knobs.settled && question.by.length > 0,
  });

  // THE RECONCILIATION LINE (W2-3): the header's total against the other definition's, same window and filters.
  const reconciled = useDrillReconcile({
    client,
    lane,
    spec: reconcile,
    question,
    carried: asking,
    windowAlign,
    labelOf: labelOfKey,
    version: freshness?.version,
    enabled: Boolean(def) && knobs.settled,
  });
  const reconcileChip: DrillNoteChip | null =
    reconciled.state === "counted" && headlineKey && total?.measures[headlineKey] != null
      ? { key: "reconcile", attrs: { "data-drill-explorer-reconcile": "" }, ...drillReconcileChip(total.measures[headlineKey]!, reconciled.value, reconciled.label, (v) => fmt(headlineKey, v)) }
      : reconciled.state === "said"
        ? { key: "reconcile", attrs: { "data-drill-explorer-reconcile": "" }, label: "Reconcile —", tip: reconciled.sentence }
        : null;

  // THE NOTE ROW, AS STATE (interface text is layout): each fact a chip, its detail in a tooltip
  const unread = [...knobs.unread, ...(stale.unread ? [stale.unread] : [])];
  const chips: DrillNoteChip[] = [
    ...(grainWasChosen ? [{ key: "grain", label: `By ${autoGrain}`, tip: `The grain ${windowWords.toLowerCase()} reads best at` }] : []),
    ...(reconcileChip ? [reconcileChip] : []),
    ...(openView || carriedSaid.kept || carriedSaid.leftOut
      ? [
          {
            key: "view",
            attrs: { "data-drill-explorer-carried": "" },
            label: openView ? `View: ${openView.label}` : "View filters",
            tip: [carriedSaid.kept, carriedSaid.leftOut].filter(Boolean).join(" ") || undefined,
            onClear: { label: "Show without the view's filters", run: dropCarried },
          },
        ]
      : []),
    ...(behind && asOf ? [{ key: "behind", tone: "warn" as const, attrs: { "data-drill-explorer-behind": "" }, label: "Behind", tip: `Counted through ${clockWords(asOf, zone)}${zone ? ` ${zone}` : ""}` }] : []),
    ...(unread.length > 0
      ? [
          {
            key: "defaults",
            tone: "warn" as const,
            attrs: { "data-drill-explorer-knob-said": "" },
            label: "Defaults",
            tip: `Not read: ${[...new Set(unread.map((u) => u.label))].join(", ")}. Built-in lines in use.`,
          },
        ]
      : []),
    ...(freshness?.error ? [{ key: "recount", tone: "error" as const, label: "Recount failed", tip: freshness.error }] : []),
  ];

  const screen = (
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
                    content: `from ${momentWords(range.from, zone)}`,
                  },
                ]
              : []),
            // THE CALENDAR THE PERIODS ARE CUT IN, said once (F8): a day bar is a UTC day on the platform lane
            ...(zone
              ? [{ key: "tz", title: "Days and hours are cut in this time zone", attrs: { "data-drill-explorer-time-zone": zone }, content: <span className="rounded bg-muted px-1 font-medium">{zone}</span> }]
              : []),
            ...(headline?.also ?? []).flatMap((key) => {
              const v = total?.measures[key];
              if (v === null || v === undefined) return [];
              const m = (def?.measures ?? []).find((x) => x.key === key);
              return [{ key: `also:${key}`, content: measureFactWords(m?.label ?? key, m?.unit, fmt(key, v)) }];
            }),
            // THE MINE LANE IS EVERY ORGANIZATION'S (VERIFY-DRILL-LEDGER-RECORDS F4): the door narrows
            // the mine lane by the person alone (platform._drill_compile), so its numbers are hers
            // across all her organizations, whichever organization the screen asks in — said.
            ...(lane === "mine"
              ? [{ key: "scope", title: "Counted across every organization you belong to", attrs: { "data-drill-explorer-scope": "mine" }, content: mineScope ?? "All your orgs" }]
              : []),
          ]}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2 type-secondary text-muted-foreground">
          <span data-drill-explorer-freshness>
            {freshness?.recounting ? "Recounting…" : countedThrough ? `Counted through ${clockWords(countedThrough, zone)}` : null}
          </span>
          {range && freshness?.recount ? (
            <Button
              icon={<RefreshCw />}
              type="button"
              variant="quiet"
              disabled={freshness.recounting}
              title={freshness.recountTitle ?? "Count this window again"}
              onClick={() => freshness.recount?.({ from: range.from, to: new Date().toISOString() })}
            > Recount
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
          {def ? <DrillSavedViews surfaceKey={drillSavedViewSurface(def.key)} homeOrganizationId={lane === "platform" ? organizationId : null} builtIn={builtIn} question={savedQuestion} onOpen={(q, view) => openQuestion(q, view)} builtInLabel={siblingDefs.length > 0 ? groupLabel : undefined} more={siblingDefs.map((s) => ({ label: s.group, views: builtInViewsOf(s.def).map((v) => ({ key: v.key, label: v.label, open: () => openDrillSibling(s, { view: v.key }) })) }))} /> : null}
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
      {/* F9: the controls never shrink — on a phone they wrap to their own line, the trail above them */}
      <div data-drill-explorer-toolbar className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-4 py-1.5">
        <MatrxDrillTrail dimensions={dimensions} question={question} onQuestionChange={setQuestion} rootLabel={rootLabel} emptyLabel={emptyLabel} measures={measures} answers={answers} focusAttributes={focusAttributes} rowNoun={rowNoun} cross={cross} className="min-w-0 max-sm:basis-full" />
        <div data-drill-explorer-controls className="ml-auto flex flex-wrap items-center justify-end gap-0 [&>*]:shrink-0">
          <MatrxDrillWindowMenu question={question} onQuestionChange={setQuestion} dimensionLabel="When" />
          <MatrxDrillMeasurePicker measures={measures} question={question} onQuestionChange={setQuestion} />
          <MatrxDrillGroupByMenu dimensions={dimensions} question={question} onQuestionChange={setQuestion} />
          {question.by.length > 0 ? (
            <DrillNumberFilter
              measures={measures}
              units={Object.fromEntries((def?.measures ?? []).map((m) => [m.key, m.unit]))}
              shown={question.show}
              having={carried?.having ?? []}
              money={unit}
              onChange={(next) => {
                const { having: _drop, ...rest } = carried ?? {};
                void _drop;
                const kept: DrillCarried = next.length > 0 ? { ...rest, having: next } : rest;
                setCarried(Object.keys(kept).length > 0 ? kept : null);
              }}
            />
          ) : null}
          {findings.length > 0 || siblingDefs.some((s) => findingsOf(s.def).length > 0) ? (
            <DrillFindings
              label={groupLabel}
              sections={siblingDefs
                .filter((s) => findingsOf(s.def).length > 0)
                .map((s) => ({
                  label: s.group,
                  count: findingsOf(s.def).length,
                  render: (open: boolean, close: () => void) => (
                    <DrillSiblingFindings client={client} lane={lane} window={question.window ?? null} sibling={s} resolvers={resolvers} book={nameBook} money={unit} emptyLabel={emptyLabel} open={open} onOpen={(q) => { close(); openDrillSibling(s, { question: q }); }} />
                  ),
                }))}
              client={client}
              source={source}
              lane={lane}
              findings={findings}
              question={question}
              dimensions={dimensions}
              measures={measures}
              paths={paths}
              emptyLabel={emptyLabel}
              book={nameBook}
              onOpen={(q) => openQuestion(q)}
            />
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {question.by.length === 0 ? (
          def && records ? (
            <DrillRecords client={client} source={source} lane={lane} def={def} records={records} question={question} dimensions={dimensions} measures={measures} rowNoun={rowNoun} carried={asking} resolvers={resolvers} book={nameBook} siblings={{ offered: (siblings ?? []).map((x) => x.token), described: siblingDefs }} openRecord={openRecord} timeZone={zone} />
          ) : (
            <p data-drill-explorer-no-grouping className="flex flex-wrap items-center gap-1.5 p-6 type-body text-muted-foreground">
              <span>No grouping. Pick one in Group by.</span>
              {recordsLink ? (
                <span className="inline-flex items-center gap-1">
                  <AppLink href={recordsLink.href(question)} className="underline underline-offset-2">
                    {recordsLink.label}
                  </AppLink>
                  <InfoHint text={tipWords(typeof recordsLink.lead === "function" ? recordsLink.lead(question) : recordsLink.lead)} label={recordsLink.label} />
                </span>
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
                  stack={viewStack}
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
                error={shownError}
                rowNoun={rowNoun}
                emptyLabel={emptyLabel}
                exportTitle={title}
                search
                {...(glance ? { attributes: glance } : {})}
                cross={cross}
                {...(question.where.length > 0 && headlineKey ? { coverage: { whole: whole?.measures[headlineKey] ?? null, measure: headlineKey } } : {})}
                {...(headlineKey && knobs.paretoSharePct !== null ? { pareto: { measure: headlineKey, sharePct: knobs.paretoSharePct } } : {})}
                rowActions={{ label: `${title} group`, location: location ?? title, kind: "drill-group", selectable: true }}
                {...(knobs.pivotColumns !== null ? { pivotColumnCap: knobs.pivotColumns } : {})}
                note={
                  <span data-drill-explorer-note className="inline-flex flex-wrap items-center gap-1.5">
                    <DrillExplorerNotes chips={chips} notes={says} />
                    {!records && recordsLink ? (
                      <span className="inline-flex items-center gap-1">
                        <AppLink href={recordsLink.href(question)} className="underline underline-offset-2">
                          {recordsLink.label}
                        </AppLink>
                        <InfoHint text={tipWords(typeof recordsLink.lead === "function" ? recordsLink.lead(question) : recordsLink.lead)} label={recordsLink.label} />
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
  if (!surfaceName) return screen;
  return (
    <SurfaceRuntimeProvider
      surfaceName={surfaceName}
      getScope={() =>
        drillExplorerScope({
          definitionKey: def?.key ?? (source.kind === "entity" ? source.token : source.id),
          definitionLabel: def?.label ?? null,
          openView: openView?.label ?? null,
          question,
          dimensions,
          measures,
          answers,
          error,
          asOf: countedThrough,
          says,
          money: unit,
          emptyLabel,
        })
      }
    >
      {screen}
    </SurfaceRuntimeProvider>
  );
}

/** The Dimension key of a reference (`at:day` → `at`), for hosts mapping crumbs to other screens. */
export function drillDimensionKey(ref: string): string {
  return parseDimensionRef(ref).key;
}
