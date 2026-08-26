"use client";

/**
 * useExportHistory — the export history for one pay period, or for the whole org when
 * `payPeriodId` is null.
 *
 * 🚨 THE REFUSAL IS PART OF THE RESULT, NOT AN ERROR AND NOT AN EMPTY LIST. The reader answers
 * either `{granted:true, exports:[…]}` or `{granted:false, reason, capability?}`, and this hook
 * hands both back unchanged. "You need the payroll.read capability" and "this period has never
 * been exported" are different facts about the world; a surface that renders them the same way
 * teaches a payroll administrator that their access is fine when it is not — and the period
 * silently never gets exported.
 *
 * `failure` is reserved for a genuine transport failure. A denial is never one.
 *
 * 🚨 THE EMPLOYER COMES FROM `useHrContext`, NOT FROM THE REDUX ACTIVE ORG. Every other feature in
 * this app scopes to the user's selected organization; HR does not. SPEC-UI-IA §1 resolves the
 * active employer from `?org=` FIRST, and HR is strictly single-employer — so reading the Redux
 * selection would show one employer's payroll exports on a page the user opened for another.
 * That is not a scoping bug, it is two employers' pay data merged on one screen.
 */

import { useEffect, useState } from "react";
import { useHrContext } from "@/features/hr/shared/useHrContext";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { listPayrollExports } from "../service";
import { toExportFailure, type ExportFailure } from "../errors";
import type { PayrollExportListResult } from "../types";

export interface UseExportHistoryResult {
  result: PayrollExportListResult | null;
  isLoading: boolean;
  failure: ExportFailure | null;
  /** True while no employer is resolved — the read cannot be scoped yet. */
  awaitingOrganization: boolean;
  /** The resolved employer, for callers that need it in a request body or an href. */
  organizationId: string | null;
  /** The `?org=` reference (slug or uuid) to carry on outgoing HR links. */
  orgRef: string | null;
  reload: () => void;
}

export function useExportHistory(
  payPeriodId: string | null,
  options?: { limit?: number; mockCase?: HrFixtureCase },
): UseExportHistoryResult {
  const hr = useHrContext();
  const organizationId = hr.active?.organization_id ?? null;
  const limit = options?.limit;
  const mockCase = options?.mockCase;

  const [result, setResult] = useState<PayrollExportListResult | null>(null);
  const [failure, setFailure] = useState<ExportFailure | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!organizationId) return;
    let cancelled = false;
    const startTimer = window.setTimeout(() => {
      setIsLoading(true);
      setFailure(null);
      listPayrollExports({ organizationId, payPeriodId, limit, mockCase })
        .then((next) => {
          if (cancelled) return;
          setResult(next);
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setResult(null);
          setFailure(toExportFailure(err));
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
    };
  }, [organizationId, payPeriodId, limit, mockCase, reloadToken]);

  return {
    result,
    // Still RESOLVING the employer is loading; resolved-to-nothing is a state the surface renders
    // (pick an employer), never a spinner that never ends.
    isLoading: organizationId ? isLoading : hr.isLoading,
    failure,
    awaitingOrganization: !organizationId && !hr.isLoading,
    organizationId,
    orgRef: hr.orgRef,
    reload: () => setReloadToken((token) => token + 1),
  };
}
