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
// Id-valued Dimensions read their words through the host's name resolvers.

import { useEffect, useState } from "react";
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

import { withAutoGrain } from "./grain";
import { asOfAnswer, doorWhere, type DrillNameResolver } from "./types";
import { carriedAsk, type DrillCarried } from "./questionParts";

const clients = new Map<string, RecordsClient>();
/** One records client per organization and person (the door needs both). */
export function drillClientFor(organizationId: string, userId: string | null): RecordsClient {
  const key = `${organizationId}:${userId ?? ""}`;
  let client = clients.get(key);
  if (!client) {
    client = createRecordsClient({
      dataSource: recordsDataSource(supabase),
      actor: personActor(userId),
      organizationId,
    });
    clients.set(key, client);
  }
  return client;
}

type RawRow = DrillAnswer["rows"][number];
const NO_ANSWERS: MatrxDrillAnswers = {};

/** One door row as the answer table reads it (a prior-only group keeps its values). */
export function drillRowOf(
  r: Pick<RawRow, "groups" | "measures" | "row_count"> & Partial<Pick<RawRow, "prior_groups" | "prior_measures" | "distinct_groups">>,
  countMeasure?: string,
): MatrxDrillAnswerRow {
  const groups: Record<string, string | null> = {};
  // A group that only the PRIOR window had (a compare) arrives with groups null and its values in
  // prior_groups; reading groups alone turned every such group into the same empty key.
  for (const [k, v] of Object.entries(r.groups ?? r.prior_groups ?? {})) groups[k] = v === null || v === undefined ? null : String(v);
  const num = (m: Record<string, number | string | null> | null | undefined) => {
    const out: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(m ?? {})) out[k] = v === null || v === undefined ? null : Number(v);
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
  };
}

/** The window of an address question in the door's words (and the comparison with it). */
export function doorWindow(question: MatrxDrillQuestion, align?: "hour"): Pick<DrillQuestion, "window" | "compare"> {
  const range = explorerWindowRange(question.window ?? null, align);
  if (!range) return {};
  return {
    window: { key: "at", from: range.from, to: range.to },
    ...(question.compare ? { compare: { against: question.compare, from: range.from, to: range.to } } : {}),
  };
}

/**
 * The half-open moments a window covers. `align: "hour"` starts it on the hour (UTC) — a rollup
 * counts whole hours, so a window starting mid-hour would silently drop that hour's first minutes
 * while the Spend Explorer counted them (VERIFIER-32 F1). The end stays "now": the rollup's open hour
 * holds everything counted so far.
 */
export function explorerWindowRange(window: string | null | undefined, align?: "hour", now: Date = new Date()): { from: string; to: string } | null {
  const range = momentRange(window) ?? drillWindowRange(window, now);
  if (!range || align !== "hour") return range;
  const from = new Date(range.from);
  if (Number.isNaN(from.getTime())) return range;
  from.setUTCMinutes(0, 0, 0);
  return { from: from.toISOString(), to: range.to };
}

/**
 * A window of MOMENTS (`2026-09-28T14:00Z..2026-09-28T18:00Z`, a declared view's sub-day window —
 * VERIFY-DRILL-WAVE1 F3). The published design system (0.49.37) reads only day ranges and would
 * turn this into no window at all; read here until the version with moments is installed
 * (PROGRESS-DRILL-EXPLORER "After publish").
 */
const MOMENT = String.raw`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+\- ]\d{2}:\d{2})?`;
const MOMENT_RANGE = new RegExp(`^(${MOMENT}|\\d{4}-\\d{2}-\\d{2})\\.\\.(${MOMENT}|\\d{4}-\\d{2}-\\d{2})$`);
function momentRange(window: string | null | undefined): { from: string; to: string } | null {
  if (!window || !window.includes("T")) return null;
  const m = window.match(MOMENT_RANGE);
  if (!m) return null;
  const end = (v: string) => v.replace(/(T\d{2}:\d{2}(?::\d{2})?) (\d{2}:\d{2})$/, "$1+$2");
  return { from: end(m[1]!), to: end(m[2]!) };
}

