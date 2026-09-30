"use client";

// components/official/drill-explorer/useDrillReconcile.ts — ONE NUMBER, RECONCILED AGAINST ANOTHER
// DEFINITION'S (lane DRILL-ADOPT; program DRILL-FINISH decisions 12 and 29; VERIFY-DRILL-WAVE2 W2-3).
//
// Two definitions can both be true of different things: the AI usage ledger (`ai_usage`, what the
// platform SPENT, every execution) and the model calls (`ai_calls`, one row per model call). The
// explorer states how they reconcile, from TWO asks of the one door for the same window and the same
// filters — the header's own total, and the other definition's Measure — and builds its words from
// the measured parts and the definitions' own labels. Nothing is hard-coded but the sentence's shape.
//
// Only the filters both definitions read with the same values carry across (`shared`, e.g. a person
// or an organization id, or a period). A crumb the other definition cannot narrow by is SAID and the
// line is left out, never computed over a different slice.

import { useEffect, useState } from "react";
import type { DrillSource } from "@ai-matrx/records";
import type { RecordsClient } from "@ai-matrx/records/core";
import { parseDimensionRef, type MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { doorWindow } from "./useDrillExplorer";
import { doorWhere } from "./types";
import type { DrillCarried } from "./questionParts";

export interface DrillReconcileSpec {
  /** The other definition. */
  source: DrillSource;
  /** Its Measure compared with the headline ("cost"). */
  measure: string;
  /** Dimension keys both definitions read with the same values (ids, periods). */
  shared: readonly string[];
}

export type DrillReconcileState =
  | { state: "idle" }
  | { state: "counting" }
  /** The other definition's words and its measured value for the same window and filters. */
  | { state: "counted"; label: string; value: number }
  /** Why the line is left out, in words. */
  | { state: "said"; sentence: string };

export function useDrillReconcile(args: {
  client: RecordsClient | null;
  lane: "mine" | "organization" | "platform";
  spec: DrillReconcileSpec | null | undefined;
  /** The question on screen (auto grain applied). */
  question: MatrxDrillQuestion;
  carried: DrillCarried | null;
  windowAlign?: "hour" | undefined;
  /** Words for a Dimension key ("Model"). */
  labelOf: (key: string) => string;
  version?: number | undefined;
  enabled: boolean;
}): DrillReconcileState {
  const { client, lane, spec, question, carried, windowAlign, labelOf, version = 0, enabled } = args;
  const shared = new Set(spec?.shared ?? []);
  const crumbs = question.where.map((w) => parseDimensionRef(w.dim).key);
  const carriedKeys = Object.keys(carried?.where ?? {}).map((k) => parseDimensionRef(k).key);
  const unshared = [...new Set([...crumbs, ...carriedKeys].filter((k) => !shared.has(k)))];
  const key = JSON.stringify({ spec: spec ?? null, where: question.where, window: question.window ?? null, carried: carried?.where ?? null, lane, version, windowAlign: windowAlign ?? null });
  const [held, setHeld] = useState<{ key: string; state: DrillReconcileState }>({ key: "", state: { state: "idle" } });

  useEffect(() => {
    if (!client || !spec || !enabled || unshared.length > 0) return;
    let cancelled = false;
    const windowPart = doorWindow(question, windowAlign);
    void Promise.all([
      client.drillDescribe({ source: spec.source }),
      client.drillAsk({
        source: spec.source,
        question: { by: [], show: [spec.measure], where: { ...(carried?.where ?? {}), ...doorWhere(question) }, lane, ...(windowPart.window ? { window: windowPart.window } : {}) },
      }),
    ]).then(([described, asked]) => {
      if (cancelled) return;
      if (!described.ok || !asked.ok) {
        const message = (!described.ok ? described.error.message : !asked.ok ? asked.error.message : "") || "no answer";
        setHeld({ key, state: { state: "said", sentence: `How this number reconciles with the ${spec.source.kind === "entity" ? spec.source.token.replace(/_/g, " ") : "other count"} could not be counted: ${message}` } });
        return;
      }
      const total = asked.data!.rows.find((r) => r.kind === "total") ?? asked.data!.rows[0];
      const raw = total?.measures?.[spec.measure];
      const value = raw === null || raw === undefined ? 0 : Number(raw);
      setHeld({ key, state: { state: "counted", label: described.data?.label ?? spec.measure, value } });
    });
    return () => {
      cancelled = true;
    };
    // `question`, `carried` and `spec` are read through `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key, enabled, unshared.length]);

  if (!spec || !enabled) return { state: "idle" };
  if (unshared.length > 0) {
    return { state: "said", sentence: `The reconciliation with the other count is left out: it cannot be narrowed by ${unshared.map((k) => labelOf(k).toLowerCase()).join(" or ")}.` };
  }
  return held.key === key ? held.state : { state: "counting" };
}

/**
 * The reconciliation in words, from the two measured parts: "31,200,000 points of these 47,893,508 points
 * are AI model calls; 16,693,508 points (35%) is spend with no model call behind it." `format` prints a
 * value as the screen does. A negative rest (more calls than ledger) is said as such.
 */
export function drillReconcileSentence(ledger: number, other: number, otherLabel: string, format: (v: number) => string): string {
  const rest = ledger - other;
  const pct = ledger > 0 ? Math.round((Math.abs(rest) / ledger) * 100) : null;
  // "Model calls" → "model calls"; an acronym keeps its case ("AI model calls")
  const what = /^[A-Z][a-z]/.test(otherLabel) ? otherLabel.charAt(0).toLowerCase() + otherLabel.slice(1) : otherLabel;
  if (rest >= 0) {
    return `${format(other)} of these ${format(ledger)} are ${what}; ${format(rest)}${pct !== null ? ` (${pct}%)` : ""} is spend with no ${what.replace(/s$/, "")} behind it.`;
  }
  return `The ${what} count ${format(other)}, ${format(-rest)} more than these ${format(ledger)}: calls whose spend the ledger has not recorded in this window.`;
}
