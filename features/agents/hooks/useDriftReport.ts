/**
 * useDriftReport — dispatch-on-idle hook for the drift report rollup.
 */

"use client";

import { useEffect, useCallback, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@ai-matrx/chat/store/hooks";
import { fetchAgentUsageReport } from "@ai-matrx/chat/host/ui-slots";
import { makeSelectReport, makeSelectReportSorted, makeSelectReportTotals } from "@ai-matrx/chat/host/ui-slots";
import type { ReportSortKey } from "@ai-matrx/chat/ui/usages/usages.types";
import type { UsageScope } from "@ai-matrx/chat/ui/usages/usages.slice";

export function useDriftReport(
  scope: UsageScope,
  sort: { key: ReportSortKey; desc: boolean } = { key: "breaking", desc: true },
) {
  const dispatch = useAppDispatch();

  const selectEntry = useMemo(() => makeSelectReport(scope), [scope]);
  const selectSorted = useMemo(
    () => makeSelectReportSorted(scope, sort.key, sort.desc),
    [scope, sort.key, sort.desc],
  );
  const selectTotals = useMemo(() => makeSelectReportTotals(scope), [scope]);

  const entry = useAppSelector(selectEntry);
  const sorted = useAppSelector(selectSorted);
  const totals = useAppSelector(selectTotals);

  useEffect(() => {
    dispatch(fetchAgentUsageReport({ scope }));
  }, [dispatch, scope]);

  const refresh = useCallback(() => {
    dispatch(fetchAgentUsageReport({ scope, force: true }));
  }, [dispatch, scope]);

  return {
    status: entry.status,
    error: entry.error,
    rows: sorted.rows,
    adminRows: sorted.adminRows,
    totals,
    refresh,
  } as const;
}
