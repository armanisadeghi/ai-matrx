"use client";

// components/official/drill-explorer/useDrillExplorer.ts — THE EXPLORER'S PORT ONTO THE ONE READ DOOR
// (lane DRILL-EXPLORER, program DRILL-FINISH decision 9; generalized from the usage page's
// useUsageDrill, lane DRILL-USAGE-PAGE).
//
// Every number on the screen is one `platform.drill_ask` of the source, asked in the host's lane:
// exactly `drillRequests(question)` (the total, each level, each pivot crossing), plus ONE more
// while the trail narrows — the same question without the trail, so the coverage line can say
// what part of the whole window the slice is. The definition (Dimensions, Measures, paths, and —
// when the contract carries them — built-in views, findings, records) is `platform.drill_describe`.
// Id-valued Dimensions read their words from the door's own labels, then the host's name resolvers.

import { drillFailureWords } from "./explorerWords";
import { useEffect, useRef, useState } from "react";
import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import type { DrillAnswer, DrillDefinition, DrillQuestion, DrillSource } from "@ai-matrx/records";
import { personActor, recordsDataSource } from "@ai-matrx/records-ui";
import {
  drillRequests,
  drillWindowRange,
  parseDimensionRef,
  type MatrxDrillAnswerRow,
  type MatrxDrillAnswers,
  type MatrxDrillQuestion,
} from "@ai-matrx/design-system/data-table";

import { supabase } from "@/utils/supabase/client";

import { withAutoGrain, type DrillGrainLines } from "./grain";
import { asOfAnswer, doorWhere, type DrillNameResolver } from "./types";
import { useDrillNameBookOr, useDrillNames, type DrillNameBook } from "./drillNames";
import { carriedAsk, type DrillCarried } from "./questionParts";
import { drillDoorLabels } from "./dimensionWords";

const clients = new Map<string, RecordsClient>();

/**
 * A MEMBER ACROSS ALL HER ORGANIZATIONS (lane DRILL-WAVE3): the door counts an unasked standard source over
 * every organization she is in (her own row rules decide each row), and an `organization` lane over just the
 * one named. A page whose organization is a visible control (default All organizations) asks the first way:
 * the questions go out with no lane. The active organization stays only the client's own (its calendar).
 */
export function acrossOrganizations(source: ReturnType<typeof recordsDataSource>): ReturnType<typeof recordsDataSource> {
  return {
    ...source,
    rpc: ((fn: string, args: Record<string, unknown>, options: unknown) => {
      const question = args?.p_question;
      if ((fn === "drill_ask" || fn === "drill_rows") && question && typeof question === "object") {
        const { lane: _lane, ...rest } = question as Record<string, unknown>;
        return (source.rpc as (f: string, a: unknown, o: unknown) => unknown)(fn, { ...args, p_question: rest }, options);
      }
      return (source.rpc as (f: string, a: unknown, o: unknown) => unknown)(fn, args, options);
    }) as typeof source.rpc,
  };
}

/** One records client per organization and person (the door needs both). */
export function drillClientFor(organizationId: string, userId: string | null, across = false): RecordsClient {
  const key = `${organizationId}:${userId ?? ""}:${across ? "all" : "one"}`;
  let client = clients.get(key);
  if (!client) {
    client = createRecordsClient({
      dataSource: across ? acrossOrganizations(recordsDataSource(supabase)) : recordsDataSource(supabase),
      actor: personActor(userId),
      organizationId,
    });
    clients.set(key, client);
  }
  return client;
}

type RawRow = DrillAnswer["rows"][number];
const NO_ANSWERS: MatrxDrillAnswers = {};

