"use client";

// components/official/drill-explorer/drillSiblings.ts — ONE SCREEN, SEVERAL DEFINITIONS (lane
// DRILL-PRESETS-RETIRE; VERIFY-DRILL-LIVE F2).
//
// A mount may name SIBLING definitions: other grains of the same subject (AI usage: the hourly ledger
// `ai_usage`, the ledger per execution `ai_usage_executions`, the model calls `ai_calls`). The explorer
// describes each sibling once and offers what it declares where the person already looks:
//
//   Saved views   each sibling's built-in views, in a group of their own under the sibling's name
//   Findings      each sibling's findings, in the same panel, answered through the sibling's door
//
// Opening either goes to the sibling's own address (the host's `go`): the host switches the
// explorer's source there (`?def=<token>`), and the address carries the view or the drilled question.
// So the screen never asks one definition's door with another definition's question.

import { useEffect, useState } from "react";
import type { DrillDefinition, DrillSource } from "@ai-matrx/records";
import type { RecordsClient } from "@ai-matrx/records/core";
import { drillQuestionToParams, parseDimensionRef, type MatrxDrillDimension, type MatrxDrillMeasure, type MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { costColumnLabel } from "./DrillExplorerHeadline";
import { drillDimensionLabelFor } from "./dimensionWords";
import { drillUnitAdds, drillUnitFormatter, type DrillMoneyUnit } from "./measureFormat";
import type { DrillNameResolver } from "./types";

/** A sibling definition a mount offers beside its own. */
export interface DrillSibling {
  /** The registry token the door answers (`ai_calls`). */
  token: string;
  /** The group's name in the menus ("Model calls"). */
  group: string;
  /** Open the explorer on this sibling (the host navigates): its view, or a question in the address grammar. */
  go: (open: { view?: string; params?: URLSearchParams }) => void;
}

export interface DrillSiblingDefinition extends DrillSibling {
  source: DrillSource;
  def: DrillDefinition;
}

/** Describe every sibling once per client; a sibling the door refuses is simply not offered. */
export function useDrillSiblings(client: RecordsClient | null, siblings: readonly DrillSibling[] | undefined): DrillSiblingDefinition[] {
  const key = (siblings ?? []).map((s) => s.token).join(",");
  const [held, setHeld] = useState<{ key: string; defs: Record<string, DrillDefinition> }>({ key: "", defs: {} });
  useEffect(() => {
    if (!client || !key) return;
    let cancelled = false;
    for (const token of key.split(",")) {
      void client.drillDescribe({ source: { kind: "entity", token } }).then((got) => {
        if (cancelled || !got.ok || !got.data) return;
        setHeld((h) => ({ key, defs: { ...(h.key === key ? h.defs : {}), [token]: got.data! } }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [client, key]);
  if (held.key !== key) return [];
  return (siblings ?? []).flatMap((s) => {
    const def = held.defs[s.token];
    return def ? [{ ...s, source: { kind: "entity", token: s.token } as DrillSource, def }] : [];
  });
}

/**
 * A definition's Dimensions as the answer primitives read them, with the words its answers named —
 * the ONE mapping the explorer and its siblings share (lane DRILL-WIRE): a relation names its record
 * kind (`entity`, so a group row offers that record's doors and its kind's menu) and a choice keeps its
 * declared chart token (`colorFor`, on the chart series and the share bars).
 */
export function drillSiblingDimensions(
  def: DrillDefinition,
  names: Record<string, Record<string, string>>,
  resolvers: Record<string, DrillNameResolver> | undefined,
  hostWords?: Record<string, (value: string) => string> | undefined,
): MatrxDrillDimension[] {
  return def.dimensions.map((d) => {
    const dim: MatrxDrillDimension = { key: d.key, label: d.label, kind: d.kind };
    if (d.cardinality) dim.cardinality = d.cardinality;
    // what it groups by, as the header's tooltip (lane DRILL-FLIP-FIXES L2)
    if (d.description) dim.description = d.description;
    if (d.grains) dim.grains = d.grains as NonNullable<MatrxDrillDimension["grains"]>;
    // WHAT A LEVEL OF IT LOOKS LIKE (lane DRILL-LEVELS): its breakouts, Measures, attributes, records
    if (d.level) dim.level = d.level;
    // KEYS NEVER REACH A PERSON (VERIFIER-32 F5): an id reads as the door's label or the resolver's
    // name, a code as the definition's choice label — never the id or the code itself.
    const labelFor = drillDimensionLabelFor(d, { names: names[d.key], resolver: resolvers?.[d.key], hostWords: hostWords?.[d.key] });
    if (labelFor) dim.labelFor = labelFor;
    if (d.kind === "relation" && d.relation?.token) dim.entity = d.relation.token;
    const colors = new Map((d.choices ?? []).flatMap((c) => (c.color ? [[c.value, c.color] as const] : [])));
    if (colors.size > 0) dim.colorFor = (value) => (value === null ? null : colors.get(value) ?? null);
    return dim;
  });
}

/**
 * A definition's Measures, formatted by unit — the ONE mapping the explorer and its siblings share. A
 * moment (`unit: "time"`, "Last active") is never a share, a change or a Pareto line.
 */
export function drillSiblingMeasures(def: DrillDefinition, money: DrillMoneyUnit, rate: number | null): MatrxDrillMeasure[] {
  return def.measures.map((m) => ({
    key: m.key,
    // The column's unit word is the one its cells print (VERIFY-DRILL-WAVE1 F9).
    label: m.unit === "usd" ? costColumnLabel(m.label, money) : m.label,
    // a ratio, a percentile, a run rate, an average or a moment is recomputed per group, never added up
    additive: m.additive ?? (["count", "sum", "filled", "empty"].includes(m.op) && drillUnitAdds(m.unit)),
    format: drillUnitFormatter(m.unit, money, rate),
    // what the number counts, as the header's tooltip (lane DRILL-FLIP-FIXES R5, L2)
    ...(m.description ? { description: m.description } : {}),
    ...(m.unit === "usd" ? { lowerIsBetter: true } : {}),
    ...(m.unit === "time" ? { moment: true, additive: false } : {}),
  }));
}

/** Go to a sibling: its view, or a drilled question written in the address grammar. */
export function openDrillSibling(sibling: DrillSibling, open: { view?: string; question?: MatrxDrillQuestion }): void {
  let params: URLSearchParams | undefined;
  if (open.question) {
    params = new URLSearchParams();
    for (const [k, v] of Object.entries(drillQuestionToParams(open.question, new URLSearchParams()))) if (v !== null) params.set(k, v);
  }
  sibling.go({ ...(open.view ? { view: open.view } : {}), ...(params ? { params } : {}) });
}

/**
 * The question a sibling is opened with when it is asked by `refs` (ONE rule for the cross-definition
 * chip and the address that names a sibling's Dimension): grouped as asked where the sibling has the
 * Dimension, the filters it has kept, the window kept, and the level's Measures (else the ones it
 * shares with this question, else its first).
 */
export function drillSiblingQuestion(sibling: Pick<DrillSiblingDefinition, "def">, q: MatrxDrillQuestion, by?: readonly string[]): MatrxDrillQuestion {
  const sibDims = sibling.def.dimensions;
  const has = (r: string) => sibDims.some((d) => d.key === parseDimensionRef(r).key);
  const groupBy = (by ?? q.by).filter(has);
  const lead = groupBy[0];
  const levelShow = lead ? sibDims.find((d) => d.key === parseDimensionRef(lead).key)?.level?.show : undefined;
  const shared = q.show.filter((k) => sibling.def.measures.some((m) => m.key === k));
  const show = levelShow && levelShow.length > 0 ? [...levelShow] : shared.length > 0 ? shared : sibling.def.measures.slice(0, 1).map((m) => m.key);
  return {
    by: groupBy,
    ...(!by && q.across && has(q.across) ? { across: q.across } : {}),
    show,
    where: q.where.filter((w) => has(w.dim)),
    window: q.window ?? null,
  };
}

/**
 * AN ADDRESS NAMING A DIMENSION THIS DEFINITION LACKS (lane DRILL-LIVE-FIX-2 #2): `?by=conversation` on
 * /administration/usage (ai_usage has no conversation; its sibling ai_usage_executions does) goes to the
 * sibling that has every such Dimension, with the filters kept. One no sibling has is said in words —
 * never a refused ask. `complete` = every sibling has been described (else nothing is decided yet).
 */
export function drillAddressMisfit(
  def: { label: string; dimensions: ReadonlyArray<{ key: string; level?: { breakouts?: readonly string[] | undefined } | undefined }> },
  siblings: readonly DrillSiblingDefinition[],
  q: MatrxDrillQuestion,
  complete: boolean,
): { route: DrillSiblingDefinition; question: MatrxDrillQuestion } | { sentence: string } | null {
  const own = (r: string) => def.dimensions.some((d) => d.key === parseDimensionRef(r).key);
  const asked = [...q.by, ...(q.across ? [q.across] : []), ...q.where.map((w) => w.dim)];
  const missing = [...new Set(asked.filter((r) => !own(r)).map((r) => parseDimensionRef(r).key))];
  if (missing.length === 0) return null;
  const able = siblings.filter((s) => missing.every((k) => s.def.dimensions.some((d) => d.key === k)));
  // the sibling this definition's own cross-definition breakouts name ("ai_usage_executions:conversation") first
  const named = new Set(def.dimensions.flatMap((d) => (d.level?.breakouts ?? []).filter((b) => b.includes(":")).map((b) => b.split(":")[0])));
  const route = able.find((s) => named.has(s.token)) ?? able[0];
  if (route) return { route, question: drillSiblingQuestion(route, q) };
  if (!complete) return null;
  return { sentence: `${def.label} has no ${missing.map((k) => `“${k}”`).join(" or ")} to ask by.` };
}
