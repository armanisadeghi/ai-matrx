"use client";

/**
 * features/hr/time/periods/hooks/usePayPeriods.ts — the reads behind routes 32 and 33.
 *
 * Every hook here is a thin fetch-and-hold over the one RPC door. No hook derives a figure, sums a
 * column or decides a rule: the counts, the states and the boundary-week ids all arrive computed.
 *
 * An `HrRpcError` is surfaced with its `userMessage` **verbatim** — the server's sentence is what a
 * person reads, because a denial that does not name what was missing is how over-tightening hides
 * (SPEC-ACCESS §4.2).
 */

import { useCallback, useEffect, useState } from "react";

import type { HrFixtureCase } from "@/features/hr/mock/transport";
import { HrRpcError } from "../../api/rpc";
import type { PageRequest, Paged, PayPeriodRow } from "../../api/types";
import {
  getPayPeriod,
  listPayPeriods,
  listTimeAdjustments,
  type PayPeriodListFilters,
  type TimeAdjustmentRow,
} from "../api/periodReads";

/** One normalized refusal. `userMessage` is the server's; never substitute a generic sentence. */
export interface PeriodFailure {
  code: string;
  userMessage: string;
  details: Record<string, unknown>;
}

function toFailure(err: unknown): PeriodFailure {
  if (err instanceof HrRpcError) {
    return { code: err.code, userMessage: err.userMessage, details: err.details };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { code: "unknown_error", userMessage: message, details: {} };
}

const EMPTY_PAGE: PageRequest = { page: 1, pageSize: 50 };

export interface UsePayPeriodsResult {
  page: Paged<PayPeriodRow> | null;
  isLoading: boolean;
  failure: PeriodFailure | null;
  reload: () => void;
}

/** Route 32. Fully paginated — LAW 3: a list treated as complete is never a capped fetch. */
export function usePayPeriods(
  filters: PayPeriodListFilters,
  page: PageRequest = EMPTY_PAGE,
  mockCase?: HrFixtureCase,
): UsePayPeriodsResult {
  const [result, setResult] = useState<Paged<PayPeriodRow> | null>(null);
  const [failure, setFailure] = useState<PeriodFailure | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState(0);

  // Serialized so an inline object literal from the caller does not re-fire every render.
  const filterKey = JSON.stringify(filters);
  const pageKey = JSON.stringify(page);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setFailure(null);
    listPayPeriods(
      JSON.parse(filterKey) as PayPeriodListFilters,
      JSON.parse(pageKey) as PageRequest,
      { mockCase },
    )
      .then((next) => {
        if (!cancelled) setResult(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setResult(null);
        setFailure(toFailure(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filterKey, pageKey, mockCase, token]);

  return { page: result, isLoading, failure, reload: useCallback(() => setToken((t) => t + 1), []) };
}

export interface UsePayPeriodResult {
  period: PayPeriodRow | null;
  isLoading: boolean;
  failure: PeriodFailure | null;
  reload: () => void;
}

/** Route 33's header. Reloaded after every transition, because the counts move with it. */
export function usePayPeriod(
  payPeriodId: string | null,
  mockCase?: HrFixtureCase,
): UsePayPeriodResult {
  const [period, setPeriod] = useState<PayPeriodRow | null>(null);
  const [failure, setFailure] = useState<PeriodFailure | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState(0);

  useEffect(() => {
    if (!payPeriodId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setFailure(null);
    getPayPeriod(payPeriodId, { mockCase })
      .then((next) => {
        if (!cancelled) setPeriod(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPeriod(null);
        setFailure(toFailure(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [payPeriodId, mockCase, token]);

  return { period, isLoading, failure, reload: useCallback(() => setToken((t) => t + 1), []) };
}

export interface UseTimeAdjustmentsResult {
  page: Paged<TimeAdjustmentRow> | null;
  isLoading: boolean;
  failure: PeriodFailure | null;
  reload: () => void;
}

/** The post-lock lane on route 33 — corrections BELONGING to this period, wherever they get paid. */
export function useTimeAdjustments(
  originalPayPeriodId: string | null,
  mockCase?: HrFixtureCase,
): UseTimeAdjustmentsResult {
  const [page, setPage] = useState<Paged<TimeAdjustmentRow> | null>(null);
  const [failure, setFailure] = useState<PeriodFailure | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [token, setToken] = useState(0);

  useEffect(() => {
    if (!originalPayPeriodId) {
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setFailure(null);
    listTimeAdjustments(originalPayPeriodId, EMPTY_PAGE, { mockCase })
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
  }, [originalPayPeriodId, mockCase, token]);

  return { page, isLoading, failure, reload: useCallback(() => setToken((t) => t + 1), []) };
}
