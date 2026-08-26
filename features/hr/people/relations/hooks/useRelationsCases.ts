// features/hr/people/relations/hooks/useRelationsCases.ts
//
// The data hooks behind routes 15 and 16.
//
// 🚨 NEVER LET A REFUSAL LOOK LIKE AN EMPTY LIST. These hooks keep `refusal`
// and `cases` strictly separate: a refusal leaves `cases` at `null`, never at
// `[]`. A surface that renders `cases ?? []` into a table would silently turn
// "not yours to see" into "there's nothing here", which is the exact defect the
// envelope contract exists to prevent.

"use client";

import { useCallback, useEffect, useState } from "react";

import { useHrContext } from "@/features/hr/shared/useHrContext";
import type { HrDenied, HrFailed } from "@/features/hr/types";

import {
  fetchHrRelationsCase,
  fetchHrRelationsCases,
  type HrRelationsFilter,
  type HrRelationsList,
} from "../service";
import type { HrCaseDetail, HrCaseKind } from "../types";

export type HrRelationsCasesState = {
  list: HrRelationsList | null;
  isLoading: boolean;
  /** A refusal OR a failure. `HrPageState` tells them apart and renders each. */
  error: HrDenied | HrFailed | null;
  /** True when the refusal was a DENIAL — the route and nav item are absent. */
  denied: boolean;
  refresh: () => void;
};

export function useHrRelationsCases(
  filter: HrRelationsFilter,
): HrRelationsCasesState {
  const { active, isLoading: contextLoading } = useHrContext();
  const organizationId = active?.organization_id ?? null;

  const [list, setList] = useState<HrRelationsList | null>(null);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  // Serialized so the effect re-runs on a real filter change and not on every
  // render's fresh object identity. React Compiler is on — this is a dependency
  // key, not a hand-rolled memo.
  const filterKey = JSON.stringify(filter);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const result = await fetchHrRelationsCases(
        JSON.parse(filterKey) as HrRelationsFilter,
      );
      if (cancelled) return;
      if (result.ok) {
        setList(result.data);
        setError(null);
      } else {
        // The list stays NULL. Not an empty array. See the header.
        setList(null);
        setError(result);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId, filterKey, reloadToken]);

  return {
    list,
    isLoading: contextLoading || isLoading,
    error,
    denied: error?.kind === "denied",
    refresh,
  };
}

export type HrRelationsCaseState = {
  detail: HrCaseDetail | null;
  caseKind: HrCaseKind | null;
  isLoading: boolean;
  error: HrDenied | HrFailed | null;
  denied: boolean;
  refresh: () => void;
};

/**
 * One case, either kind.
 *
 * When `hintedKind` is null (a link that dropped `?kind=`) this probes the
 * incident door first and the corrective-action door second. The losing probe
 * writes a denial to `hr.access_audit`, which is correct behaviour, not a bug —
 * see `hrRelationsCaseHref`.
 *
 * 🚨 THE VETO CAN FIRE BETWEEN TWO READS. Adding an `accused` party
 * re-materializes the exclusion set in the same transaction, so a viewer who
 * just accused themselves loses reach on their very NEXT request. When
 * `refresh()` comes back denied on a case that was open a second ago, the
 * surface redirects with a NEUTRAL message — it never explains why.
 */
export function useHrRelationsCase(args: {
  caseId: string;
  hintedKind: HrCaseKind | null;
  justification: string;
}): HrRelationsCaseState {
  const { caseId, hintedKind, justification } = args;

  const [detail, setDetail] = useState<HrCaseDetail | null>(null);
  const [caseKind, setCaseKind] = useState<HrCaseKind | null>(hintedKind);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    (async () => {
      const order: HrCaseKind[] = hintedKind
        ? [hintedKind]
        : ["incident", "corrective_action"];

      let lastFailure: HrDenied | HrFailed | null = null;

      for (const kind of order) {
        const result = await fetchHrRelationsCase({
          caseKind: kind,
          caseId,
          justification,
        });
        if (cancelled) return;
        if (result.ok) {
          setDetail(result.data.row);
          setCaseKind(
            (result.data.row.case_kind as HrCaseKind | undefined) ?? kind,
          );
          setError(null);
          setIsLoading(false);
          return;
        }
        lastFailure = result;
      }

      setDetail(null);
      setError(lastFailure);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [caseId, hintedKind, justification, reloadToken]);

  return {
    detail,
    caseKind,
    isLoading,
    error,
    denied: error?.kind === "denied",
    refresh,
  };
}
