"use client";

/**
 * 🚨 THE canonical URL-state core. Every surface that puts view state in the
 * address bar goes through here — `pnpm check:url-state` flags anything that
 * does not.
 *
 * The URL is the source of truth: refresh, copied links, and browser
 * back/forward all reproduce the same value. Discrete controls push a history
 * entry by default; high-frequency text inputs opt into `replace` so a single
 * search does not create one entry per keystroke.
 *
 * WHY A RAW `history.pushState` IS A BUG, not just a style choice. It fires no
 * event and no popstate, so every OTHER url-backed control on the page keeps
 * rendering stale values until something unrelated re-renders it.
 * `commitUrlParams` dispatches `matrx:url-state`, which is what
 * `useUrlSearchParams` subscribes to. Measured 2026-08-25: 33 hand-rolled
 * writes across 21 files, every one of them silent.
 *
 * PICK THE RIGHT ONE:
 *   one control owns one parameter       → `useUrlState` + a codec
 *   a cluster of values moving together  → `useMirroredUrlState`
 *   a MatrxDataTable                     → `lib/data-table/useTableUrlState`
 *   a bespoke grid                       → compose `useMirroredUrlState`
 *                                          (see features/data-tables)
 *
 * Codecs below cover string / enum / boolean / positive-integer / JSON, and all
 * of them OMIT the default rather than writing it, so a pristine surface has a
 * clean URL and a link carries only what the user actually chose.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

const URL_STATE_EVENT = "matrx:url-state";

function subscribeToUrl(listener: () => void) {
  window.addEventListener("popstate", listener);
  window.addEventListener(URL_STATE_EVENT, listener);
  return () => {
    window.removeEventListener("popstate", listener);
    window.removeEventListener(URL_STATE_EVENT, listener);
  };
}

function getUrlSnapshot() {
  return window.location.search;
}

function getServerUrlSnapshot() {
  return "";
}

/** Reactive query-string snapshot for URL-backed primitives. */
export function useUrlSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(
    subscribeToUrl,
    getUrlSnapshot,
    getServerUrlSnapshot,
  );
  return useMemo(() => new URLSearchParams(search), [search]);
}

export type UrlHistoryMode = "push" | "replace";

export interface UrlStateCodec<T> {
  defaultValue: T;
  parse: (raw: string | null) => T;
  serialize: (value: T) => string | null;
}

export interface SetUrlStateOptions {
  history?: UrlHistoryMode;
}

export function commitUrlParams(
  patch: Readonly<Record<string, string | null>>,
  history: UrlHistoryMode,
) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  }

  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;

  if (history === "replace") {
    window.history.replaceState(window.history.state, "", next);
  } else {
    window.history.pushState(window.history.state, "", next);
  }
  window.dispatchEvent(new Event(URL_STATE_EVENT));
}

/**
 * Classify a URL transition for surfaces that MIRROR state (Redux, local) into
 * the URL from an effect, where there is no single call site to label.
 *
 * THE RULE: a discrete user decision (tab, filter, sort, page, selection)
 * PUSHES, so Back undoes exactly that one step; only high-frequency text
 * (`textKeys` — search boxes, a slider being dragged) REPLACES, so one search
 * is one entry instead of one per keystroke.
 */
export function historyModeForParamChange(
  current: URLSearchParams,
  next: URLSearchParams,
  textKeys: readonly string[],
): UrlHistoryMode {
  const keys = new Set([...current.keys(), ...next.keys()]);
  const changed = [...keys].filter(
    (key) => current.get(key) !== next.get(key),
  );
  if (changed.length === 0) return "replace";
  return changed.every((key) => textKeys.includes(key)) ? "replace" : "push";
}

export function useUrlState<T>(
  key: string,
  codec: UrlStateCodec<T>,
): readonly [T, (value: T, options?: SetUrlStateOptions) => void] {
  const searchParams = useUrlSearchParams();
  const value = codec.parse(searchParams.get(key));

  const setValue = (next: T, options?: SetUrlStateOptions) => {
    commitUrlParams(
      { [key]: codec.serialize(next) },
      options?.history ?? "push",
    );
  };

  return [value, setValue] as const;
}

export function stringUrlCodec(defaultValue = ""): UrlStateCodec<string> {
  return {
    defaultValue,
    parse: (raw) => raw ?? defaultValue,
    serialize: (value) => (value === defaultValue ? null : value),
  };
}

export function enumUrlCodec<const T extends string>(
  values: readonly T[],
  defaultValue: T,
): UrlStateCodec<T> {
  const allowed = new Set<string>(values);
  return {
    defaultValue,
    parse: (raw) => (raw && allowed.has(raw) ? (raw as T) : defaultValue),
    serialize: (value) => (value === defaultValue ? null : value),
  };
}

export function booleanUrlCodec(defaultValue = false): UrlStateCodec<boolean> {
  return {
    defaultValue,
    parse: (raw) => (raw === null ? defaultValue : raw === "1"),
    serialize: (value) => (value === defaultValue ? null : value ? "1" : "0"),
  };
}

export function positiveIntegerUrlCodec(
  defaultValue: number,
): UrlStateCodec<number> {
  return {
    defaultValue,
    parse: (raw) => {
      const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
    },
    serialize: (value) =>
      value === defaultValue || !Number.isFinite(value) || value <= 0
        ? null
        : String(Math.trunc(value)),
  };
}

