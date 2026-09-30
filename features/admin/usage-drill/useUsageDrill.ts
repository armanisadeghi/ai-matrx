"use client";

// features/admin/usage-drill/useUsageDrill.ts — THE USAGE PAGE'S PORT ONTO THE ONE READ DOOR
// (lane DRILL-USAGE-PAGE, DRILL-DOWN-DESIGN §f).
//
// Every number on the page is one `platform.drill_ask` of the declared definition `ai_usage`
// (aidream apps/shared/records/scripts/drill-definitions/ai_usage.drill.ts), asked in the
// PLATFORM lane — a platform admin inside the admin apps; the database refuses anyone else. The
// questions are exactly `drillRequests(question)` (the total, each level, each pivot crossing),
// plus ONE more when the trail narrows: the same question without the trail, so the coverage
// line can say what part of the whole window the slice is.
//
// Names: the definition's person / organization / agent groups are ids; `platform.ai_usage_names`
// reads their words (admin-only). Freshness: the rollup is kept current by the page itself —
// when the names door says it was last counted more than ten minutes ago the page asks
// `platform.ai_usage_recount` for the last 48 hours once (no schedule exists until Arman
// approves one), then asks again.

import { useEffect, useRef, useState } from "react";
import { createRecordsClient, type RecordsClient } from "@ai-matrx/records/core";
import type { DrillDefinition, DrillQuestion, DrillSource } from "@ai-matrx/records";
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

export const USAGE_SOURCE: DrillSource = { kind: "entity", token: "ai_usage" };
/** The Dimensions whose values are ids the names door reads. */
export const NAMED_DIMENSIONS = ["organization", "person", "agent"] as const;
type NamedDimension = (typeof NAMED_DIMENSIONS)[number];
const STALE_AFTER_MS = 10 * 60_000;

const clients = new Map<string, RecordsClient>();
function clientFor(organizationId: string, userId: string | null): RecordsClient {
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

export interface UsageFreshness {
  countedThrough: string | null;
  countedSince: string | null;
  recounting: boolean;
  /** A recount that failed, in words. */
  error: string | null;
}

export interface UsageDrill {
  def: DrillDefinition | null;
  answers: MatrxDrillAnswers;
  /** The same question's total WITHOUT the trail (the coverage line's whole). */
  whole: MatrxDrillAnswerRow | null;
  names: Record<NamedDimension, Record<string, string>>;
  says: string[];
  error: string | null;
  freshness: UsageFreshness;
  recount: (range: { from: string; to: string }) => Promise<void>;
}

/** The trail in the door's words: each crumb is an equality (`null` = not set; a period by its label). */
export function usageWhere(question: MatrxDrillQuestion): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  for (const w of question.where) where[w.dim] = w.value;
  return where;
}

function rowOf(r: { groups: Record<string, unknown> | null; prior_groups?: Record<string, unknown> | null; measures: Record<string, number | string | null> | null; row_count: number; prior_measures?: Record<string, number | string | null> | null; distinct_groups?: number | null }): MatrxDrillAnswerRow {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(value)) return out;
  for (const [k, v] of Object.entries(value)) if (typeof v === "string") out[k] = v;
  return out;
}

/** The names door's answer, read defensively (a jsonb the database shapes). */
function namesOf(data: unknown): Record<NamedDimension, Record<string, string>> {
  const d = isRecord(data) ? data : {};
  return { organization: stringMap(d.organization), person: stringMap(d.person), agent: stringMap(d.agent) };
}

async function readFreshness(organizationId: string): Promise<{ ok: true; countedThrough: string | null; countedSince: string | null } | { ok: false; message: string }> {
  const { data, error } = await supabase.schema("platform").rpc("ai_usage_names", { p_organization_id: organizationId, p_ids: {} });
  if (error) return { ok: false, message: `How fresh the usage is could not be read: ${error.message}` };
  const d = isRecord(data) ? data : {};
  return {
    ok: true,
    countedThrough: typeof d.counted_through === "string" ? d.counted_through : null,
    countedSince: typeof d.counted_since === "string" ? d.counted_since : null,
  };
}

/** Rebuild the rollup for a window (at most 100 days; the door refuses more in words). */
async function askRecount(organizationId: string, range: { from: string; to: string }): Promise<{ ok: true; countedThrough: string } | { ok: false; message: string }> {
  const { data, error } = await supabase.schema("platform").rpc("ai_usage_recount", { p_organization_id: organizationId, p_from: range.from, p_to: range.to });
  if (error) return { ok: false, message: `The usage could not be recounted: ${error.message}` };
  const d = isRecord(data) ? data : {};
  return { ok: true, countedThrough: typeof d.counted_through === "string" ? d.counted_through : new Date().toISOString() };
}

