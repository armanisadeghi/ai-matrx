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
 */

import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { listPayrollExports } from "../service";
import { toExportFailure, type ExportFailure } from "../errors";
import type { PayrollExportListResult } from "../types";

export interface UseExportHistoryResult {
  result: PayrollExportListResult | null;
  isLoading: boolean;
  failure: ExportFailure | null;
  /** True while no organization has been selected — the read cannot be scoped yet. */
  awaitingOrganization: boolean;
  reload: () => void;
}

export function useExportHistory(
  payPeriodId: string | null,
  options?: { limit?: number; mockCase?: HrFixtureCase },
): UseExportHistoryResult {
  const organizationId = useAppSelector(selectOrganizationId);
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
    isLoading: organizationId ? isLoading : false,
    failure,
    awaitingOrganization: !organizationId,
    reload: () => setReloadToken((token) => token + 1),
  };
}
