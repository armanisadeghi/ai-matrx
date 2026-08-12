"use client";

/**
 * Small, reusable URL-state primitive for view controls.
 *
 * The URL is the source of truth: refresh, copied links, and browser
 * back/forward all reproduce the same value. Discrete controls push a history
 * entry by default; high-frequency text inputs can opt into `replace` so a
 * single search does not create one entry per keystroke.
 */

import { useMemo, useSyncExternalStore } from "react";

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
