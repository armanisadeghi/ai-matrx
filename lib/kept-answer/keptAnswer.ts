"use client";

// lib/kept-answer/keptAnswer.ts — THE KEPT ANSWER (lane REMOUNT-SAFETY, 2026-10-02)
//
// THE LAW (owner, 2026-10-02): every screen survives hide/show/remount with no lost work and no
// repeated side effects; checks and fetches are cached and idempotent.
//
// THE DEFECT THIS CLOSES. A gate hook — "which organization does this table live in", "is the
// record store on for this organization", "is this a share" — kept its answer in `useState` and
// set it back to `null` at the top of its effect. So every remount AND every wake of a sleeping
// tile (React `<Activity>` re-runs every effect) dropped the gate to "resolving" for one round
// trip, and the screen behind the gate UNMOUNTED: a /data-v2 grid lost its scroll, selection,
// open cell edit and column state, then re-read every row it already had.
//
// THE SHAPE. One store per question (`createKeptAnswers`), one entry per key (the record, the
// organization — the caller puts every fact the answer depends on into the key). An entry keeps
// its last answer for the browser session; a screen that mounts or wakes reads it synchronously
// and draws the content at once. A re-ask runs in the background, is joined while in flight, is
// skipped while the answer is fresh (`freshMs`), and replaces what is on screen ONLY when the
// answer actually changed (`same`). `retry()` asks again without blanking anything. An answer the
// caller does not `keep` (a "could not ask") is shown but never counted fresh, so the next mount
// asks again. Everything is forgotten when the person signs out.

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/utils/supabase/client";

export interface KeptAnswerOptions<A> {
  /** How long an answer is fresh — a mount or wake inside it asks nothing. Default 60 s. */
  freshMs?: number;
  /** False for an answer that is not a fact (a failed read): shown, never counted fresh. */
  keep?: (answer: A) => boolean;
  /** Same answer → the screen is not touched. Default: structural (JSON) equality. */
  same?: (a: A, b: A) => boolean;
}

export interface KeptAnswerView<A> {
  /** The last answer for the key, or null when none has arrived yet. */
  answer: A | null;
  /** A question for this key is in flight (a first ask, a background re-ask, a retry). */
  asking: boolean;
}

interface Entry<A> {
  view: KeptAnswerView<A>;
  /** When the kept answer last arrived; 0 = never. */
  at: number;
  /** The caller's `keep` said it is a fact (fresh for `freshMs`), not a failed read. */
  fact: boolean;
  inflight: Promise<A> | null;
}

export interface KeptAnswers<A> {
  /** The view for `key` (null key → nothing asked, nothing kept). Re-asks in the background. */
  useAnswer(key: string | null, ask: () => Promise<A>): KeptAnswerView<A> & { retry: () => void };
  /** Ask for `key` unless fresh or in flight (`force` asks even when fresh). Idempotent. */
  ensure(key: string, ask: () => Promise<A>, force?: boolean): Promise<A | null>;
  /** The kept view for `key` (tests, debug). */
  peek(key: string): KeptAnswerView<A> | null;
  /** Forget one key, or every key. */
  forget(key?: string): void;
}

/**
 * A failed read is never kept fresh, but is not re-asked more often than this: a caller whose
 * `ask` changes identity on every render must not turn one failure into a request loop.
 */
const NOT_A_FACT_FLOOR_MS = 3_000;

const EMPTY: KeptAnswerView<never> = { answer: null, asking: false };

/** Every store, so a sign-out forgets them all. */
const allStores = new Set<{ forget(key?: string): void }>();
let signOutHookInstalled = false;

/** Answers are the signed-in person's: they die with the session. Installed lazily, once. */
function installSignOutHook(): void {
  if (signOutHookInstalled || typeof window === "undefined") return;
  signOutHookInstalled = true;
  const auth = (createClient() as { auth?: { onAuthStateChange?: (cb: (event: string) => void) => unknown } } | null)
    ?.auth;
  if (typeof auth?.onAuthStateChange !== "function") return;
  auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") forgetAllKeptAnswers();
  });
}

/** Forget every kept answer in every store (sign-out; tests). */
export function forgetAllKeptAnswers(): void {
  for (const store of allStores) store.forget();
}

function jsonSame(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function createKeptAnswers<A>(options: KeptAnswerOptions<A> = {}): KeptAnswers<A> {
  const freshMs = options.freshMs ?? 60_000;
  const keep = options.keep ?? (() => true);
  const same = options.same ?? jsonSame;
  const entries = new Map<string, Entry<A>>();
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const entryOf = (key: string): Entry<A> => {
    let entry = entries.get(key);
    if (!entry) {
      entry = { view: EMPTY as KeptAnswerView<A>, at: 0, fact: false, inflight: null };
      entries.set(key, entry);
    }
    return entry;
  };

  const ensure = (key: string, ask: () => Promise<A>, force = false): Promise<A | null> => {
    installSignOutHook();
    const entry = entryOf(key);
    if (entry.inflight) return entry.inflight;
    const freshFor = entry.fact ? freshMs : NOT_A_FACT_FLOOR_MS;
    const fresh = entry.view.answer !== null && Date.now() - entry.at < freshFor;
    if (fresh && !force) return Promise.resolve(entry.view.answer);
    const asked = ask();
    entry.inflight = asked;
    entry.view = { answer: entry.view.answer, asking: true };
    notify();
    return asked.then(
      (next) => {
        if (entries.get(key) !== entry) return next; // forgotten meanwhile
        entry.inflight = null;
        entry.at = Date.now();
        entry.fact = keep(next);
        const changed = entry.view.answer === null || !same(entry.view.answer, next);
        entry.view = { answer: changed ? next : entry.view.answer, asking: false };
        notify();
        return next;
      },
      (thrown: unknown) => {
        // An ask that throws is a broken ask (every caller's ask answers its own failures).
        console.error(`[keptAnswer] the question for ${key} threw; the last answer stays.`, thrown);
        if (entries.get(key) === entry) {
          entry.inflight = null;
          entry.view = { answer: entry.view.answer, asking: false };
          notify();
        }
        return entry.view.answer;
      },
    );
  };

  const store: KeptAnswers<A> = {
    ensure,
    peek: (key) => entries.get(key)?.view ?? null,
    forget(key) {
      if (key === undefined) entries.clear();
      else entries.delete(key);
      notify();
    },
    useAnswer(key, ask) {
      const view = useSyncExternalStore(
        subscribe,
        () => (key ? (entries.get(key)?.view ?? (EMPTY as KeptAnswerView<A>)) : (EMPTY as KeptAnswerView<A>)),
        () => EMPTY as KeptAnswerView<A>,
      );
      // Mount and wake: ask unless fresh or in flight. Never blanks what is shown.
      useEffect(() => {
        if (key) void ensure(key, ask);
      }, [key, ask]);
      const retry = () => {
        if (key) void ensure(key, ask, true);
      };
      return { answer: view.answer, asking: view.asking, retry };
    },
  };
  allStores.add(store);
  return store;
}