/** How a window reads — a window of moments with its clock ("Sep 28, 2026 14:00 – 18:00 UTC"), else the package's words. */
export function explorerWindowLabel(window: string | null | undefined, packageLabel: (w: string | null | undefined) => string): string {
  const range = momentRange(window);
  if (!range) return packageLabel(window);
  const words = (iso: string) => {
    const d = new Date(iso);
    return { day: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }), clock: d.toISOString().slice(11, 16) };
  };
  const a = words(range.from);
  const b = words(range.to);
  return `${a.day} ${a.clock} – ${a.day === b.day ? b.clock : `${b.day} ${b.clock}`} UTC`;
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
  /** Changes when the host knows the data changed (a recount); every answer is asked again. */
  version?: number | undefined;
  countMeasure?: string | undefined;
  windowAlign?: "hour" | undefined;
  /** What the open view asks beyond the address (list/range filters, a group limit, thresholds): asked with every request. */
  carried?: DrillCarried | null | undefined;
}): DrillExplorerData {
  const { source, lane, organizationId, userId, question, names: resolvers, version = 0, countMeasure, windowAlign, carried } = args;
  const client = organizationId ? drillClientFor(organizationId, userId) : null;
  const sourceKey = JSON.stringify(source);
  const [def, setDef] = useState<DrillDefinition | null>(null);
  // THE ANSWERS BELONG TO ONE QUESTION: while a new window or trail is being counted the screen
  // draws its loading state, never the previous question's numbers under the new question's words.
  const [answered, setAnswered] = useState<{ key: string; answers: MatrxDrillAnswers; whole: MatrxDrillAnswerRow | null }>({ key: "", answers: {}, whole: null });
  const [names, setNames] = useState<Record<string, Record<string, string>>>({});
  const [says, setSays] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);

  // THE DEFINITION — once per organization and source.
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void client.drillDescribe({ source: JSON.parse(sourceKey) as DrillSource }).then((got) => {
      if (cancelled) return;
      if (got.ok) setDef(got.data ?? null);
      else setError(got.error.message || "The definition could not be read.");
    });
    return () => {
      cancelled = true;
    };
  }, [client, sourceKey]);

  const askKey = JSON.stringify({ by: question.by, across: question.across ?? null, show: question.show, where: question.where, window: question.window ?? null, compare: question.compare ?? null, sort: question.sort ?? null, carried: carried ?? null });
  const resolverKeys = Object.keys(resolvers ?? {}).sort().join(",");

  // THE ANSWERS — every request the table needs, plus the whole (no trail) for coverage.
  useEffect(() => {
    // Asked with no grouping too: the header's total and the trail's names are the same question.
    if (!client || !def) return;
    const parsed = JSON.parse(askKey) as MatrxDrillQuestion & { carried: DrillCarried | null };
    const door = parsed.carried;
    const asked = withAutoGrain(def, parsed);
    const windowPart = doorWindow(asked, windowAlign);
    if (windowPart.window && door?.windowKey) windowPart.window = { ...windowPart.window, key: door.windowKey };
    const doorShow = countMeasure && !asked.show.includes(countMeasure) ? [...asked.show, countMeasure] : asked.show;
    const where = doorWhere(asked);
    const sortKey = asked.sort && asked.show.includes(asked.sort.key) ? asked.sort.key : asked.show[0];
    const requests = drillRequests(asked);
    const answeredFor = `${askKey}#${version}`;
    const src = JSON.parse(sourceKey) as DrillSource;
    let cancelled = false;
    setError(null);
    const timeKeys = new Set(def.dimensions.filter((d) => d.kind === "time").map((d) => d.key));
    const sortFor = (by: string[]) => doorSort(by, asked.sort ?? null, sortKey, timeKeys);
    const ask = (by: string[], w: Record<string, unknown>) =>
      client.drillAsk({
        source: src,
        question: {
          by,
          show: doorShow,
          // the open view's own filters (lists, ranges) narrow every number, the trail's crumbs on top
          where: { ...(door?.where ?? {}), ...w },
          lane,
          ...windowPart,
          ...carriedAsk(door),
          ...sortFor(by),
        },
      });
    void Promise.all([
      ...requests.map(async (request) => ({ key: request.key, by: request.by, got: await ask(request.by, where) })),
      ...(asked.where.length > 0 ? [ask([], {}).then((got) => ({ key: "__whole__", by: [] as string[], got }))] : []),
    ]).then((results) => {
      if (cancelled) return;
      const failed = results.find((r) => !r.got.ok);
      if (failed && !failed.got.ok) {
        setError(failed.got.error.message || "The answer could not be counted.");
        return;
      }
      const out: Record<string, MatrxDrillAnswerRow[]> = {};
      const sentences: string[] = [];
      let wholeRow: MatrxDrillAnswerRow | null = null;
      let counted: string | null = null;
      const ids: Record<string, Set<string>> = {};
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
        out[r.key] = answer.rows
          .filter((row) => row.kind === kind && (kind === "group" || !row.groups || Object.keys(row.groups).length === 0))
          .map((row) => drillRowOf(row, countMeasure));
        for (const row of answer.rows) for (const [dim, value] of Object.entries(row.groups ?? {})) note(dim, value);
      }
      for (const w of asked.where) note(w.dim, w.value);
      setAnswered({ key: answeredFor, answers: out, whole: wholeRow });
      setSays(sentences);
      setAsOf(counted);
      for (const [key, set] of Object.entries(ids)) {
        const resolver = resolvers?.[key];
        if (!resolver || set.size === 0) continue;
        void resolver.resolve([...set]).then((got) => {
          if (cancelled) return;
          if (!got.ok) {
            setSays((s) => (s.includes(got.message) ? s : [...s, got.message]));
            return;
          }
          setNames((held) => ({ ...held, [key]: { ...(held[key] ?? {}), ...got.names } }));
        });
      }
    });
    return () => {
      cancelled = true;
    };
    // `resolvers` is read through `resolverKeys` (a host passes a fresh object each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, def, askKey, version, lane, sourceKey, resolverKeys, countMeasure, windowAlign]);

  const current = answered.key === `${askKey}#${version}`;
  return { def, answers: current ? answered.answers : NO_ANSWERS, whole: current ? answered.whole : null, names, says, error, asOf, client };
}
