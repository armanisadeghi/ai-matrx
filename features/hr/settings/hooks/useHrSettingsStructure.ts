// features/hr/settings/hooks/useHrSettingsStructure.ts
//
// ONE read of `hr_structure_list` for the whole settings lane. Routes 69, 70, 71 and
// 72 all live inside that one envelope — departments, locations, job titles, pay
// groups, holiday calendars (with their nested holidays), earning codes, deduction
// codes, establishments and jurisdictions — so four panels firing four identical
// RPCs would be four chances for them to disagree about the same employer.
//
// The shared `HrStructure` type keeps five of those members as
// `Record<string, unknown>[]` on purpose; this hook narrows them to the columns
// `hr_structure_list` actually builds (read out of the function body 2026-08-26).

"use client";

import { useEffect, useState } from "react";

import { fetchHrStructure } from "../../service";
import type { HrDenied, HrFailed } from "../../types";
import type { HrSettingsStructure } from "../types";

export type HrSettingsStructureValue = {
  structure: HrSettingsStructure | null;
  isLoading: boolean;
  error: HrDenied | HrFailed | null;
  refresh: () => void;
};

export function useHrSettingsStructure(
  organizationId: string | null,
): HrSettingsStructureValue {
  const [structure, setStructure] = useState<HrSettingsStructure | null>(null);
  // Derived, never set in an effect body — see `useHrKnobs` for the reasoning.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [error, setError] = useState<HrDenied | HrFailed | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = () => setReloadToken((n) => n + 1);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;

    (async () => {
      const result = await fetchHrStructure(organizationId);
      if (cancelled) return;
      if (result.ok) {
        // The narrowing is a single assertion here rather than a cast at each of the
        // four panels, and it is honest: the function body builds exactly these keys.
        setStructure(result.data as unknown as HrSettingsStructure);
        setError(null);
      } else {
        setError(result);
      }
      setLoadedFor(organizationId);
    })();

    return () => {
      cancelled = true;
    };
  }, [organizationId, reloadToken]);

  return {
    structure: organizationId ? structure : null,
    isLoading: organizationId !== null && loadedFor !== organizationId,
    error,
    refresh,
  };
}
