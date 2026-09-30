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
export function drillRowOf(r: Pick<RawRow, "groups" | "measures" | "row_count"> & Partial<Pick<RawRow, "prior_groups" | "prior_measures" | "distinct_groups">>): MatrxDrillAnswerRow {
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
    row_count: Number(r.row_count ?? 0),
    ...(r.prior_measures ? { prior_measures: num(r.prior_measures) } : {}),
    ...(r.distinct_groups !== undefined ? { distinct_groups: r.distinct_groups } : {}),
  };
}

/** The window of an address question in the door's words (and the comparison with it). */
export function doorWindow(question: MatrxDrillQuestion): Pick<DrillQuestion, "window" | "compare"> {
  const range = drillWindowRange(question.window ?? null);
  if (!range) return {};
  return {
    window: { key: "at", from: range.from, to: range.to },
    ...(question.compare ? { compare: { against: question.compare, from: range.from, to: range.to } } : {}),
  };
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
}): DrillExplorerData {
  const { source, lane, organizationId, userId, question, names: resolvers, version = 0 } = args;
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

  const askKey = JSON.stringify({ by: question.by, across: question.across ?? null, show: question.show, where: question.where, window: question.window ?? null, compare: question.compare ?? null, sort: question.sort ?? null });
  const resolverKeys = Object.keys(resolvers ?? {}).sort().join(",");

  // THE ANSWERS — every request the table needs, plus the whole (no trail) for coverage.
  useEffect(() => {
    if (!client || !def || question.by.length === 0) return;
    const asked = withAutoGrain(def, JSON.parse(askKey) as MatrxDrillQuestion);
    const windowPart = doorWindow(asked);
    const where = doorWhere(asked);
    const sortKey = asked.sort && asked.show.includes(asked.sort.key) ? asked.sort.key : asked.show[0];
    const requests = drillRequests(asked);
    const answeredFor = `${askKey}#${version}`;
    const src = JSON.parse(sourceKey) as DrillSource;
    let cancelled = false;
    setError(null);
    const ask = (by: string[], w: Record<string, unknown>) =>
      client.drillAsk({
        source: src,
        question: {
          by,
          show: asked.show,
          where: w,
          lane,
          ...windowPart,
          // the door keeps the top groups BY THIS (the rest fold into Other), so it ranks as the table sorts
          ...(sortKey ? { sort: { key: sortKey, direction: asked.sort?.direction ?? "desc" } } : {}),
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
          wholeRow = answer.total ? drillRowOf(answer.total) : null;
          continue;
        }
        const kind = r.by.length === 0 ? "total" : "group";
        out[r.key] = answer.rows
          .filter((row) => row.kind === kind && (kind === "group" || !row.groups || Object.keys(row.groups).length === 0))
          .map(drillRowOf);
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
  }, [client, def, askKey, version, lane, sourceKey, resolverKeys, question.by.length]);

  const current = answered.key === `${askKey}#${version}`;
  return { def, answers: current ? answered.answers : NO_ANSWERS, whole: current ? answered.whole : null, names, says, error, asOf, client };
}
