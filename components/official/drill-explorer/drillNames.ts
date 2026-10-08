"use client";

// components/official/drill-explorer/drillNames.ts — THE EXPLORER'S ONE NAME BOOK (lane DRILL-D1;
// VERIFY-DRILL-FINAL "Deployed re-verify" D1).
//
// Every relation value the explorer draws — the answer, the chart, the trail, the records, the
// glance columns, its own findings and a sibling definition's findings — reads its words from ONE
// book. Whoever puts ids on screen hands the book the door rows they came in (`readRows`) or the ids
// themselves (`want`); the book keeps the door's own labels and asks the host's resolver (the names
// door: a person, a request, a sign-in session) for exactly the ids it has not named yet, once each,
// batched per tick. A resolver that fails, throws, or answers without an id names that id with its
// `unreadLabel` — so no value stays "Reading the name…" after the read is over.
//
// Before this book each surface held its own names; the findings held none, so on production
// 20 of 31 Findings rows on ai_usage_executions read "Reading the name…" forever (2026-10-01).

import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { parseDimensionRef } from "@ai-matrx/design-system/data-table";

import { drillDoorLabels } from "./dimensionWords";
import type { DrillNameResolver } from "./types";

/** Dimension key → id → words. */
export type DrillNames = Record<string, Record<string, string>>;

/** How an id reads once its read is over and named nothing, when the resolver declares no words. */
export const DRILL_NAME_UNREAD = "Name could not be read";
/** The names door reads at most 3,000 ids at once; one read asks at most this many per Dimension. */
const BATCH = 500;

type DoorRow = { groups?: Record<string, unknown> | null; prior_groups?: Record<string, unknown> | null; labels?: Record<string, unknown> | null };

export interface DrillNameBook {
  /** The names so far (a new object on every change). */
  names: () => DrillNames;
  subscribe: (listener: () => void) => () => void;
  /** Whether the host names this Dimension's ids (a resolver is registered for it). */
  resolves: (dim: string) => boolean;
  /** Keep words the door already said (relation `labels`, a crumb's lookup). */
  learn: (found: DrillNames) => void;
  /**
   * Ask the host's resolver for these ids of one Dimension — only the ones not named and not already
   * asked. Resolves with the resolver's failure message, or null.
   */
  want: (dim: string, ids: Iterable<unknown>) => Promise<string | null>;
  /** Door rows on screen: keep their labels, then ask the resolver for every id still unnamed. */
  readRows: (rows: readonly DoorRow[]) => Promise<string[]>;
  /** The host's resolvers as of its latest render (a host passes a fresh object each render). */
  setResolvers: (resolvers: Record<string, DrillNameResolver> | undefined) => void;
}

/** A book over the host's resolvers (replaced by `setResolvers`, so a fresh object per render is fine). */
export function createDrillNameBook(initial: Record<string, DrillNameResolver> | undefined): DrillNameBook {
  let resolvers = initial;
  const current = () => resolvers;
  let names: DrillNames = {};
  const listeners = new Set<() => void>();
  const asked = new Map<string, Set<string>>();
  const queued = new Map<string, { ids: Set<string>; waiters: Array<(message: string | null) => void> }>();
  let flushing = false;

  const emit = () => listeners.forEach((l) => l());
  const put = (dim: string, map: Record<string, string>) => {
    const fresh = Object.entries(map).filter(([id, words]) => words && names[dim]?.[id] !== words);
    if (fresh.length === 0) return;
    names = { ...names, [dim]: { ...(names[dim] ?? {}), ...Object.fromEntries(fresh) } };
    emit();
  };

  const read = async (dim: string, ids: string[]): Promise<string | null> => {
    const resolver = current()?.[dim];
    if (!resolver) return null;
    const unread = resolver.unreadLabel ?? DRILL_NAME_UNREAD;
    let message: string | null = null;
    // THE BATCHES ARE READ AT ONCE (lane DRILL-LIVE-FIX-2 #3), never one after another, and each lands
    // as soon as it is back: a page of 2,000 ids was four reads in a row before any name showed.
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += BATCH) chunks.push(ids.slice(i, i + BATCH));
    await Promise.all(
      chunks.map(async (chunk) => {
        let got: Awaited<ReturnType<DrillNameResolver["resolve"]>>;
        try {
          got = await resolver.resolve(chunk);
        } catch (e) {
          got = { ok: false, message: e instanceof Error ? e.message : "The names could not be read." };
        }
        if (!got.ok) message = got.message;
        const named: Record<string, string> = {};
        for (const id of chunk) named[id] = (got.ok ? got.names[id] : undefined) || names[dim]?.[id] || unread;
        put(dim, named);
      }),
    );
    return message;
  };

  const flush = () => {
    flushing = false;
    const batches = [...queued.entries()];
    queued.clear();
    for (const [dim, { ids, waiters }] of batches) {
      void read(dim, [...ids]).then((message) => waiters.forEach((w) => w(message)));
    }
  };

  const book: DrillNameBook = {
    names: () => names,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    resolves: (dim) => Boolean(current()?.[parseDimensionRef(dim).key]),
    learn: (found) => {
      for (const [dim, map] of Object.entries(found)) put(dim, map);
    },
    want: (ref, ids) => {
      const dim = parseDimensionRef(ref).key;
      if (!current()?.[dim]) return Promise.resolve(null);
      const seen = asked.get(dim) ?? new Set<string>();
      asked.set(dim, seen);
      const fresh = [...new Set([...ids].filter((v): v is string => typeof v === "string" && v.length > 0))].filter((id) => !seen.has(id) && !names[dim]?.[id]);
      if (fresh.length === 0) return Promise.resolve(null);
      for (const id of fresh) seen.add(id);
      return new Promise((done) => {
        const slot = queued.get(dim) ?? { ids: new Set<string>(), waiters: [] };
        for (const id of fresh) slot.ids.add(id);
        slot.waiters.push(done);
        queued.set(dim, slot);
        if (!flushing) {
          flushing = true;
          queueMicrotask(flush);
        }
      });
    },
    setResolvers: (next) => {
      resolvers = next;
    },
    readRows: async (rows) => {
      book.learn(drillDoorLabels(rows));
      const ids: Record<string, Set<unknown>> = {};
      for (const row of rows) {
        for (const [ref, value] of Object.entries(row.groups ?? row.prior_groups ?? {})) {
          const dim = parseDimensionRef(ref).key;
          if (book.resolves(dim)) (ids[dim] ??= new Set()).add(value);
        }
      }
      const failed = await Promise.all(Object.entries(ids).map(([dim, set]) => book.want(dim, set)));
      return [...new Set(failed.filter((m): m is string => Boolean(m)))];
    },
  };
  return book;
}

/**
 * The host's book for one explorer, stable for its lifetime. Its resolvers follow each commit in a
 * layout effect, which runs before any surface's passive effect can ask for a name.
 */
export function useDrillNameBook(resolvers: Record<string, DrillNameResolver> | undefined): DrillNameBook {
  const [book] = useState(() => createDrillNameBook(resolvers));
  useLayoutEffect(() => book.setResolvers(resolvers));
  return book;
}

/** The book's names, re-rendering on every change. */
export function useDrillNames(book: DrillNameBook): DrillNames {
  return useSyncExternalStore(book.subscribe, book.names, book.names);
}

/** A passed-in book, else one of this component's own (a surface rendered outside an explorer). */
export function useDrillNameBookOr(book: DrillNameBook | undefined, resolvers: Record<string, DrillNameResolver> | undefined): DrillNameBook {
  const own = useDrillNameBook(book ? undefined : resolvers);
  return book ?? own;
}