/** A door value as a number: a moment's ISO text becomes epoch ms, anything else is read as a number. */
export function drillValueNumber(v: number | string): number | null {
  if (typeof v === "number") return v;
  const n = Number(v);
  if (!Number.isNaN(n)) return n;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/** One door row as the answer table reads it (a prior-only group keeps its values). */
export function drillRowOf(
  r: Pick<RawRow, "groups" | "measures" | "row_count"> & Partial<Pick<RawRow, "prior_groups" | "prior_measures" | "distinct_groups" | "kind">>,
  countMeasure?: string,
  spans?: ReadonlySet<string>,
): MatrxDrillAnswerRow & { kind?: "group" | "other" | "total" } {
  const groups: Record<string, string | null> = {};
  // A group that only the PRIOR window had (a compare) arrives with groups null and its values in
  // prior_groups; reading groups alone turned every such group into the same empty key.
  for (const [k, v] of Object.entries(r.groups ?? r.prior_groups ?? {})) groups[k] = v === null || v === undefined ? null : String(v);
  // A SPAN ON THE EMPTY GROUP IS A STATE, NOT A NUMBER (lane DRILL-LIVE-FIX-2 #5): "No conversation"
  // gathers unrelated rows, so first-to-last across them ("719h 59m") measures nothing — it reads "—".
  const emptyGroup = r.kind !== "total" && r.kind !== "other" && Object.values(groups).some((v) => v === null);
  const num = (m: Record<string, number | string | null> | null | undefined) => {
    const out: Record<string, number | null> = {};
    // a moment (unit time, "Last active") arrives as ISO text: it is carried as epoch ms so it sorts
    // and formats like every other value (measureFormat's "time"); any other text is a number
    for (const [k, v] of Object.entries(m ?? {})) out[k] = v === null || v === undefined || (emptyGroup && spans?.has(k)) ? null : drillValueNumber(v);
    return out;
  };
  return {
    groups,
    measures: num(r.measures),
    // What a row COUNTS: the host's count Measure when it names one (hourly totals are not what a
    // person counts), else the rows the door counted.
    row_count: countMeasure && r.measures?.[countMeasure] != null ? Number(r.measures[countMeasure]) : Number(r.row_count ?? 0),
    ...(r.prior_measures ? { prior_measures: num(r.prior_measures) } : {}),
    ...(r.distinct_groups !== undefined ? { distinct_groups: r.distinct_groups } : {}),
    // the chart tells a group from the rest and the total by the door's own `kind`
    ...(r.kind === "group" || r.kind === "other" || r.kind === "total" ? { kind: r.kind } : {}),
  };
}

/**
 * THE TIME DIMENSION A WINDOW RUNS ALONG, FROM THE DEFINITION (lane DRILL-LIVE-FIX-2 #1): the question's
 * own declared key (`carried.windowKey`) first, else the definition's "at" when it has one, else its
 * first time Dimension. Never a hard-coded "at": user_acquisition's time is `created_at`, and every
 * ask that sent "at" there was refused (400). A definition with no time Dimension has no window (null).
 */
export function drillWindowKey(
  dimensions: readonly { key: string; kind?: string | undefined }[] | null | undefined,
  carried?: { windowKey?: string | undefined } | null,
): string | null {
  if (carried?.windowKey) return carried.windowKey;
  const times = (dimensions ?? []).filter((d) => d.kind === "time");
  return (times.find((d) => d.key === "at") ?? times[0])?.key ?? null;
}

/**
 * The window of an address question in the door's words (and the comparison with it), along the
 * definition's own time Dimension (`drillWindowKey`) — required, so no caller can fall back to "at".
 */
export function doorWindow(question: MatrxDrillQuestion, along: { key: string | null; align?: "hour" | undefined }): Pick<DrillQuestion, "window" | "compare"> {
  if (!along.key) return {};
  const range = explorerWindowRange(question.window ?? null, along.align);
  if (!range) return {};
  return {
    window: { key: along.key, from: range.from, to: range.to },
    ...(question.compare ? { compare: { against: question.compare, from: range.from, to: range.to } } : {}),
  };
}

/**
 * The half-open moments a window covers (days, presets, or moments — the package reads them all since
 * 0.49.40). `align: "hour"` starts it on the hour (UTC) — a rollup counts whole hours, so a window
 * starting mid-hour would silently drop that hour's first minutes while the Spend Explorer counted
 * them (VERIFIER-32 F1). The end stays "now": the rollup's open hour holds everything counted so far.
 */
export function explorerWindowRange(window: string | null | undefined, align?: "hour", now: Date = new Date()): { from: string; to: string } | null {
  const range = drillWindowRange(window, now);
  if (!range || align !== "hour") return range;
  const from = new Date(range.from);
  if (Number.isNaN(from.getTime())) return range;
  from.setUTCMinutes(0, 0, 0);
  return { from: from.toISOString(), to: range.to };
}

/**
 * The sort a request is asked with. The door keeps the top groups BY THIS (the rest fold into
 * Other), so it ranks as the table sorts — except a grouping that starts with TIME while the person
 * chose no sort: then no sort is sent, and the door keeps the LATEST periods in calendar order (its
 * time-first rule), never the costliest ones (VERIFY-DRILL-WAVE1 F2: a pivot across 30 days kept the
 * 24 costliest days, and read Sep 28, 29, 26, 27…).
 */
export function doorSort(
  by: readonly string[],
  chosen: MatrxDrillQuestion["sort"] | null,
  sortKey: string | undefined,
  timeKeys: ReadonlySet<string>,
): Pick<DrillQuestion, "sort"> {
  if (!sortKey) return {};
  if (!chosen && by.length > 0 && timeKeys.has(parseDimensionRef(by[0]!).key)) return {};
  return { sort: { key: sortKey, direction: chosen?.direction ?? "desc" } };
}

export interface DrillExplorerData {
  def: DrillDefinition | null;
  answers: MatrxDrillAnswers;
  /** The same question's total WITHOUT the trail (the coverage line's whole). */
  whole: MatrxDrillAnswerRow | null;
  /** Dimension key → id → words. */
  names: Record<string, Record<string, string>>;
  says: string[];
  error: string | null;
  /** The door's own "counted through" on these answers, when it says one. */
  asOf: string | null;
  client: RecordsClient | null;
}

export function useDrillExplorer(args: {
  source: DrillSource;
  lane: "mine" | "organization" | "platform";
  organizationId: string | null;
  userId: string | null;
  question: MatrxDrillQuestion;
  names?: Record<string, DrillNameResolver> | undefined;
  /** The explorer's one name book (drillNames.ts); absent = this hook keeps its own. */
  book?: DrillNameBook | undefined;
  /** Changes when the host knows the data changed (a recount); every answer is asked again. */
  version?: number | undefined;
  countMeasure?: string | undefined;
  windowAlign?: "hour" | undefined;
  /** What the open view asks beyond the address (list/range filters, a group limit, thresholds): asked with every request. */
  carried?: DrillCarried | null | undefined;
  /** Measures the header says beside the total (asked on the total only, never as table columns). */
  headlineAlso?: readonly string[] | undefined;
  /**
   * The header's own number (VERIFY-DRILL-LIVE F6): asked on the total whatever the question shows,
   * so a Saved view whose Measures leave it out keeps the header's total instead of "—".
   */
  headlineMeasure?: string | null | undefined;
  /** The auto-grain lines (the knobs), or null for the package's own. */
  grainLines?: DrillGrainLines | null | undefined;
  /** False while the settings are still being read: nothing is asked until the grain is known. */
  ready?: boolean | undefined;
  /** Ask with no lane: every organization she is in, her row rules deciding each row (a member page whose organization is a page control). */
  acrossOrganizations?: boolean | undefined;
}): DrillExplorerData {
  const { source, lane, organizationId, userId, question, names: resolvers, book: hostBook, version = 0, countMeasure, windowAlign, carried, headlineAlso, headlineMeasure = null, grainLines = null, ready = true } = args;
  const client = organizationId ? drillClientFor(organizationId, userId, args.acrossOrganizations === true) : null;
  const sourceKey = JSON.stringify(source);
  const [def, setDef] = useState<DrillDefinition | null>(null);
  // THE ANSWERS BELONG TO ONE QUESTION: while a new window or trail is being counted the screen
  // draws its loading state, never the previous question's numbers under the new question's words.
  const [answered, setAnswered] = useState<{ key: string; answers: MatrxDrillAnswers; whole: MatrxDrillAnswerRow | null }>({ key: "", answers: {}, whole: null });
  const book = useDrillNameBookOr(hostBook, resolvers);
  const names = useDrillNames(book);
  const [says, setSays] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  // Relation crumbs already asked for their name (per definition), so a trail never asks twice.
  const crumbsAsked = useRef<Set<string>>(new Set());

  // THE DEFINITION — once per organization and source.
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void client.drillDescribe({ source: JSON.parse(sourceKey) as DrillSource }).then((got) => {
      if (cancelled) return;
      if (got.ok) setDef(got.data ?? null);
      else setError(drillFailureWords(got.error.message, "The definition could not be read."));
    });
    return () => {
      cancelled = true;
    };
  }, [client, sourceKey]);

  const askKey = JSON.stringify({ lines: grainLines, by: question.by, across: question.across ?? null, show: question.show, where: question.where, window: question.window ?? null, compare: question.compare ?? null, sort: question.sort ?? null, carried: carried ?? null });
  const resolverKeys = Object.keys(resolvers ?? {}).sort().join(",");
  const alsoKey = [headlineMeasure ?? "", ...(headlineAlso ?? [])].join(",");

  // THE ANSWERS — every request the table needs, plus the whole (no trail) for coverage.
  useEffect(() => {
    // Asked with no grouping too: the header's total and the trail's names are the same question.
    if (!client || !def || !ready) return;
    const parsed = JSON.parse(askKey) as MatrxDrillQuestion & { carried: DrillCarried | null; lines: DrillGrainLines | null };
    const door = parsed.carried;
    const asked = withAutoGrain(def, parsed, parsed.lines);
    const windowPart = doorWindow(asked, { key: drillWindowKey(def.dimensions, door), align: windowAlign });
    // A RUN RATE NEEDS A WINDOW WITH A START (the door refuses one without, 22023): with "all time" it is
    // left out of the ask and said, never a failed answer (lane DRILL-GAPS)
    const rates = new Set(def.measures.filter((m) => (m.op as string) === "rate").map((m) => m.key));
    const noStart = !windowPart.window;
    const askable = (keys: readonly string[]) => (noStart ? keys.filter((k) => !rates.has(k)) : [...keys]);
    const headerAsks = [...(headlineMeasure ? [headlineMeasure] : []), ...(headlineAlso ?? [])];
    const leftOut = noStart ? [...asked.show, ...headerAsks].filter((k) => rates.has(k)) : [];
    const doorShow = askable(countMeasure && !asked.show.includes(countMeasure) ? [...asked.show, countMeasure] : asked.show);
    const totalShow = [...doorShow, ...askable([...new Set(headerAsks)].filter((k) => !doorShow.includes(k) && def.measures.some((m) => m.key === k)))];
    const where = doorWhere(asked);
    const sortKey = asked.sort && doorShow.includes(asked.sort.key) ? asked.sort.key : doorShow[0];
    const requests = drillRequests(asked);
    const answeredFor = `${askKey}#${version}`;
    const src = JSON.parse(sourceKey) as DrillSource;
    let cancelled = false;
    setError(null);
    const timeKeys = new Set(def.dimensions.filter((d) => d.kind === "time").map((d) => d.key));
    const spans = new Set(def.measures.filter((m) => (m.op as string) === "span").map((m) => m.key));
    const sortFor = (by: string[]) => doorSort(by, asked.sort ?? null, sortKey, timeKeys);
    // THRESHOLDS ARE ON GROUPS (lane DRILL-FLIP-FIXES L1): the total (no grouping) is asked without them,
    // and a grouped ask also shows every Measure a threshold reads (the door judges a number it shows)
    const thresholdShow = (door?.having ?? []).map((h) => h.measure).filter((k) => def.measures.some((m) => m.key === k));
    const ask = (by: string[], w: Record<string, unknown>) => {
      const { having, ...rest } = carriedAsk(door);
      return client.drillAsk({
        source: src,
        question: {
          by,
          show: by.length === 0 ? totalShow : [...doorShow, ...thresholdShow.filter((k) => !doorShow.includes(k))],
          // the open view's own filters (lists, ranges) narrow every number, the trail's crumbs on top
          where: { ...(door?.where ?? {}), ...w },
          lane,
          ...windowPart,
          ...rest,
          ...(by.length > 0 && having ? { having } : {}),
          ...sortFor(by),
        },
      });
    };
    void Promise.all([
      ...requests.map(async (request) => ({ key: request.key, by: request.by, got: await ask(request.by, where) })),
      ...(asked.where.length > 0 ? [ask([], {}).then((got) => ({ key: "__whole__", by: [] as string[], got }))] : []),
    ]).then((results) => {
      if (cancelled) return;
      const failed = results.find((r) => !r.got.ok);
      if (failed && !failed.got.ok) {
        setError(drillFailureWords(failed.got.error.message, "The answer could not be counted."));
        return;
      }
      const out: Record<string, MatrxDrillAnswerRow[]> = {};
      const sentences: string[] = leftOut.length > 0
        ? [`${[...new Set(leftOut)].map((k) => def.measures.find((m) => m.key === k)?.label ?? k).join(", ")} ${leftOut.length === 1 ? "is a run rate, counted" : "are run rates, counted"} over a window with a start — pick a window to see ${leftOut.length === 1 ? "it" : "them"}.`]
        : [];
      let wholeRow: MatrxDrillAnswerRow | null = null;
      let counted: string | null = null;
      const ids: Record<string, Set<string>> = {};
      // THE DOOR'S OWN WORDS (lane DRILL-GAPS): a relation group arrives with its label, read as the
      // seat through the target's row security — no host lookup for what the door already named.
      const doorLabels: Record<string, Record<string, string>> = {};
      const named = new Set(resolverKeys ? resolverKeys.split(",") : []);
      const note = (dim: string, value: unknown) => {
        const key = parseDimensionRef(dim).key;
        if (named.has(key) && typeof value === "string" && value) (ids[key] ??= new Set()).add(value);
      };
      for (const r of results) {
        if (!r.got.ok) continue;
        const answer = r.got.data!;
        counted = counted ?? asOfAnswer(answer);
        for (const s of answer.says) if (!sentences.includes(s)) sentences.push(s);
        if (r.key === "__whole__") {
          wholeRow = answer.total ? drillRowOf(answer.total, countMeasure) : null;
          continue;
        }
        const kind = r.by.length === 0 ? "total" : "group";
        const rows = answer.rows
          .filter((row) => row.kind === kind && (kind === "group" || !row.groups || Object.keys(row.groups).length === 0))
          .map((row) => drillRowOf(row, countMeasure, spans));
        out[r.key] = rows;
        for (const [key, map] of Object.entries(drillDoorLabels(answer.rows))) doorLabels[key] = { ...(doorLabels[key] ?? {}), ...map };
        for (const row of answer.rows) for (const [dim, value] of Object.entries(row.groups ?? {})) note(dim, value);
      }
      for (const w of asked.where) note(w.dim, w.value);
      book.learn(doorLabels);
      setAnswered({ key: answeredFor, answers: out, whole: wholeRow });
      setSays(sentences);
      setAsOf(counted);
      // A TRAIL CRUMB READS THE NAME ITS ROWS DO (VERIFY-DRILL-LIVE F7). A crumb's value is a filter,
      // so no row of a narrowed answer carries its label (the rows are grouped by the next level); a
      // relation crumb the door named on an earlier screen kept it, but one opened from an address, a
      // record or a finding read "A workflow whose name you cannot read" above rows that name it. The
      // same door names it: grouped by that Dimension, filtered to just these ids, read as the seat.
      const unnamedCrumbs: Record<string, string[]> = {};
      for (const w of asked.where) {
        const key = parseDimensionRef(w.dim).key;
        const dim = def.dimensions.find((d) => d.key === key);
        if (!dim || dim.kind !== "relation" || named.has(key) || typeof w.value !== "string" || !w.value) continue;
        const seen = `${def.key}:${key}:${w.value}`;
        if (doorLabels[key]?.[w.value] || crumbsAsked.current.has(seen)) continue;
        crumbsAsked.current.add(seen);
        (unnamedCrumbs[key] ??= []).push(w.value);
      }
      // any Measure that is not a run rate (a rate needs a window with a start; the name needs none)
      const nameShow = def.measures.filter((m) => !rates.has(m.key)).slice(0, 1).map((m) => m.key);
      for (const [key, values] of Object.entries(unnamedCrumbs)) {
        void client
          .drillAsk({ source: src, question: { by: [key], show: nameShow, where: { [key]: values }, lane, limit: values.length } })
          .then((got) => {
            if (cancelled || !got.ok) return;
            const map = drillDoorLabels(got.data!.rows)[key];
            if (map) book.learn({ [key]: map });
          });
      }
      // the ids on screen go to the ONE book (drillNames.ts): the host's resolver is asked once per id
      for (const [key, set] of Object.entries(ids)) {
        void book.want(key, set).then((message) => {
          if (cancelled || !message) return;
          setSays((s) => (s.includes(message) ? s : [...s, message]));
        });
      }
    });
    return () => {
      cancelled = true;
    };
    // `resolvers` is read through `resolverKeys` (a host passes a fresh object each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, def, askKey, version, lane, sourceKey, resolverKeys, countMeasure, windowAlign, alsoKey, ready]);

  const current = answered.key === `${askKey}#${version}`;
  return { def, answers: current ? answered.answers : NO_ANSWERS, whole: current ? answered.whole : null, names, says, error, asOf, client };
}
