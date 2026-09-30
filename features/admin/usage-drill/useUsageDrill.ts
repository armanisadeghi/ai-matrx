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

import { useEffect, useMemo, useRef, useState } from "react";
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

function rowOf(r: { groups: Record<string, unknown> | null; measures: Record<string, number | string | null> | null; row_count: number; prior_measures?: Record<string, number | string | null> | null; distinct_groups?: number | null }): MatrxDrillAnswerRow {
  const groups: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(r.groups ?? {})) groups[k] = v === null || v === undefined ? null : String(v);
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

export function useUsageDrill(args: {
  organizationId: string | null;
  userId: string | null;
  question: MatrxDrillQuestion;
}): UsageDrill {
  const { organizationId, userId, question } = args;
  const client = useMemo(() => (organizationId ? clientFor(organizationId, userId) : null), [organizationId, userId]);
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

  const recount = useMemo(
    () => async (range: { from: string; to: string }) => {
      if (!organizationId) return;
      setFreshness((f) => ({ ...f, recounting: true, error: null }));
      const { data, error: e } = await supabase.schema("platform").rpc("ai_usage_recount" as never, {
        p_organization_id: organizationId,
        p_from: range.from,
        p_to: range.to,
      } as never);
      if (e) {
        setFreshness((f) => ({ ...f, recounting: false, error: `The usage could not be recounted: ${e.message}` }));
        return;
      }
      const counted = (data as { counted_through?: string } | null)?.counted_through ?? new Date().toISOString();
      setFreshness((f) => ({ ...f, recounting: false, countedThrough: counted }));
      setVersion((v) => v + 1);
    },
    [organizationId],
  );

  // FRESHNESS — the names door also says when the rollup was last counted; stale → recount once.
  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    void supabase
      .schema("platform")
      .rpc("ai_usage_names" as never, { p_organization_id: organizationId, p_ids: {} } as never)
      .then(({ data, error: e }) => {
        if (cancelled) return;
        if (e) {
          setFreshness((f) => ({ ...f, error: `How fresh the usage is could not be read: ${e.message}` }));
          return;
        }
        const d = data as { counted_through: string | null; counted_since: string | null } | null;
        setFreshness((f) => ({ ...f, countedThrough: d?.counted_through ?? null, countedSince: d?.counted_since ?? null }));
        const age = d?.counted_through ? Date.now() - new Date(d.counted_through).getTime() : Infinity;
        if (age > STALE_AFTER_MS && !recountedOnce.current) {
          recountedOnce.current = true;
          void recount({ from: new Date(Date.now() - 48 * 3_600_000).toISOString(), to: new Date().toISOString() });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, recount]);

  const askKey = JSON.stringify({ by: question.by, across: question.across ?? null, show: question.show, where: question.where, window: question.window ?? null, compare: question.compare ?? null });

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
    const requests = drillRequests(asked);
    let cancelled = false;
    setError(null);
    const ask = (by: string[], w: Record<string, unknown>) =>
      client.drillAsk({ source: USAGE_SOURCE, question: { by, show: asked.show, where: w, lane: "platform", ...windowPart } });
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
        .rpc("ai_usage_names" as never, { p_organization_id: organizationId, p_ids: wanted } as never)
        .then(({ data, error: e }) => {
          if (cancelled) return;
          if (e) {
            setSays((s) => [...s, `The names behind these groups could not be read (${e.message}), so they show as ids.`]);
            return;
          }
          const d = data as Record<NamedDimension, Record<string, string>> | null;
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