export function jsonUrlCodec<T>(
  defaultValue: T,
  isValid: (value: unknown) => value is T,
): UrlStateCodec<T> {
  return {
    defaultValue,
    parse: (raw) => {
      if (!raw) return defaultValue;
      try {
        const parsed: unknown = JSON.parse(raw);
        return isValid(parsed) ? parsed : defaultValue;
      } catch {
        return defaultValue;
      }
    },
    serialize: (value) =>
      JSON.stringify(value) === JSON.stringify(defaultValue)
        ? null
        : JSON.stringify(value),
  };
}

/**
 * Mirror a whole view-state OBJECT into the URL, in both directions.
 *
 * THE PATTERN 18 FILES WERE HAND-ROLLING. `useUrlState` is right when one
 * control owns one parameter. It is the wrong shape when a surface holds a
 * cluster of related values (search + sort + filters + page) that must move
 * together, be seeded from the URL on first render, and follow Back/Forward.
 * Every surface that needed that wrote its own `history.pushState` — and NONE
 * of them dispatched the sync event, so any other URL-backed control on the
 * same page silently kept showing stale values after they wrote.
 *
 * 🚨 THE LOOP IS BROKEN BY VALUE, NEVER BY BOOKKEEPING. The obvious guard —
 * remember the last URL you wrote and ignore anything matching it — looks
 * equivalent and is not: pressing Forward to a view already visited produces a
 * URL you did indeed write before, so the guard swallows it and the address bar
 * moves while the surface does not. Compare the DECODED value to the current
 * one instead; your own write compares equal and stops.
 *
 * Seeding happens in the `useState` initialiser, not an effect, so the first
 * render already shows the requested view rather than flashing the default and
 * fetching the wrong page before correcting itself.
 */
export interface MirroredUrlStateOptions<T> {
  /** Decode the whole value from the query string. Must never throw. */
  parse: (params: URLSearchParams) => T;
  /** Encode it; `null` for a key means "omit", which keeps defaults out of the URL. */
  toParams: (value: T) => Record<string, string | null>;
  /** Value equality — what stops the two directions fighting. */
  isSame: (a: T, b: T) => boolean;
  /** Keys that REPLACE instead of pushing (search boxes, dragged sliders). */
  textKeys?: readonly string[];
  /**
   * Changing this clears the mirrored state and its parameters — for when the
   * surface switches to a different subject and the old view would be a lie.
   */
  resetKey?: string;
}

export function useMirroredUrlState<T>(
  options: MirroredUrlStateOptions<T>,
): readonly [T, (updater: T | ((prev: T) => T)) => void] {
  const { parse, toParams, isSame, textKeys = [], resetKey } = options;
  const params = useUrlSearchParams();

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [value, setValue] = useState<T>(() =>
    parse(
      typeof window === "undefined"
        ? new URLSearchParams()
        : new URLSearchParams(window.location.search),
    ),
  );

  // value → URL
  useEffect(() => {
    if (typeof window === "undefined") return;
    const current = new URLSearchParams(window.location.search);
    const patch = optionsRef.current.toParams(value);

    const next = new URLSearchParams(current);
    for (const [key, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(key);
      else next.set(key, v);
    }
    if (next.toString() === current.toString()) return;

    commitUrlParams(patch, historyModeForParamChange(current, next, textKeys));
    // `textKeys` is a literal in every caller; `value` is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // URL → value (Back/Forward, a pasted link, another control writing)
  useEffect(() => {
    // Read the URL at EFFECT time, not the render snapshot. The value→URL
    // effect runs first. When it commits a local filter/sort decision it
    // synchronously notifies the external store, but `params` in this render
    // still describes the URL from before that write. Re-applying that stale
    // snapshot here ping-pongs state and URL until React raises #185.
    const fromUrl = optionsRef.current.parse(
      new URLSearchParams(window.location.search),
    );
    setValue((prev) => (optionsRef.current.isSame(prev, fromUrl) ? prev : fromUrl));
  }, [params]);

  // Clearing on a subject change is deliberate; clearing on a subject ARRIVING
  // is destructive. A surface whose id is undefined for its first render (async
  // params, a late store hydration, a suspended boundary) would otherwise wipe
  // the very view the user just loaded — and the symptom is indistinguishable
  // from "the URL never saved my filters", because the write lands and is
  // erased a tick later.
  //
  // So: only a transition between two REAL, DIFFERENT keys resets.
  const previousResetKey = useRef(resetKey);
  useEffect(() => {
    const previous = previousResetKey.current;
    previousResetKey.current = resetKey;
    if (previous === resetKey) return;
    if (previous === undefined || previous === "") return; // arriving, not changing
    if (resetKey === undefined || resetKey === "") return; // leaving, not changing

    const cleared = optionsRef.current.parse(new URLSearchParams());
    setValue(cleared);
    commitUrlParams(optionsRef.current.toParams(cleared), "replace");
  }, [resetKey]);

  const update = useCallback((updater: T | ((prev: T) => T)) => {
    setValue((prev) =>
      typeof updater === "function"
        ? (updater as (p: T) => T)(prev)
        : updater,
    );
  }, []);

  return [value, update] as const;
}