export function useUsageDrill(args: {
  organizationId: string | null;
  userId: string | null;
  question: MatrxDrillQuestion;
}): UsageDrill {
  const { organizationId, userId, question } = args;
  const client = organizationId ? clientFor(organizationId, userId) : null;
  const [def, setDef] = useState<DrillDefinition | null>(null);
  const [answers, setAnswers] = useState<MatrxDrillAnswers>({});
  const [whole, setWhole] = useState<MatrxDrillAnswerRow | null>(null);
  const [names, setNames] = useState<Record<NamedDimension, Record<string, string>>>({ organization: {}, person: {}, agent: {} });
  const [says, setSays] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [freshness, setFreshness] = useState<UsageFreshness>({ countedThrough: null, countedSince: null, recounting: false, error: null });
  const [version, setVersion] = useState(0);
  const recountedOnce = useRef(false);

  // THE DEFINITION — once per organization.
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    void client.drillDescribe({ source: USAGE_SOURCE }).then((got) => {
      if (cancelled) return;
      if (got.ok) setDef(got.data ?? null);
      else setError(got.error.message || "The usage definition could not be read.");
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

  // FRESHNESS — the names door also says when the rollup was last counted; stale → recount the
  // last 48 hours once, then every answer is asked again (`version`).
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    void readFreshness(organizationId).then(async (got) => {
      if (cancelled) return;
      if (!got.ok) {
        setFreshness((f) => ({ ...f, error: got.message }));
        return;
      }
      setFreshness((f) => ({ ...f, countedThrough: got.countedThrough, countedSince: got.countedSince }));
      const age = got.countedThrough ? Date.now() - new Date(got.countedThrough).getTime() : Infinity;
      if (age <= STALE_AFTER_MS || recountedOnce.current) return;
      recountedOnce.current = true;
      setFreshness((f) => ({ ...f, recounting: true, error: null }));
      const done = await askRecount(organizationId, { from: new Date(Date.now() - 48 * 3_600_000).toISOString(), to: new Date().toISOString() });
      if (cancelled) return;
      setFreshness((f) => ({ ...f, recounting: false, ...(done.ok ? { countedThrough: done.countedThrough } : { error: done.message }) }));
      if (done.ok) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  const recount = async (range: { from: string; to: string }) => {
    if (!organizationId) return;
    setFreshness((f) => ({ ...f, recounting: true, error: null }));
    const done = await askRecount(organizationId, range);
    setFreshness((f) => ({ ...f, recounting: false, ...(done.ok ? { countedThrough: done.countedThrough } : { error: done.message }) }));
    if (done.ok) setVersion((v) => v + 1);
  };

  const askKey = JSON.stringify({ by: question.by, across: question.across ?? null, show: question.show, where: question.where, window: question.window ?? null, compare: question.compare ?? null, sort: question.sort ?? null });

  // THE ANSWERS — every request the table needs, plus the whole (no trail) for coverage.
  useEffect(() => {
    if (!client || !def || question.by.length === 0) return;
    const asked = JSON.parse(askKey) as MatrxDrillQuestion;
    const range = drillWindowRange(asked.window ?? null);
    const windowPart: Pick<DrillQuestion, "window" | "compare"> = range
      ? {
          window: { key: "at", from: range.from, to: range.to },
          ...(asked.compare ? { compare: { against: asked.compare, from: range.from, to: range.to } } : {}),
        }
      : {};
    const where = usageWhere(asked);
    const sortKey = asked.sort && asked.show.includes(asked.sort.key) ? asked.sort.key : asked.show[0];
    const requests = drillRequests(asked);
    let cancelled = false;
    setError(null);
    const ask = (by: string[], w: Record<string, unknown>) =>
      client.drillAsk({
        source: USAGE_SOURCE,
        question: {
          by,
          show: asked.show,
          where: w,
          lane: "platform",
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
        setError(failed.got.error.message || "The usage could not be counted.");
        return;
      }
      const out: Record<string, MatrxDrillAnswerRow[]> = {};
      const sentences: string[] = [];
      let wholeRow: MatrxDrillAnswerRow | null = null;
      const ids: Record<NamedDimension, Set<string>> = { organization: new Set(), person: new Set(), agent: new Set() };
      for (const r of results) {
        if (!r.got.ok) continue;
        const answer = r.got.data!;
        for (const s of answer.says) if (!sentences.includes(s)) sentences.push(s);
        if (r.key === "__whole__") {
          wholeRow = answer.total ? rowOf(answer.total) : null;
          continue;
        }
        const kind = r.by.length === 0 ? "total" : "group";
        out[r.key] = answer.rows
          .filter((row) => row.kind === kind && (kind === "group" || !row.groups || Object.keys(row.groups).length === 0))
          .map(rowOf);
        for (const row of answer.rows) {
          for (const [dim, value] of Object.entries(row.groups ?? {})) {
            const key = parseDimensionRef(dim).key as NamedDimension;
            if ((NAMED_DIMENSIONS as readonly string[]).includes(key) && typeof value === "string") ids[key].add(value);
          }
        }
      }
      for (const w of asked.where) {
        const key = parseDimensionRef(w.dim).key as NamedDimension;
        if ((NAMED_DIMENSIONS as readonly string[]).includes(key) && w.value) ids[key].add(w.value);
      }
      setAnswers(out);
      setWhole(wholeRow);
      setSays(sentences);
      const wanted = { organization: [...ids.organization], person: [...ids.person], agent: [...ids.agent] };
      if (wanted.organization.length + wanted.person.length + wanted.agent.length === 0) return;
      void supabase
        .schema("platform")
        .rpc("ai_usage_names", { p_organization_id: organizationId!, p_ids: wanted })
        .then(({ data, error: e }) => {
          if (cancelled) return;
          if (e) {
            setSays((s) => [...s, `The names behind these groups could not be read (${e.message}), so they show as ids.`]);
            return;
          }
          const d = namesOf(data);
          setNames((held) => ({
            organization: { ...held.organization, ...(d?.organization ?? {}) },
            person: { ...held.person, ...(d?.person ?? {}) },
            agent: { ...held.agent, ...(d?.agent ?? {}) },
          }));
        });
    });
    return () => {
      cancelled = true;
    };
  }, [client, def, askKey, version, organizationId, question.by.length]);

  return { def, answers, whole, names, says, error, freshness, recount };
}
