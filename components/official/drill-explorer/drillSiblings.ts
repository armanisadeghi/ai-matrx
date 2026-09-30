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
import { drillQuestionToParams, type MatrxDrillDimension, type MatrxDrillMeasure, type MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

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

/** A sibling's Dimensions as the answer primitives read them, with the words its answers named. */
export function drillSiblingDimensions(
  def: DrillDefinition,
  names: Record<string, Record<string, string>>,
  resolvers: Record<string, DrillNameResolver> | undefined,
): MatrxDrillDimension[] {
  return def.dimensions.map((d) => {
    const dim: MatrxDrillDimension = { key: d.key, label: d.label, kind: d.kind };
    if (d.cardinality) dim.cardinality = d.cardinality;
    if (d.grains) dim.grains = d.grains as NonNullable<MatrxDrillDimension["grains"]>;
    const labelFor = drillDimensionLabelFor(d, { names: names[d.key], resolver: resolvers?.[d.key] });
    if (labelFor) dim.labelFor = labelFor;
    return dim;
  });
}

/** A sibling's Measures, formatted by unit exactly as the explorer formats its own. */
export function drillSiblingMeasures(def: DrillDefinition, money: DrillMoneyUnit): MatrxDrillMeasure[] {
  return def.measures.map((m) => ({
    key: m.key,
    label: m.unit === "usd" ? costColumnLabel(m.label, money) : m.label,
    additive: m.additive ?? (["count", "sum", "filled", "empty"].includes(m.op) && drillUnitAdds(m.unit)),
    format: drillUnitFormatter(m.unit, money),
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
