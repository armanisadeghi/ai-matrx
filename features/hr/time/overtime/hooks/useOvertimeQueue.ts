"use client";

/**
 * features/hr/time/overtime/hooks/useOvertimeQueue.ts — the reads behind routes 31a and 31b.
 *
 * Thin fetch-and-hold. Nothing derives a threshold, an hour or a projection: E-55 resolves those
 * server-side so the clock UI, the alerting worker and the workflow's `validate_fn` cannot disagree.
 */

import { useCallback, useEffect, useState } from "react";

import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { HrRpcError } from "../../api/rpc";
import type { OvertimePreapprovalRow, PageRequest, Paged } from "../../api/types";
import {
  evaluateOvertime,
  getOvertimePreapproval,
  listOvertimePreapprovals,
  type OvertimeEvaluation,
  type OvertimeListFilters,
} from "../api/overtimeReads";

export interface OvertimeFailure {
  code: string;
  userMessage: string;
  details: Record<string, unknown>;
}

function toFailure(err: unknown): OvertimeFailure {
  if (err instanceof HrRpcError) {
    return { code: err.code, userMessage: err.userMessage, details: err.details };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { code: "unknown_error", userMessage: message, details: {} };
}

const DEFAULT_PAGE: PageRequest = { page: 1, pageSize: 50 };

export function useOvertimeQueue(
  filters: OvertimeListFilters,
  mockCase?: HrFixtureCase,
): {
  page: Paged<OvertimePreapprovalRow> | null;
  isLoading: boolean;
  failure: OvertimeFailure | null;
  reload: () => void;
} {
  const [page, setPage] = useState<Paged<OvertimePreapprovalRow> | null>(null);
  const [failure, setFailure] = useState<OvertimeFailure | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState(0);
  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setFailure(null);
    listOvertimePreapprovals(JSON.parse(filterKey) as OvertimeListFilters, DEFAULT_PAGE, { mockCase })
      .then((next) => {
        if (!cancelled) setPage(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPage(null);
        setFailure(toFailure(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterKey, mockCase, token]);

  return { page, isLoading, failure, reload: useCallback(() => setToken((t) => t + 1), []) };
}

export function useOvertimeRequest(
  requestId: string | null,
  mockCase?: HrFixtureCase,
): {
  request: OvertimePreapprovalRow | null;
  isLoading: boolean;
  failure: OvertimeFailure | null;
  reload: () => void;
} {
  const [request, setRequest] = useState<OvertimePreapprovalRow | null>(null);
  const [failure, setFailure] = useState<OvertimeFailure | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState(0);

  useEffect(() => {
    if (!requestId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setFailure(null);
    getOvertimePreapproval(requestId, { mockCase })
      .then((next) => {
        if (!cancelled) setRequest(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setRequest(null);
        setFailure(toFailure(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [requestId, mockCase, token]);

  return { request, isLoading, failure, reload: useCallback(() => setToken((t) => t + 1), []) };
}

/**
 * E-55, for one employment. Always a PROJECTION — the caller labels it as one and never stores it.
 */
export function useOvertimeEvaluation(
  args: { organizationId: string | null; employmentId: string | null },
  mockCase?: HrFixtureCase,
): { evaluation: OvertimeEvaluation | null; isLoading: boolean; failure: OvertimeFailure | null } {
  const [evaluation, setEvaluation] = useState<OvertimeEvaluation | null>(null);
  const [failure, setFailure] = useState<OvertimeFailure | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { organizationId, employmentId } = args;

  useEffect(() => {
    if (!organizationId || !employmentId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setFailure(null);
    evaluateOvertime(
      { organizationId, employmentId, asOf: new Date().toISOString(), includeScheduled: true },
      { mockCase },
    )
      .then((next) => {
        if (!cancelled) setEvaluation(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setEvaluation(null);
        setFailure(toFailure(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [organizationId, employmentId, mockCase]);

  return { evaluation, isLoading, failure };
}
