"use client";

/** Resolve a set of mandate keys in parallel with independent per-key state. */
import { useEffect, useState } from "react";
import { extractErrorMessage } from "@/utils/errors";
import {
  onMandateCacheInvalidated,
  resolveMandate,
  type ResolvedMandate,
} from "./service";
import type { MandateState } from "./useMandate";

export type MandateSetState = Readonly<Record<string, MandateState>>;

export interface UseMandateSetOptions {
  /** Deliberately unassigned keys still refuse but are not system errors. */
  optionalKeys?: readonly string[];
  /**
   * RESOLVE ONLY WHAT THIS SURFACE ACTUALLY RUNS. Defaults to `true`.
   *
   * 🚨 WHY (2026-09-08, FIX-R6's third un-absorbed finding). Resolution is not
   * free and it is not private: each key is a round trip to
   * `GET /mandates/{key}/resolution`, and a key with no Holder REFUSES — as it
   * should. A consumer that resolves on mount regardless of whether its
   * affordance will ever render turns that honest refusal into a system error
   * on every page load of the whole app. Measured on production: the app-wide
   * `<MessagingHost>` resolved the four `messaging.*` intelligences on EVERY
   * route — /mandates, /dashboard, everywhere — for a conversation pane that
   * was not on screen, producing four console errors and four captured errors
   * per load for a person who had not opened a single message.
   *
   * While `false` this hook fires nothing and returns an EMPTY set. A key that
   * is absent from the set is a key this hook WAS NOT ASKED ABOUT — deliberately
   * not the same shape as a key that resolved to nothing, so no consumer can
   * read "not asked" as "no Holder" and print a refusal nobody earned.
   */
  enabled?: boolean;
}

export function shouldReportMandateSetFailure(
  key: string,
  optionalKeys: readonly string[] = [],
): boolean {
  return !optionalKeys.includes(key);
}

const SEPARATOR = "\u0000";
const PENDING: MandateState = {
  mandate: null,
  loading: true,
  error: null,
  absent: false,
  organizationPending: false,
};

function pendingSet(keys: readonly string[]): Record<string, MandateState> {
  const out: Record<string, MandateState> = {};
  for (const key of keys) out[key] = PENDING;
  return out;
}

const EMPTY_KEYS: readonly string[] = [];

export function useMandateSet(
  requestedKeys: readonly string[],
  options: UseMandateSetOptions = {},
): MandateSetState {
  const enabled = options.enabled ?? true;
  // An empty key list IS the disabled state, all the way down: the effects
  // below already no-op on it, `pendingSet` returns {}, and the identity of
  // `keyList` is what every effect keys on. Gating here rather than at each
  // effect means there is exactly one place where "not asked" is decided.
  const keys = enabled ? requestedKeys : EMPTY_KEYS;
  const keyList = keys.join(SEPARATOR);
  const optionalKeyList = (options.optionalKeys ?? []).join(SEPARATOR);
  const [state, setState] = useState<{
    keyList: string;
    epoch: number;
    set: Record<string, MandateState>;
  }>(() => ({ keyList, epoch: 0, set: pendingSet(keys) }));

  if (state.keyList !== keyList) {
    setState({ keyList, epoch: 0, set: pendingSet(keys) });
  }

  useEffect(() => {
    const listed = keyList.split(SEPARATOR);
    return onMandateCacheInvalidated((invalidatedKey) => {
      if (invalidatedKey === undefined || listed.includes(invalidatedKey)) {
        setState((prev) => ({ ...prev, epoch: prev.epoch + 1 }));
      }
    });
  }, [keyList]);

  const epoch = state.epoch;
  useEffect(() => {
    const listed = keyList.length > 0 ? keyList.split(SEPARATOR) : [];
    const optionalKeys = optionalKeyList
      ? optionalKeyList.split(SEPARATOR)
      : [];
    if (listed.length === 0) return undefined;
    let cancelled = false;
    void Promise.allSettled(listed.map((key) => resolveMandate(key))).then(
      (results) => {
        if (cancelled) return;
        const next: Record<string, MandateState> = {};
        results.forEach((result, i) => {
          const key = listed[i];
          if (result.status === "fulfilled") {
            const mandate: ResolvedMandate = result.value;
            next[key] = {
              mandate,
              loading: false,
              error: null,
              absent: false,
              organizationPending: false,
            };
          } else {
            const message = extractErrorMessage(result.reason);
            if (shouldReportMandateSetFailure(key, optionalKeys)) {
              console.error(`[mandates] ${key} failed to resolve:`, message);
            }
            next[key] = {
              mandate: null,
              loading: false,
              error: message,
              absent: false,
              // The set lane resolves many keys at once and has no single
              // consumer to hold a "wait" state for; the org refusal reaches
              // it as an ordinary error. Only `useMandate` distinguishes it.
              organizationPending: false,
            };
          }
        });
        setState((prev) =>
          prev.keyList === keyList ? { ...prev, set: next } : prev,
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [keyList, optionalKeyList, epoch]);

  return state.set;
}
