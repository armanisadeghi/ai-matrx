/**
 * useDriftReport — dispatch-on-idle hook for the drift report rollup.
 */

"use client";

import { useEffect, useCallback, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { fetchAgentUsageReport } from "@/features/agents/redux/usages/usages.thunks";
import {
  makeSelectReport,
  makeSelectReportSorted,
  makeSelectReportTotals,
  type ReportSortKey,
} from "@/features/agents/redux/usages/usages.selectors";
import type { UsageScope } from "@/features/agents/redux/usages/usages.slice";

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
