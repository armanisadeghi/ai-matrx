"use client";

// features/hr/people/shared/useHrRequest.ts
//
// ONE read hook for every surface in this lane. It exists for two reasons, and
// the second one is the interesting one.
//
// 1. A REFUSAL IS DATA, NOT AN EXCEPTION, and the three outcomes must stay
//    distinguishable at every call site: `data` (the door opened), `denied` (the
//    door refused — render the refusal, never an empty list), `error` (the call
//    never reached a decision). Collapsing denied into error is how a
//    permission answer starts reading as a bug, and collapsing it into an empty
//    result is how it stops being visible at all.
//
// 2. IT HAS NO `setState` IN THE EFFECT BODY. The obvious shape —
//    `setIsLoading(true)` at the top of the effect, then set the result — is a
//    cascading render on every request and the repo's `react-hooks/set-state-in-effect`
//    rule rejects it. Loading here is DERIVED: the hook stores the request key
//    alongside the result, and "loading" is simply "the stored key is not the
//    key I am asking for". One state write per completed request, none per
//    render.
//
// THE REQUEST IS A STRING ON PURPOSE. Everything a read depends on is serialized
// into `requestJson` and parsed back inside the effect, so the dependency array
// is complete and honest — no ref written during render, no suppressed lint
// rule, and no re-fetch loop caused by an argument object whose identity changes
// every render (which is exactly what a URL-derived filter object does).

import { useCallback, useEffect, useState } from "react";

import type { HrDenied, HrFailed, HrResult } from "../../types";

export type HrRequestState<T> = {
  data: T | null;
  /** The door refused. Render the refusal in place. */
  denied: HrDenied | null;
  /** The call did not reach a decision. Render the error with a retry. */
  error: HrFailed | null;
  /** Nothing has arrived for the CURRENT request yet. */
  isLoading: boolean;
  /** Something is on screen and a newer request is in flight. */
  isFetching: boolean;
  refresh: () => void;
};

type Entry<T> = {
  key: string;
  data: T | null;
  denied: HrDenied | null;
  error: HrFailed | null;
};

/**
 * @param requestJson Everything the read depends on, serialized. `null` means
 *   "not ready to ask" (no employer resolved yet), which is a legitimate state
 *   and not an error.
 * @param run A MODULE-LEVEL function that takes the parsed request. It must be
 *   a stable reference — a closure defined in the component body would make the
 *   dependency array change every render.
 */
export function useHrRequest<TArgs, T>(
  requestJson: string | null,
  run: (args: TArgs) => Promise<HrResult<T>>,
): HrRequestState<T> {
  const [entry, setEntry] = useState<Entry<T> | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  // The reload token rides INSIDE the key, so "ask again" is just a different
  // request rather than a second mechanism with its own race.
  const key = requestJson === null ? null : `${reloadToken}::${requestJson}`;

  useEffect(() => {
    if (key === null) return;
    const parsed: TArgs = JSON.parse(key.slice(key.indexOf("::") + 2));

    let cancelled = false;
    void (async () => {
      const result = await run(parsed);
      if (cancelled) return;
      if (result.ok) {
        setEntry({ key, data: result.data, denied: null, error: null });
      } else if (result.kind === "denied") {
        // A refusal REPLACES what was on screen. Keeping the previous page
        // behind a refusal shows data the server has just declined to serve.
        setEntry({ key, data: null, denied: result, error: null });
      } else {
        setEntry({ key, data: null, denied: null, error: result });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, run]);

  const current = entry?.key === key ? entry : null;

  return {
    data: current?.data ?? null,
    denied: current?.denied ?? null,
    error: current?.error ?? null,
    isLoading: key !== null && entry === null,
    isFetching: key !== null && current === null,
    refresh,
  };
}
