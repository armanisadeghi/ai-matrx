"use client";

/**
 * `useWaitingRuns` — the "waiting on you" inbox's data (census #38).
 *
 * `GET /runs/waiting` through the canonical typed `callApi`, plus the shared
 * run-announce channel so the list is live: a run that parks appears, a run
 * that gets answered leaves. The announce frames carry no snapshot of WHAT a
 * run is waiting for, so any announcement that could change the membership of
 * this list refetches the projection — the fetch is the truth, the frames are
 * the hint (`announce-channel.ts`).
 *
 * 🚨 **This hook is only as alive as `api-types.ts`.** The projection landed in
 * aidream before the deployed server served it, so a regen against production
 * strips `/runs/waiting` out of the generated paths and this file stops
 * compiling. The fix is to regenerate from a server that HAS the route (a local
 * aidream at HEAD, or production once the deploy agent has shipped it) — never
 * to stub this hook out, which turns a temporary contract skew into a surface
 * that silently reports "nothing is waiting" forever.
 * `__tests__/waiting-contract.test.ts` is the tripwire.
 *
 * A failed read is a stated error, never an empty list: "nothing is waiting on
 * you" and "we could not check" are opposite answers, and showing the
 * reassuring one for the alarming one is the exact failure this inbox exists
 * to prevent.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useAppDispatch } from "@/lib/redux/hooks";
import {
  useOrganizationRequired,
  type OrganizationState,
} from "@/features/organizations/useOrganizationRequired";
import { callApi } from "@/lib/api/call-api";

import { parseWaitingRuns, type WaitingRunRow } from "./waiting";
import { useRunAnnouncements } from "./useRunAnnouncements";

/** The two statuses this inbox is made of — see `waiting.ts`. */
const WAITING_STATUSES = new Set(["interrupted", "awaiting_input"]);

export interface WaitingRunsState {
  rows: WaitingRunRow[];
  loading: boolean;
  /** Set when the projection could not be read — never rendered as "all clear". */
  error: string | null;
  /**
   * The organization question's answer, as ONE value: `resolving` (still being
   * asked), `required` (settled with nothing selected), `unavailable` (the read
   * FAILED — nobody looked, R37) or `ready`. The projection cannot be read in
   * any state but `ready`, so the caller renders `OrganizationContextNotice`
   * with this — NOT a skeleton, which is what the non-ready states used to show,
   * forever.
   *
   * 🚨 It replaces the old `organizationRequired` boolean, which could not see
   * the fourth state: under a failed read it was false while `canLoad` was also
   * false, so `loading` stayed true and this inbox spun for as long as the tab
   * was open.
   */
  organizationState: OrganizationState;
  refresh: () => void;
}

export function useWaitingRuns(): WaitingRunsState {
  const dispatch = useAppDispatch();
  /**
   * THE HYDRATION RACE (the same one `useResultSchema` documents): every
   * backend transport calls `requireSelectedOrgId()`, which throws until
   * `appContext.organization_id` has hydrated. A fetch fired on mount alone is
   * refused on every cold load and never retried.
   */
  const { organizationId, canLoad, organizationState } =
    useOrganizationRequired();
  const [rows, setRows] = useState<WaitingRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  const refresh = useCallback(() => setGeneration((n) => n + 1), []);

  useEffect(() => {
    // Terminal, not pending — and there are TWO terminal answers, not one:
    // boot settled with nothing selected (`required`), and the read that would
    // have told us FAILED (`unavailable`, R37). Stop the skeleton for both, so
    // the caller can say which it is instead of spinning forever.
    if (organizationState === "required" || organizationState === "unavailable") {
      setLoading(false);
      return undefined;
    }
    if (!canLoad) return undefined;
    let live = true;
    void (async () => {
      const result = await dispatch(
        callApi({
          path: "/runs/waiting",
          method: "GET",
          // This projection is authenticated-only. During logout/session expiry
          // the protected shell can finish one in-flight read as a guest; the
          // caller renders the refusal, but it is not a product incident.
          expectedErrorStatuses: [401],
        }),
      );
      if (!live) return;
      if (result.error) {
        setError(result.error.message || "Could not check what is waiting on you.");
      } else {
        setError(null);
        setRows(parseWaitingRuns(result.data));
      }
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [canLoad, dispatch, organizationState, organizationId, generation]);

  /**
   * Coalesced refetch. A single answered interrupt produces several
   * transitions in a second (`interrupted` → `running` → `completed`); firing
   * one projection read per frame would be three reads for one event.
   */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (timer.current !== null) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      refresh();
    }, 400);
  }, [refresh]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const known = useRef<Set<string>>(new Set());
  known.current = new Set(rows.map((row) => row.runId));

  useRunAnnouncements({
    onAnnounce: (event) => {
      // Refetch when a run ENTERS the waiting set, or when a run currently ON
      // the list moves at all (it may have just been answered and left). Every
      // other transition in the user's whole account is none of this list's
      // business — a busy account would otherwise refetch the inbox on every
      // node of every unrelated run.
      if (WAITING_STATUSES.has(event.status) || known.current.has(event.run_id)) {
        scheduleRefresh();
      }
    },
    // Every reconnect has a hole in it (the frames are ephemeral, with no
    // replay), so the snapshot is re-read on each open.
    onStatus: (status) => {
      if (status === "open") scheduleRefresh();
    },
  });

  return { rows, loading, error, organizationState, refresh };
}
