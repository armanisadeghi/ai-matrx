"use client";

// components/official/drill-explorer/useDrillAttributes.ts — A GROUP'S ATTRIBUTES AT A GLANCE (lane
// DRILL-FLIP-FIXES, VERIFY-DRILL-FINAL R2: the Spend Explorer's 40 costliest requests showed each
// request's person, agent, feature, model, provider, origin, outcome, organization and app as columns).
//
// A built-in view declares `attributes` (records DrillView): Dimensions each outermost group holds ONE
// value of. While that view's grouping is on screen, the explorer asks the SAME door — same lane,
// window, view filters and trail — once per attribute, grouped by the outer Dimension and the
// attribute, narrowed to the groups shown; each value reads as the door's label, the host's name
// resolver (a person) or the Dimension's own words. A group holding several values says "Several".
// The package draws the columns (`MatrxDrillAnswerTable` `attributes`).

import { useEffect, useState } from "react";
import type { DrillSource } from "@ai-matrx/records";
import type { RecordsClient } from "@ai-matrx/records/core";
import type { MatrxDrillAnswers, MatrxDrillAttribute, MatrxDrillDimension, MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";
import { drillRequestKey } from "@ai-matrx/design-system/data-table";

import { drillDoorLabels } from "./dimensionWords";
import type { DrillCarried } from "./questionParts";
import { doorWhere, type DrillNameResolver } from "./types";
import { useDrillNameBookOr, useDrillNames, type DrillNameBook } from "./drillNames";
import { doorWindow, drillWindowKey } from "./useDrillExplorer";
import { drillFailureWords } from "./explorerWords";

/** group value → attribute key → the values it holds */
type Held = Record<string, Record<string, Set<string | null>>>;

export function useDrillAttributes(args: {
  client: RecordsClient | null;
  source: DrillSource;
  lane: "mine" | "organization" | "platform";
  question: MatrxDrillQuestion;
  dimensions: readonly MatrxDrillDimension[];
  answers: MatrxDrillAnswers;
  /** The open view's declared attributes; none = no columns. */
  attributes: readonly string[] | undefined;
  carried: DrillCarried | null;
  resolvers: Record<string, DrillNameResolver> | undefined;
  /** The explorer's one name book (drillNames.ts); absent = one of this hook's own over `resolvers`. */
  book?: DrillNameBook | undefined;
  windowAlign?: "hour" | undefined;
}): MatrxDrillAttribute[] | undefined {
  const { client, source, lane, question, dimensions, answers, attributes, carried, resolvers, windowAlign } = args;
  const book = useDrillNameBookOr(args.book, resolvers);
  const names = useDrillNames(book);
  const outer = question.by[0];
  const wanted = outer && !question.across ? (attributes ?? []).filter((a) => a !== outer && dimensions.some((d) => d.key === a)) : [];
  const groups = outer ? (answers[drillRequestKey([outer])] ?? []).map((r) => r.groups[outer] ?? null).filter((v): v is string => typeof v === "string") : [];
  const key = JSON.stringify({ outer, wanted, groups, where: question.where, window: question.window ?? null, carried: carried ?? null, lane, source });
  // A FAILED READ IS SAID (lane DRILL-PRIMITIVE-2): per attribute, why it was not read — never an empty "—".
  const [held, setHeld] = useState<{ key: string; values: Held; failed: Record<string, string> }>({ key: "", values: {}, failed: {} });

  useEffect(() => {
    if (!client || !outer || wanted.length === 0 || groups.length === 0) return;
    let cancelled = false;
    const windowPart = doorWindow({ by: [], show: [], where: [], window: question.window ?? null }, { key: drillWindowKey(dimensions, carried), align: windowAlign });
    // ONE ASK FOR EVERY GLANCE COLUMN (lane DRILL-LIVE-FIX-2 #3): grouped by the outer Dimension and
    // every attribute at once, so the door scans the window once — two asks (agent, person) were two
    // full scans racing the answer's own, and the columns read "…" for 15–40 s on all-people by conversation.
    void client
      .drillAsk({
        source,
        question: {
          by: [outer, ...wanted],
          where: { ...(carried?.where ?? {}), ...doorWhere(question), [outer]: groups },
          lane,
          // every combination the groups hold (a conversation with two people is two rows), capped
          limit: Math.min(groups.length * 4, 2000),
          ...windowPart,
        },
      })
      .catch((e: unknown) => ({ ok: false as const, error: { message: e instanceof Error ? e.message : "" } }))
      .then((got) => {
      if (cancelled) return;
      const values: Held = {};
      const failed: Record<string, string> = {};
      const why = got.ok ? null : drillFailureWords(got.error?.message, "Not read");
      const rows = got.ok ? got.data!.rows : [];
      for (const attr of wanted) {
        if (why) failed[attr] = why;
        for (const row of rows) {
          if (row.kind !== "group" || !row.groups) continue;
          const g = row.groups[outer];
          if (typeof g !== "string") continue;
          const v = row.groups[attr];
          (((values[g] ??= {})[attr] ??= new Set()) as Set<string | null>).add(typeof v === "string" ? v : v === null || v === undefined ? null : String(v));
        }
      }
      book.learn(drillDoorLabels(rows));
      // a person's name is the host resolver's (the door carries none for people), through the ONE book
      for (const attr of wanted) void book.want(attr, Object.values(values).flatMap((v) => [...(v[attr] ?? [])]));
      if (!cancelled) setHeld({ key, values, failed });
    });
    return () => {
      cancelled = true;
    };
    // the asks are keyed by `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, key]);

  if (!outer || wanted.length === 0) return undefined;
  const ready = held.key === key;
  return wanted.map((attr) => {
    const dim = dimensions.find((d) => d.key === attr)!;
    return {
      key: attr,
      label: dim.label,
      ...(dim.description ? { description: dim.description } : {}),
      ...(ready && held.failed[attr] ? { error: held.failed[attr] } : {}),
      read: (g: Record<string, string | null>) => {
        if (!ready) return undefined;
        const id = g[outer];
        const set = id ? held.values[id]?.[attr] : undefined;
        if (!set || set.size === 0) return null;
        if (set.size > 1) return "Several";
        const [v] = [...set];
        if (v === null || v === undefined) return dim.labelFor ? dim.labelFor(null) : null;
        return names[attr]?.[v] ?? (dim.labelFor ? dim.labelFor(v) : v);
      },
    };
  });
}
